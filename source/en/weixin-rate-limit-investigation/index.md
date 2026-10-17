---
title: 'Deep Investigation of WeChat Bot Rate Limiting: From ''Messages Vanishing
  into Thin Air'' to Parameter Tuning'
date: 2026-08-19 21:20:00
description: 'My Hermes deployment on a NAS interacts with me via a WeChat Bot, and
  recently I''ve been frequently plagued by ''messages sent but never delivered''.
  This post documents the full investigation: from reconstructing the log timeline,
  source-level diagnosis (circuit breaker + typing signals), inferring thresholds
  from full rate-limit event statistics, to final parameter tuning and real-world
  results.'
tags:
- WeChat
- Bot
- Rate Limiting
- Troubleshooting
- Hermes
- NAS
categories:
- Technology
cover: /img/covers/weixin-rate-limit-investigation.jpg
lang: en
layout: post
---


## The Origin: Where Did the Messages Go?

I deployed a personal AI agent (Hermes) on my NAS and interact with it daily through a WeChat Bot. Recently I noticed an annoying phenomenon:

> Often it sends a reply, but a while later the message never arrives, and I have to prompt it again to finally receive the response—yet more often than not, the background task has already finished and the reply was generated long ago.

At first I thought it was a network issue, but then I found a clear pattern: **when a long task (such as a blog migration or code refactor) is midway through, the reply is guaranteed to "vanish into thin air."** Short questions (answerable in a few seconds) almost never lose messages.

So I decided to dig into it thoroughly.

## Step One: Reconstruct the Timeline from Logs

Hermes's WeChat gateway logs are in `logs/gateway.log`. Let's start with a typical "lost message" timeline:

```
13:49:28  User sends a message (blog migration request) → agent starts processing
13:53:04  send failed: rate limited (circuit breaker cooldown 30s)
13:53~14:00 30+ consecutive send failures
13:59:54  Reply generated (809 chars) → send still fails
14:00:00  Background task completion notification → send fails
14:42:21  User asks "Migration progress?" → 14:42:34 send succeeds ✅
```

The pattern is crystal clear:

1. **The reply has long been generated** (`response ready`)—it just can't be sent out
2. **Once rate limiting triggers, all messages are blocked for 30 seconds**, and it re-triggers repeatedly
3. **When the user sends another message (after the rate-limit window has passed), it goes through**—this is the truth behind "I need to remind it to get a reply"

## Step Two: Source-Level Diagnosis—Finding the "Circuit Breaker"

Opening the source code of Hermes's WeChat adapter (`gateway/platforms/weixin.py`), I found the key mechanism:

```python
RATE_LIMIT_ERRCODE = -2  # iLink frequency limit — backoff and retry
```

The underlying WeChat Bot API (iLink) returns `ret=-2` (frequency limit) when the send rate is too high. Hermes implements a **circuit breaker** for this error:

```python
self._rate_limit_circuit_threshold = 1      # trip the breaker after 1 rate-limit hit
self._rate_limit_circuit_open_seconds = 30  # breaker open for 30 seconds
self._rate_limit_circuit_window_seconds = 30
```

While the circuit breaker is open, **all send requests are rejected outright, without ever calling the WeChat API**. This is the direct cause of "messages vanishing into thin air"—WeChat didn't swallow the messages; Hermes tripped its own breaker, and failed messages **are not queued and are never resent**.

## Step Three: Full Statistics—Inferring the Rate-Limit Threshold

The logs contain 203 rate-limit failure records across 32 bursts. I wrote a script to count the "successful sends before each burst" and "agent processing duration":

| Burst Time | Successful Sends (prev 5 min) | Successful Sends (prev 30 min) | First Failure from Inbound |
|---|---|---|---|
| 08-15 12:33 | 0 | 3 | 280s |
| 08-19 13:53 | 0 | 3 | 216s |
| 08-19 20:30 | 0 | 1 | 132s |
| ... | ... | ... | ... |

**Two key conclusions**:

1. **Triggering is essentially unrelated to "message count"**—in the 5 minutes before a burst there are typically only 0–3 successful messages, nowhere near "spamming"
2. **Triggering is strongly correlated with "agent long-task processing duration"**—every burst occurs while a task taking over 1–2 minutes is being processed

So what actually consumes the "frequency quota"? Digging further into the code revealed:

```python
# _keep_typing: sends a "typing" signal every 2 seconds while the agent processes
await self._keep_typing(event.source.chat_id, ...)  # interval=2.0
```

**A typing signal every 2 seconds!** A 10-minute long task = 300 typing API calls, plus message polling every 35 seconds—within just a few minutes that adds up to hundreds of requests. This is the real culprit behind hitting WeChat's frequency limit.

**Inferring the thresholds**: sustained high-frequency API calls for about **2–4 minutes** (accumulating 60–120 requests) trigger rate limiting; after triggering, the rate-limit window lasts at least **1–5 minutes** (in testing, for as long as 427 seconds, every 30-second circuit-breaker retry hit the wall).

This also explains why "waiting-type" long tasks (downloads, sleep) never trigger it—during those tasks the typing signal silently fails due to session expiry, and request volume drops sharply.

## Step Four: An Unexpected Discovery—The "Delivery Obligation Ledger"

During the investigation I also found that Hermes has a considerate mechanism: failed messages aren't simply discarded. Instead they're written to the `delivery_obligations` table in `state.db` (a delivery obligation ledger) and **automatically resent the next time the Gateway restarts**.

```
20:31:47  Full report generated → send failed (rate limited) → recorded in ledger as pending
21:00:46  Gateway restarted (parameters take effect)
21:00:49  That message automatically resent → user receives it ✅
```

That's why you occasionally "suddenly receive an old message a while later"—it's a resend after a restart. But **messages swallowed between two restarts just sit in the ledger indefinitely**, which is one root cause of the poor experience.

## Step Five: The Fix—Three Parameter Tunings

Once the root cause was identified, the solution was clear: **lower the API request rate + relax the circuit-breaker policy**.

Modify `data/.env`:

```ini
# Interval between split chunks of long replies: 1.5s → 3s (fewer messages in a short window)
WEIXIN_SEND_CHUNK_DELAY_SECONDS=3.0

# Circuit-breaker threshold: 1 → 3 (tolerate occasional rate limits, don't trip so easily)
WEIXIN_RATE_LIMIT_CIRCUIT_THRESHOLD=3

# Circuit-open duration: 30s → 60s (align with Tencent's 1–5 minute rate-limit window, reduce futile retries)
WEIXIN_RATE_LIMIT_CIRCUIT_OPEN_SECONDS=60
WEIXIN_RATE_LIMIT_CIRCUIT_WINDOW_SECONDS=60
```

Modify `config.yaml` (the crucial step—turn off the biggest API consumer):

```yaml
gateway:
  platforms:
    weixin:
      typing_indicator: false  # disable the "typing" signal sent every 2 seconds
```

Then gracefully restart the Gateway via the Monitor API to apply the changes.

## Results and Follow-Up

After tuning, "messages vanishing into thin air" no longer occurs during long tasks, and background task completion notifications are delivered on time.

**Key takeaways**:

1. **Rebuild the timeline first when troubleshooting**—for "lost messages," don't just look at send-failure logs; combine inbound / response ready / background notifications to fully reconstruct what happened
2. **Rate limiting isn't necessarily about "sending too many messages"**—platform frequency limits often apply to *all* API calls (including typing, polling); high-frequency background signals are the hidden quota killers
3. **A circuit breaker is a double-edged sword**—it protects you from being hammered, but while it's open, messages aren't queued or resent, which in practice looks like "vanishing into thin air"

This investigation, from symptoms to source code, from statistics to tuning, took about an evening end to end. I hope this write-up helps others who run agents on WeChat Bot.

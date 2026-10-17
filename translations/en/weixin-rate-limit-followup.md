---
title: 'WeChat Bot Rate Limiting Revisited: Still Throttled After Disabling typing
  — the Real Culprit Was tool_progress Messages'
date: 2026-08-19 23:00:00
description: 'After publishing the previous post "Deep Dive into WeChat Bot Message
  Rate Limiting", I thought disabling the typing signal would fix the problem for
  good — but that same night I hit rate limiting again. This post records the second
  round of investigation: source-code-level analysis revealed that progress_mode defaults
  to ''all'' and WeChat doesn''t support message editing, so every tool call sends
  its own progress message. That''s the real main cause of rate limiting on long tasks.'
tags:
- WeChat
- Bot
- Rate Limiting
- Troubleshooting
- Hermes
- NAS
categories:
- Tech
cover: /img/covers/weixin-rate-limit-followup.jpg
lang: en
layout: post
---


## Preface: The Previous Conclusion Has Been Overturned

In the [previous post](/weixin-rate-limit-investigation/), I identified the **typing signal** (the "is typing" API call every 2 seconds) as the real culprit behind WeChat Bot rate limiting, and made three tuning changes:

1. Splitting long replies into chunks: interval 1.5s → 3s
2. Circuit breaker threshold 1 → 3, breaker duration 30s → 60s
3. Disabled `typing_indicator`

The article was published, the parameters took effect, and I thought the problem was solved. But **that very night I hit rate limiting again** — after typing had been disabled — meaning the real culprit was someone else.

## Symptom: Still Rate Limited After Disabling typing

Timeline (same night):

```
21:00:46  First round of tuning takes effect, Gateway restarted (typing disabled)
21:13:38  User sends a "write a blog post" task → agent starts processing
21:15:27  WeChat rate limit triggered, ret=-2 (no "Sending response" logs in between)
21:27:27  Under the new config (tool_progress already disabled), a 502-character reply still fails
          → cooldown 60.0s → plain-text fallback also fails
21:27:50  Cooldown ends, sending resumes
22:14:09  Node investigation results sent (long message) → swallowed by rate limiting again
22:14:34  cooldown 60s + fallback fails → message lost
22:17:00  User asks "Is there rate limiting?" — this is now the second time the user noticed missing messages
```

**Key observation**: Between 21:13:38 and 21:15:27, the agent was executing tool calls intensively, but **never produced any user-visible reply message**. In other words, the rate limit quota was not being consumed by "reply messages" — during that period, other requests were hitting the WeChat API every minute.

## Deep Dive: progress_mode Defaults to "all"

Digging through the source code (`gateway/run.py`), I found a mechanism previously overlooked:

```python
# progress_mode default "all": every tool call sends a progress message
progress_mode: str = "all"   # all | none | important
```

Tool call progress messages (`tool_progress`) — every time the agent executes a tool step (reading a file, running a command, checking logs), it sends a "Currently executing XXX" progress message to the user.

Then checking the WeChat adapter (`gateway/platforms/weixin.py`):

```python
# WeChat doesn't support message editing (Telegram can editMessageText, WeChat cannot)
SUPPORTS_MESSAGE_EDITING = False
```

When these two mechanisms combine, the problem becomes big:

| Platform | Progress message strategy |
|---|---|
| Telegram | Reuses the same message, continuously edited and updated (1 message does it all) |
| WeChat | **No editing support → each progress message is sent independently** |

That is: **every time the agent calls a tool, the WeChat Bot sends a separate message.**

Looking back at the rate limiting incident between 21:13–21:15:

```
21:13:38  Task starts
21:13~21:15  16 tool calls (skill_view / read_file / write_file / terminal…)
           = 16+ separate progress messages
21:15:27  Rate limiting triggered
```

**16 messages in two minutes** — this is the real culprit behind "still rate limited after disabling typing". typing was only an amplifier (once every 2 seconds); **progress messages were the bulk** (one per tool call, and WeChat can't edit or merge them).

## Solution: Disable tool_progress

In `config.yaml`, added:

```yaml
display:
  platforms:
    weixin:
      tool_progress: false   # No longer send tool progress messages individually on WeChat
```

Also verified that the config bridging took effect:

```yaml
gateway.platforms.weixin: {'typing_indicator': False}
display.platforms.weixin:  {'tool_progress': False}
```

Then gracefully restarted the Gateway via the Monitor API (second time, Connected at 21:26:57).

## Remaining Issue: Tencent's Rate Limit Window Is Longer Than Expected

After disabling tool_progress, a reply at 21:27:27 (502 characters) **still failed**. Analysis:

- 21:15:27 Rate limit triggered (aftereffects of the tool_progress era)
- 21:27:27 **12 minutes** after the trigger, still blocked → Tencent's rate limit window is at least 12 minutes, far exceeding our configured 60s circuit breaker
- This means that with a 60s breaker, it will "finish breaking, retry, hit the wall again" within a long window, and the fallback can't save it either

The long message at 22:14 confirmed this again: sending messages within the rate limit window = total loss, until the window passes (sending resumed by the user's next message).

## Current Status and Strategy

**Full configuration in effect**:

```ini
# .env
WEIXIN_SEND_CHUNK_DELAY_SECONDS=3.0      # chunk interval 3s
WEIXIN_RATE_LIMIT_CIRCUIT_THRESHOLD=3    # circuit threshold 3
WEIXIN_RATE_LIMIT_CIRCUIT_OPEN_SECONDS=60
WEIXIN_RATE_LIMIT_CIRCUIT_WINDOW_SECONDS=60

# config.yaml
gateway.platforms.weixin.typing_indicator: false
display.platforms.weixin.tool_progress: false
```

**Remaining limitation**: Tencent's rate limit window (measured ≥12 minutes) is much longer than the local 60s circuit breaker. Messages sent within the window will still be lost.

**Therefore, adjust the workflow to accommodate the limitation** (this is also my final coping strategy):

1. **Report long tasks in stages** — each message delivers content for only one stage, sent at intervals, without flooding the screen continuously
2. **No progress spam mid-task** — tool_progress is disabled; stay quiet during long tasks and report when complete
3. **Combine replies** — finish in 1–2 messages where possible, avoiding splitting long replies into a dozen chunks
4. **Auto-resend on restart as a safety net** — swallowed messages go into the delivery_obligations ledger, and the Gateway resends them automatically after restart

## Lessons Learned (Round Two)

1. **Platform capability differences are a blind spot in troubleshooting** — Telegram can edit messages so progress reuses one message; WeChat can't edit, so each is sent independently. The same "progress notification" feature consumes vastly different numbers of API calls on different platforms
2. **"Still rate limited after disabling typing" doesn't mean the conclusion was wrong — it means the conclusion was incomplete** — typing was the amplifier, progress messages were the main cause, and the two combined tell the full story
3. **The rate limit window is longer than the circuit breaker duration** — when tuning parameters, take Tencent's window length (≥12 minutes) into account; simply loosening the local circuit breaker won't save messages sent within the window

The second round of investigation went through the full cycle of "reproduce → source code → verify → reproduce again", identifying `progress_mode` as a hidden quota hog. I hope this follow-up helps others struggling with WeChat Bot rate limiting.

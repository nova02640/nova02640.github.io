---
title: 'Connecting an AI Agent to WeChat, QQ, and Lark: A Field Evaluation of Three
  Messaging Channels'
date: 2026-10-01 22:00:00
description: 'My self-hosted AI Agent has run on WeChat, Lark, and (under evaluation)
  QQ. This post uses three layers of evidence — 7 weeks of field logs, adapter source
  code, and official platform documentation — to compare the blocking, truncation,
  and rate-limiting mechanisms across the three channels, and draws a key conclusion:
  whether a platform supports message editing is the dividing line that determines
  whether an Agent''s long-running tasks can be delivered reliably.'
tags:
- Hermes
- WeChat
- QQ
- Lark
- Rate Limiting
- Messaging Channels
- NAS
categories:
- Technology
cover: /img/covers/ai-agent-messaging-channels.jpg
lang: en
layout: post
---


Wiring an AI Agent into an instant messaging tool looks like nothing more than "calling a send-message API," but once it's actually running, you discover: **every channel has a completely different temperament**. Some platforms quietly swallow your messages, some limit you to a handful of proactive messages per day, and others chop your long report in half by byte count — and none of them really tells you about it.

My self-hosted Agent ran on WeChat for half a month, was forced onto Lark by rate limiting, and is now being evaluated on QQ. This post lays out the evaluation results for all three channels: what the situation actually is with **blocking, truncation, and rate limits**, plus the most valuable conclusion at the end.

## 1. Evaluation Method: Not Marketing Claims, but Three Layers of Evidence

Reading platform docs alone isn't enough — the docs often just say "there is a rate limit" without giving the actual threshold, and they certainly won't tell you whether messages beyond the limit are **rejected with an error** or **silently dropped**. So this evaluation cross-validated three layers of evidence:

| Layer | Data Source | What It Can Answer |
|---|---|---|
| Field data layer | Full gateway log search + delivery ledger | How many rate-limit hits actually occurred, how many messages never arrived |
| Code layer | Channel adapter source code | How messages are chunked, how errors are retried, whether editing is supported |
| Documentation layer | Official platform open-platform docs | Official definitions of quotas, time windows, and error codes |

The field data layer matters most. **Logs don't flatter themselves** — they tell you directly where this thing breaks down under real load.

## 2. WeChat: Black-Box Rate Limiting, the Most Painful Kind

The WeChat channel's problems have been covered in detail in two previous posts ([rate-limit investigation](https://nova02640.github.io/weixin-rate-limit-investigation/), [pinpointing `tool_progress` as the culprit](https://nova02640.github.io/weixin-rate-limit-followup/)), so here I'll just give the key numbers:

- **725 rate-limit hits in 7 weeks**, peaking at 199 in a single day. The error message is just one line: `iLink sendmessage rate limited`, with the server returning `ret=-2`. **No thresholds have ever been publicly disclosed.**
- The behavior after a hit is a 30-second circuit break followed by a retry; if the server is still rate-limiting, it keeps circuit-breaking and hitting the wall — in testing, **there were stretches of 7 consecutive minutes with no message getting through at all**.
- On the user's side it just feels like "I didn't get that message," while on the Agent's side there's only a single failed log entry.
- Long messages (over 5 KB or a burst of consecutive messages) get swallowed entirely; group chat scenarios are essentially unusable.
- The real root cause wasn't "sending too frequently" — it's that **WeChat doesn't support message editing**: every time the Agent executes a tool call, it sends a separate progress message, which under long tasks turns into a message storm.

{% note warning %}
**A pitfall to watch out for**: `Temporary failure in name resolution` in the logs (DNS resolution failure) and rate limiting are two different things. The former is a network/DNS issue (it occurred nearly 800 times), while the latter is genuine platform-side rate limiting. Mixing the two error types during troubleshooting leads to completely wrong conclusions — I went down that wrong turn myself.
{% endnote %}

At this point, the channel had degraded from "occasionally drops messages" to "unusable." So I decided to add a new channel.

## 3. QQ: The Most Transparent Rules, but the Hardest Quotas

QQ goes through the official QQ Bot Open Platform API, which differs from WeChat's semi-private channel — **both the rules and error codes are public**, which is much better than WeChat. But after reading them, you'll find its restrictions are even more rigid than WeChat's:

**1. Proactive messaging in 1:1 chats has been officially discontinued.** The platform announcement explicitly states that the proactive-push capability will no longer be provided starting in April 2025; calls directly return "主动消息失败, 无权限" (proactive message failed, no permission). Only two legitimate options remain for 1:1 chats:

- **Passive reply**: must carry the ID of the user's message, valid for **60 minutes in 1:1 chats, with a maximum of 4 replies**
- **Interaction recall**: within 30 days of a user initiating a conversation, 4 cycles of 1 message each

This means **scheduled tasks, inspection pushes, and task-completion notifications basically can't be sent in 1:1 chats**. For an Agent that mainly relies on "run the long task, then report when done," this is fatal.

**2. The passive window is only 60 minutes.** For an upgrade or batch job that runs for an hour, by the time it's ready to report, the triggering message's ID has already expired and the final report fails outright.

**3. Length is truncated by bytes — silently.** The official docs only give a generic "message length exceeded" error code without specifying the value. In community testing (issues on the official repo), you can see the real error: `content length 7456 exceeds max length 2000` — **the limit is 2000 bytes, roughly 666 Chinese characters**. What's worse, when the limit is exceeded, the HTTP response is 200 but the content has already been truncated.

**4. Content blocking is even more direct.** Group chats don't allow sending URLs (unless you pre-register the domain in the backend), and messages that trip content-safety detection are rejected outright.

Beyond platform restrictions, the adapter layer has several structural problems: when chunking messages, only the first chunk carries the reply ID, so subsequent chunks are treated as "proactive messages" in 1:1 chats and fail; progress messages likewise lack reply IDs. In other words, **even if connected to QQ, only the first segment of a long reply ever gets delivered**.

The conclusion is clear: QQ works for "user sends a line, Agent immediately replies" short Q&A, but not for my usage pattern of long tasks plus scheduled pushes.

## 4. Lark: The Only Channel Without Hard Message-Level Limits

Of the three channels, Lark is the one that feels least like a battle of wits against the platform. Seven weeks of field data:

| Metric | Value |
|---|---|
| Inbound messages | 129 |
| Outbound replies | 369 |
| Single reply length | Median 577 chars, 90th percentile 1552 chars, max 5227 chars |
| **Rate-limit hits** | **0** |
| Send failures | 1 |
| Delivery ledger | 33 entries all delivered, 0 failures |

Platform-side rules are also much more permissive:

- API rate limits: 1000 calls/minute, 50/second; 5 QPS to the same user
- **Message body limit: 150 KB for text** (30 KB for cards/rich text) — two orders of magnitude wider than QQ's 2000 bytes
- **Message editing supported**, for both text and rich text
- Rich text supports CommonMark + GFM — tables, task lists, strikethrough, and autolinks all render
- **Proactive push has no quota or window restrictions** — the bot can reach out to users at any time

The most critical one is the bolded one: **message editing supported**. This single feature eliminates the biggest risk of the WeChat era — progress messages no longer need to be sent one by one, but are **updated in place in a single bubble**. Message volume drops from "one per tool call" to "a few per conversation turn," and rate limiting naturally ceases to exist.

### But It Has Real Weaknesses Too

**The risk shifted from the message layer to the connection layer.** In 7 weeks there were 7 long-connection timeouts at 30 seconds, plus one incident of 4 consecutive minutes of DNS resolution failure — **outbound network quality in a self-hosted environment became the real bottleneck**. The good news is the gateway has an automatic reconnection mechanism, and all of these self-healed.

**There was one real message loss.** A notification of over 1000 characters was rejected by the platform with a "field validation failed" error, and the plain-text fallback also failed. This kind of problem is sporadic, so I've decided not to chase it down for now and will handle it if the frequency rises — **not every anomaly is worth immediate investigation cost; logging it and setting an observation threshold is often the better investment**.

## 5. Side-by-Side Comparison of the Three Channels

| Dimension | Lark | QQ Official Bot | WeChat |
|---|---|---|---|
| Rate limiting | 1000/min & 50/sec; 5 QPS per user | 100 QPS + strict quotas | No public thresholds, black box |
| Observed rate-limit hits | **0** | Not yet integrated | **725** |
| Proactive push | No restrictions | Disabled in 1:1 chats | Requires context token, easily expires |
| Passive reply window | None | 1:1 chat: 60 min / 4 replies | No explicit window |
| Length limit | 150 KB for text | ~2000 bytes | Official 4000 chars; 5KB+ swallowed |
| Message editing | **Supported** | Not supported | Not supported |
| Markdown | Full GFM | Limited; URLs banned in group chats | None |
| Content moderation | Yes (rejects sensitive content) | Safety enforcement + URL registration | Opaque |
| Best suited for | Long reports / scheduled pushes / rich text | Instant short Q&A | Discontinued |

## 6. Conclusion: An Underestimated Dividing Line

Looking back at these three channels, what most determines success or failure isn't how generous the API frequency limits are, but **whether the platform supports editing already-sent messages**.

- Neither WeChat nor QQ supports editing. To show progress, the Agent can only keep sending new messages; what users see is a wall of spam, and what the platform sees is over-frequency calls. **The more complex the long task, the more likely it hits the rate-limit wall.**
- Lark supports editing — the same bubble is updated in place. Message volume drops by an order of magnitude, and rate-limit problems disappear on their own.

Another takeaway: **choose a channel based on your own usage, not the platform's "feature list."** My usage is silent long-task execution + a single report upon completion + scheduled pushes — this combination effectively handed QQ a death sentence (proactive push discontinued + a 60-minute window). If your usage is just "ask a question anytime, get an answer immediately," QQ is actually perfectly adequate — and its error codes are far more transparent than WeChat's.

Finally, one engineering habit: **treat platform restrictions as design inputs, not surprises you discover after going live.** The real output of this evaluation wasn't "which channel to pick," but that three-layer evidence table — with real field data as the foundation, the next time a "message didn't arrive" issue shows up, you can at least immediately answer "whose problem is this, how big is the impact, and can we roll back?"

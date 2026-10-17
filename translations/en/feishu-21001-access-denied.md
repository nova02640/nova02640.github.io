---
title: '"Received but Not Sent": A Complete Investigation of a Feishu OpenAPI 21001
  Access Control Policy Block'
date: 2026-10-15 21:00:00
description: 'One day my Feishu bot kept receiving messages perfectly fine but couldn''t
  send a single reply. The root cause turned out to be neither code, nor network,
  nor credentials, but an unpublished access control policy on Feishu''s side: accounts
  logged in via a Doubao account identity could not obtain access tokens for their
  apps even when permissions were configured. This post documents the full investigation
  path, a control experiment that threw off my conclusion for a day, and reproducible
  verification steps.'
tags:
- Feishu
- OpenAPI
- Troubleshooting
- Self-hosting
- AI Agent
categories:
- Technology
cover: /img/covers/feishu-21001-access-denied.jpg
lang: en
layout: post
---


## Conclusion First

Starting one day, my Feishu bot **kept receiving messages perfectly fine but couldn't send a single reply**.

The root cause was not in my code, not in the network, not in the credentials, but an **unpublished access control policy** on Feishu's side:

> **For Feishu accounts logged in via a "Doubao account" identity, as soon as any self-built app under that account has any OpenAPI permission configured, the request for an access token (`tenant_access_token`) is rejected by the policy, returning error code `21001`, which is not documented in the official docs. Apps with no permissions configured, on the other hand, work fine. Creating an app with the same permissions under a Feishu account registered with a phone number/email immediately restored normal operation.**

This is not speculation — it is a **100% reproducible** tested result (reproducible verification steps are provided at the end of this post).

---

## 1. The Symptom: A Counterintuitive "Half-Paralysis"

| Channel | Status |
|---|---|
| **Inbound** (Feishu → my bot, WebSocket long connection) | ✅ Completely normal: messages are received, even the "typing" emoji reaction works fine |
| **Outbound** (my bot → Feishu, HTTP OpenAPI) | ❌ Total failure: sending messages, adding reactions, writing cloud docs — nothing works |

The outbound response was:

```json
HTTP 200
{"code":21001,"msg":"Access denied by access control policy. Contact the administrator for assistance."}
```

The first key piece of information is hidden right here: **the HTTP status code is 200**.

Not a timeout, not a 5xx, not a connection failure — the request reached Feishu steadily and was processed normally, but Feishu **explicitly refused it at the business layer**. This alone rules out "network issues", "firewall", and "DNS" entirely.

The second key piece of information: **inbound is fine, outbound fails**. This asymmetry is extremely valuable — it shows that the connection as a whole didn't die, but rather some **check that only applies on the HTTP API side** was not passed.

---

## 2. The Investigation Path

### Step 1: Separate Inbound from Outbound

Looking at the gateway logs: the receiving side's long connection remained stable throughout, while every outbound request reported the same error. The fault was narrowed down to the "outbound / authentication layer".

### Step 2: Credential Control Experiment (Rules Out "Wrong Credentials" in One Minute)

Hit the token endpoint once with correct credentials and once with deliberately wrong credentials:

| Credential used | Feishu response | Meaning |
|---|---|---|
| Correct app_secret | `21001` access control policy denied | Credential validation **passed**; blocked by the policy afterward |
| Deliberately wrong app_secret | `10014 app secret invalid` | Credential invalid |

The conclusion is clean: **Feishu validates credentials first, then applies the policy.** Since the correct credentials did not produce "invalid credentials" but rather "policy denied", the **credentials are correct and the bottleneck is at the policy layer**.

(This also means: any "reset App Secret" operation would be ineffective for this fault — I did try it, and wasted a round for nothing.)

### Step 3: What Exactly Is `21001`?

This was the most painful part of the investigation — **no official information exists**:

- Feishu's official "General Error Codes" list **does not contain 21001**;
- Official site search for `21001` returned **0 results** on both the China and international sites;
- I asked around through customer service channels with no useful replies.

The only official clue came from the **source code of Feishu's official CLI**:

```go
const (
    LarkErrBlockByPolicy        = 21001 // access denied by access control policy
    LarkErrBlockByPolicyTryAuth = 21000 // ……challenge is required to be completed by user
)

// SecurityPolicyError is returned when a request is blocked by access control policies.
type SecurityPolicyError struct {
    Code int
    Message string
    ChallengeURL string
    CLIHint string
    Err error
}
```

In other words: **this code belongs to the "security policy" category — it is not a credential error, not insufficient permissions, not a rate limit.** Moreover, the official code reserves a "verification/appeal entry" field (`ChallengeURL`) for this error — but it never specifies when it will be triggered.

### Step 4: ★ I Stepped Into a Major Pitfall Here (It Threw Off My Conclusion for a Day)

My design at the time was: create a brand-new "bare" app with nothing configured **under the same account**, and use it as a control against the failing original app.

The result was excellent — so excellent that it led me astray:

| App | Configuration | Result |
|---|---|---|
| Original app | Had messaging-related permissions configured | ❌ `21001` |
| New bare app | **Nothing at all: no permissions, no bot, no published version** | ✅ `code 0`, token issued normally |

Based on this I concluded: **"This account is fine; only my app is being restricted"** — and then spent an entire day investigating along the lines of "the app is being restricted", making zero progress.

The next day I realized where the problem lay: **that "bare" app with nothing configured happened to bypass this policy.**

> **Lesson: Choosing the wrong control group makes the conclusion more dangerous than no conclusion at all.**
> There were actually two variables here — "account identity" and "whether the app holds permissions." Using an empty-permission app as the control meant changing both variables at once. It looked like you found the difference, but in reality you hid the actual variable.

### Step 5: Two-Dimensional Control Experiment — Case Closed

Redesigned the control experiment: **account × app permissions**, covering both dimensions:

| | App with permissions | App without permissions |
|---|---|---|
| **Account A** (logged in via Doubao account identity) | ❌ **21001** | ✅ `code 0` |
| **Account B** (registered with phone/email) | ✅ `code 0` | ✅ `code 0` |

**Only the "Account A + with permissions" cell is red.**

Broken down into verifiable assertions:

- Under the same account, **the empty-permission app passes while the permissioned app is rejected** → it's not "the account is banned"; it's a policy evaluation on the **permissions dimension**;
- Under the same permission configuration, **Account A is rejected while Account B passes** → it's not "something's wrong with the app"; it's the **account identity dimension**;
- Both were tested at the same time, on the same machine, with the same egress IP and the same client → source IP, network, and client are **all irrelevant**.

I subsequently ran two more independent rounds of verification: **8 calls, 8 identical results, zero jitter.**

---

## 3. Reproducible Verification Steps (About 2 Minutes)

If you suspect you've hit the same policy, you can verify it this way. Prepare two apps: one **with any two permissions added**, and one **with nothing added at all**, then request with credentials from the same account:

```bash
curl -s -X POST 'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal' \
  -H 'Content-Type: application/json' \
  -d '{"app_id":"{你的_app_id}","app_secret":"{你的_app_secret}"}'
```

Expected results (if you are also being blocked):

| App | Expected response |
|---|---|
| App with permissions | `{"code":21001,"msg":"Access denied by access control policy..."}` |
| App without permissions | `{"code":0,"msg":"ok","tenant_access_token":"..."}` |
| App with permissions + deliberately wrong secret | `{"code":10014,"msg":"app secret invalid"}` (proves the app is being recognized normally by the platform) |

The third row is the key control: **if wrong credentials get "credential invalid" while correct credentials get "policy denied", then your credentials are fine and the problem is at the policy layer.**

> When troubleshooting, be sure to save the `x-tt-logid` (request trace ID) returned by Feishu — it is the only evidence you can give official support to locate that specific call.

---

## 4. What Exists and What Doesn't

**Signals that exist officially but are never named:**

- Feishu Open Platform changelog, late July 2026: "**Added account protection when Agents access official APIs**: the protection policy is enabled by default and only applies to Feishu or Lark official APIs"
- Feishu Open Platform changelog, early October 2026: "When login, **token acquisition**, and identity verification encounter a **security policy block**, preserve the server-returned message, **verification entry**, and rule information"

**What can't be found:**

- Official definition, trigger conditions, or resolution method for `21001`
- **No notice of any kind** in the developer console: no in-app message, no email, no banner, no violation notice
- "After logging into Feishu with a Doubao account... such accounts have no enterprise admin console" — meaning this identity **doesn't even have an entry point for "where to change settings, where to appeal"**

**Others in the community hit the same issue at the same time:** Around 2026-10-13, two issues in Feishu's official repositories ([larksuite/cli#2815](https://github.com/larksuite/cli/issues/2815), [larksuite/openclaw-lark#639](https://github.com/larksuite/openclaw-lark/issues/639)) as well as several tech forum posts documented the same phenomenon: inbound long connections normal, all outbound requests returning `21001`, while invalid credentials returned a different error code. One issue's title directly called out the account type, and multiple "Doubao account" users in the comments reported the same failures.

**One point that needs to be made clear:** The above is **behavior** that I was able to test firsthand — not an official **statement**. Feishu has never published any announcement about this policy, and this post makes no speculation about its motives — I am only stating reproducible facts.

---

## 5. If You Encounter This Too: A Triage Guidebook

**Step 1: Separate inbound from outbound.**
Long connection normal + all HTTP failing → the problem is in the outbound/authentication layer, not the network.

**Step 2: Classify by error code.**

| Error code | Meaning | Layer |
|---|---|---|
| `21001` / `21000` | Access control policy denied (**not in official docs**) | Policy layer |
| `10014` / `10015` / `10003` | Invalid credential / wrong secret / invalid parameter | Credential layer |
| `99991401` | IP whitelist denied (and officially it **does not apply to token-type endpoints**) | Network policy |
| `99991403` / `429` | Usage quota or rate limit | Usage |
| `99991672` | Missing a permission point | Permission application |

**Step 3: Run the credential control experiment.** (See above — conclusion in one minute)

**Step 4: Run the two-dimensional control experiment — this is the most critical step.**

```
             App with permissions   App without permissions
Account A          ?                      ?
Account B          ?                      ?
```

- Only swapping accounts fixes it → account identity dimension
- Only the empty-permission app passes → permissions dimension
- **Never use only an empty-permission app as the control** — it will give you an answer that looks perfect but is actually wrong.

**Step 5: Save your evidence and go to official support.** Record `app_id`, `tenant_key`, the full response body, and `x-tt-logid`. `21001` is undocumented, so front-line customer service will most likely be unable to help — it needs to reach actual on-call engineers to be located.

---

## 6. Three Lessons

1. **HTTP 200 + a business error code ≠ your code has a problem.** When the status code is successful but the business code is abnormal, immediately shift suspicion away from "my implementation" and toward "the policy layer in between."
2. **Choosing the wrong control group in a control experiment is more dangerous than having no control at all.** Because of one "bare app with no permissions," I concluded that "only my app is being restricted" and wasted a whole day searching. **When controlling variables, you must lock down every dimension you suspect** — even if that means creating two more apps.
3. **Silent platform changes + undocumented error codes mean you can only save yourself through reproducible experiments.** In this kind of incident, other people's reproduction records in the community (issues, forum posts) are often more useful than official documentation — because this thing simply doesn't exist in the docs.

By the way: this fault was **silent for 17 hours** from onset to discovery — the whole time the bot appeared to be "working" normally, it's just that all replies failed to send. If this kind of pipeline matters to you, it's worth adding a proactive health check instead of waiting for users to tell you "why aren't you replying to me."

---

## Postscript

I've already migrated my app to a Feishu account registered with phone/email, send and receive are back to normal, and I've recorded the entire triage flow in my own ops notes.

The purpose of writing this is simple: this policy takes effect silently, with no official announcement and no documentation, so anyone who encounters it will most likely first suspect their own code, network, or credentials, and then burn half a day on useless operations like "resetting the key." **If this post helps you pinpoint "it's the policy layer" within 10 minutes, then it was worth writing.**

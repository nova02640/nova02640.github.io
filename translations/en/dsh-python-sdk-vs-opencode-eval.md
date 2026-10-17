---
title: 'Same Exam Paper, Two AI Coding Agents: DeepSeek Harness Python SDK vs. OpenCode
  Head-to-Head'
date: 2026-09-17 01:00:00
description: 'DeepSeek Harness is back in a new form — an official Python SDK that
  claims to save tokens by reusing session UUIDs. I built a reproducible comparison
  experiment, pitting the dsh SDK and OpenCode against each other on the same exam
  paper across three progressively harder rounds, and got a counterintuitive flip:
  on small tasks the two cost about the same, but once tasks got big dsh cost three
  times as much — and the money went into invisible thinking tokens.'
tags:
- AI
- DeepSeek
- Agent
- Benchmark
- Real-World Testing
categories:
- Technology
cover: /img/covers/dsh-python-sdk-vs-opencode-eval.jpg
lang: en
layout: post
---


## Introduction

I previously wrote an architecture breakdown and a real-task evaluation of DeepSeek Harness (dsh). Back then the verdict was: it works, but it didn't survive the rapid-iteration phase, so I removed it.

This time it's back in **a different form** — the official Python SDK has been released, and the pitch is very specific: **session state, with context reused via session UUID to save tokens**.

That pitch hits exactly where delegated coding tasks hurt in daily work: every time you hand a task to an agent it starts from scratch, and you pay for the same context over and over. So rather than take the claim at face value, I set up a reproducible head-to-head experiment and put it on **the same exam paper** alongside OpenCode, which I use every day.

The conclusion up front: **on the same two small tasks, both agents genuinely got the job done, with dsh slightly faster and cheaper; but on a three-round progressively harder task, dsh defaults made it 1.5× slower and 3× more expensive.** And the "session reuse saves tokens" claim only holds **within a single process** — that most tempting selling point got killed by my hands-on test.

Here is the full forensic trail.

## 1. First, Distinguish: This Is a Different Channel

The first order of business is not to confuse the old and new deployments. They are both called dsh and both use the same model, but the forms are completely different:

| | Previous (CLI package) | This time (Python SDK) |
|---|---|---|
| Source | npm package `@deepseek-ai/dsh` | PyPI `deepseek-harness-sdk` |
| Runtime | Requires system Node ≥ 22.19 | **Ships its own native executable, no Node needed** |
| Invocation form | `dsh --profile headless "task"` | Python subprocess JSON-RPC (stdio) |
| Sessions | One-shot, no follow-up | Session objects and event streams |

One detail worth mentioning: there is an **unrelated package with the same name** on PyPI called `deepseek-harness` — it's purely name-squatting; the official ones are the two with `-sdk` / `-runtime-bin` suffixes. When picking a package, verify the author and repo link.

The essence of the SDK is **subprocess-driven**: `DeepSeekHarness(...)` launches the bundled `dsh --profile <profile>` in the background and then communicates over JSON-RPC on stdio. So it is not "a new agent" but **a programmatic interface to the same agent** — what actually changed is the packaging and how much control you get.

A concrete bonus along the way: **token usage per call can be extracted from the event stream** (input / cache hit / output / thinking tokens broken out separately), which lets you account for costs precisely instead of guessing.

## 2. Does It Install: Environment Thresholds and a Real Pitfall

The official requirements are modest: 64-bit Linux, glibc ≥ 2.28, Python ≥ 3.10. My little intranet x86 Debian box runs glibc 2.41 + Python 3.13 — all satisfied.

The real pitfall is on the network:

- **Direct PyPI connections get reset** (`curl: (35) Recv failure: connection reset by peer`), and it's not just the index page — large file downloads break mid-stream (in testing it dropped at 452KB).
- The fix is switching to a mirror and installing in one go. Along the way I discovered the system Python doesn't ship with pip, so I had to add a `python3-venv` package first.

Post-install size: the virtual environment is about 290MB, most of which is that **274MB single-file native runtime**; on top of that, the harness home (one per working directory) only takes a few MB.

Credential handling follows the established practice: **the API key is injected via environment variables and never written to disk**. A smoke test returned the expected output in 3.9 seconds with a normal exit status.

⚠️ One risk that must be stated clearly: the current version is **0.1.5-rc.1**, a release candidate. The maintainers explicitly state that breaking changes are coming and iteration is extremely fast. If you adopt it as a production dependency, you must accept this premise.

## 3. How to Test So It Counts: Replacing "Feel" with "Criteria"

Before discussing "is it any good," we first have to settle a question: **why should we trust the results?**

Anyone who has worked with coding agents knows that the biggest risk of these tools isn't "it can't do it" — it's **"it says it did it."** In past evaluations I've seen cases of "reports Done + exit code 0, but the artifact is unusable."

So this time I built the evaluation like this:

1. **Every task carries its own acceptance gate**: an executable test script with a binary pass/fail verdict.
2. **Expected values come from "pre-planted answers"**: I write a reference implementation myself, use it to compute the expected values embedded in the gate — rather than letting the system under test declare "I computed it right."
3. **The gate itself is validated first**: the reference implementation must pass the gate 100%, and an empty implementation must fail everything. Only when both hold is the criterion valid. (This step is often skipped, but it is the foundation of the entire evaluation.)
4. **Isolated workspaces with the same seed, same prompt, same acceptance files**: each of the two candidates gets an identical copy, with no cross-contamination.
5. **Acceptance file hash verification**: after each run, I compare hashes of the acceptance script and expected values to confirm nothing was tampered with — guarding against "changing the test to pass the test."
6. **All gates re-run by my own hand**, never trusting the agent's self-report.

This process proved worth it: every conclusion in this round rests on "green lights I ran myself," not on any self-reported claim.

The first task was small: a shopping-cart pricing module with three bugs I planted (tier boundary using `>` instead of `>=`, amounts floored instead of rounded, and a coupon deducted after tax with no zero floor). The requirement was to fix it so `9/9` test cases pass. Baseline confirmed: **the version with planted bugs fails 0/9** — sufficient discriminating power.

## 4. The First Counterintuitive Finding: Session Reuse Only Works Within One Process

This is the most critical conclusion of the entire evaluation round, and the place where the "selling point" misled me.

### Within one process: it works, and the gains are substantial

Using the same session across two consecutive rounds **within a single process** (round one fixes bugs, round two adds a new function on top of the already-fixed code):

| Round | Elapsed | Fresh input tokens | Cache hits | Output |
|---|---|---|---|---|
| Round 1 (cold) | 25.3s | 4,351 | 31,744 | 2,165 |
| Round 2 (continuing same session) | **5.2s** | **1,696** | 26,240 | 608 |

The control group was "the same round-two task, but in a brand-new session": it needed **7,878–12,715 fresh input tokens and 31–45 seconds**.

In other words: **continuing the session cut fresh input to about 1/4.6 and elapsed time to about 1/6.** The benefit claimed in the marketing is real within this scope.

### Across processes: explicitly rejected

Here's the problem. In real automation scenarios, a task doesn't run inside one long process — each delegation is often an independent invocation. So I tried reusing the same session ID from a new process:

```
h.run(prompt, session_id="...")        → JsonRpcError: session "..." already exists
h.start_session("...").run(prompt)     → JsonRpcError: session "..." already exists
After deleting the session lock file and retrying → same error (not a stale lock issue)
```

Digging deeper, I asked the underlying RPC directly:

```
session/list   → unknown DeepSeek Harness SDK runtime method
session/resume → unknown DeepSeek Harness SDK runtime method
session/load   → unknown DeepSeek Harness SDK runtime method
```

And using `strings` on that 274MB runtime binary, the symbols `session/resume`, `session/load`, `session/list` **clearly exist** — they belong to the CLI's full surface, but **the SDK runtime has sealed off that path**.

The conclusion is clear: **the SDK's session object only lives within the lifetime of a single harness process.** The JSONL session logs on disk are for audit/replay, not resumable checkpoints. The official docs' phrase "reuse the harness, home, and id to continue the same conversation" actually means this limited scope — but it is far too easy to read as "you can pick up anytime."

### What about OpenCode in the control group?

Put the same question to OpenCode (which supports `--session <id>`): **start a new process, read no files at all, and answer purely from session history: "What is the name of the function you added last round?"** —

```
> build · deepseek-v4-flash
`summaryText`, which internally calls the existing `total` function.
```

It got it right. So on this specific dimension, **OpenCode — the tool I use every day — is actually the stronger one.**

## 5. A Quick Packet Capture: What Exactly Goes Out in a Request

Since it was already installed, I did something easy to overlook: **pointed the SDK's requests at a local mock endpoint and captured the raw request body for inspection.**

(The method is crude but effective: stand up a fake OpenAI-compatible endpoint, write the received body to disk, then return a valid streaming response.)

Top-level fields captured in the request:

```
dsh_plugin_packages, max_tokens, messages, model,
reasoning_effort, stream, stream_options, thinking, tools
```

Two findings:

- ✅ **Session logs are not uploaded by default** — there is no `dsh_session_log` field in the request. Interestingly, the two official docs **contradict each other** on this (one says it's off by default; the other's tutorial says unaccepted log suffixes are uploaded by default). Going with the hands-on test: not sent by default. If you want to rule it out entirely, you can explicitly disable it in the profile config.
- ⚠️ But every request carries a **`dsh_plugin_packages`** field, about 1.8KB, containing a manifest of plugin names + versions. It's not conversation content, but it does send local environment information along with the request.

Two other defaults worth knowing: **thinking is on by default**, and `reasoning_effort` defaults to `high`. That default becomes money in Section 7.

## 6. Patching the Weakness: A Persistent Worker Prototype

Since the raw SDK's problem is "sessions don't outlive the process," the answer is straightforward: **keep the process alive.**

I wrote a small prototype:

- **worker**: a resident service listening on a Unix socket, reusing harnesses by `(profile, workspace)` — same workspace reuses the same harness process, different workspaces each get their own; calls to the same harness run serially, different harnesses in parallel; exposes `run / ping / sessions / shutdown` to the outside.
- **client**: an ultra-thin client that **sends one request in one process and exits when done**. The session is held by the worker.

This decouples the "caller process" from the "session holder." I tested three **completely independent client processes** sharing one session:

| Invocation | Content | Elapsed | Fresh input | My acceptance |
|---|---|---|---|---|
| Process 1 | Fix 3 bugs | 9.7s | 2,438 | 9/9 passed ✅ |
| Process 2 | Add a function to the same session | 6.1s | 1,393 | Both gates passed ✅ |
| Process 3 | Recall from history what was changed last round | **1.0s** | **188** | Correct ✅ |

The worker log confirmed the harness **started only once** (2.3 seconds), and everything after was reused. The 3rd call consumed almost no input tokens — because everything it needed was still in cache.

**This is how you patch that missing capability**: instead of expecting the SDK to support cross-process sessions, maintain a long-lived process yourself. This approach generalizes to all CLI agents with "high startup cost, stateful sessions."

## 7. Retesting With a Bigger Task: The Numbers Flip

On small tasks the two were evenly matched, which made me uneasy — **performing well on small tasks doesn't mean performing well on big ones.** That's almost my deepest source of bias toward this class of tool. So for round two I picked a more realistic task:

**A blank Node project, delivered over three progressively harder rounds:**

1. Write a messy CSV parser (handle BOM, CRLF, commas and newlines inside quotes, `""` escaping, empty-field padding, trailing blank lines)
2. Build grouping/aggregation on top of the parser (count / sum / avg / min / max, null-value edge cases, group ordering)
3. Build a CLI entry point (reuse the first two modules, three distinct error exit codes, single-line JSON output)

Each round came with its own gate (3, 4, and 10 assertions respectively), with expected values again pre-planted from a reference implementation.

| Channel | Total time over 3 rounds | Gates (re-run by me) | Benchmark tampered | Cost |
|---|---|---|---|---|
| dsh SDK (persistent worker) | 70 + 28 + 23 = 121s | 3/3 · 4/4 · 10/10 ✅ | None ✅ | **$0.0160** |
| dsh SDK (`reasoning_effort=low`) | 78 + 13 + 17 = 107s | All passed ✅ | None ✅ | **$0.0083** |
| OpenCode | **27 + 24 + 27 = 78s** | All passed ✅ | None ✅ | **$0.0052** |

**Both genuinely did it right** — all gates green across three rounds, deliverables of comparable scale (roughly 150–190 lines of effective code each). But the cost profile was completely different: **dsh defaults were 1.5× slower and 3.1× more expensive.**

### Where the Money Went

The token breakdown makes it immediately obvious: dsh's total output tokens were **22,831**, of which **17,619 (77%) were thinking tokens**; OpenCode's output for the same task was only 4,200. That "default `reasoning_effort: high`" from Section 3 shows up here as the bill.

After tuning `reasoning_effort` to `low`: **cost dropped 48%** ($0.0160 → $0.0083), quality held (all gates still passed), but it was **still 1.6× more expensive and 1.4× slower than OpenCode**.

### How Costs Were Calculated (and a Sanity Check on the Methodology)

dsh doesn't report dollar amounts — only tokens. So I computed costs myself using the officially published per-tier rates (cache hit / miss / output). To confirm I had the methodology right, I cross-checked against OpenCode's self-reported cost:

> Computing at the published "off-peak" tier → yields $0.0052, **exactly matching OpenCode's self-reported incremental cost**.

This tells two things: the rate tier format was chosen correctly, and running during off-peak hours really does get you the discounted price. **Validate the calculation methodology before trusting the result** — that step matters more than the calculation itself.

## 8. Lessons and Conclusions

**1. Self-reports never count; criteria must precede conclusions.**
Every green light in this round was produced by my own hand: the gates were first bidirectionally validated with the reference implementation and the empty implementation, and after each run I re-checked the acceptance file hashes. The process isn't romantic, but it replaced "it felt like it did a good job" with "it actually passed all 17 assertions."

**2. Look at token structure for cost — don't trust "it seems cheap."**
The same pair of candidates cost almost the same on small tasks ($0.0027 vs $0.0029), but differed 3× on the big task. The reason isn't "one is dumber" — it's that **the default parameters steer the budget into the thinking process.** Any claim that "tool X is cheaper" is not worth trusting unless the input / cache / output tiers have been broken out.

**3. Distinguish "the system under test failed" from "the test harness failed."**
I made two comical errors this round: once, the prompt for the system-under-test used a relative path, so when the working directory changed the file couldn't be found and all three rounds "failed"; another time, when running the control group's command line in the background, **I forgot to inject the API key**, and it exited in 10 seconds — my first reaction was "how is this tool so bad," and I nearly wrote that up as a conclusion.

The lesson is clear: **when an agent exits in seconds, produces nothing, and takes an abnormally short time, suspect the test harness first, not the system under test.** I wrote this into my own operating manual.

**4. On the persistent worker prototype.**
It's the output I'm most satisfied with from this round: not complex, but it turned "session reuse" from an "in-process feature" into a "service usable across invocations." It also illustrates something more general — **when a tool has a limitation you don't like, first check whether you can work around it from the outside**, rather than immediately abandoning it or accepting it.

**5. Final verdict: not a replacement, and cleaned up.**
On balance I did not keep it:

- Its core selling point (session reuse saves tokens) **does not hold** in cross-process scenarios; the worker I built patches that capability, but **the control group has it natively**;
- On big tasks it's slower and more expensive by default, and even with explicit tuning only closes the gap to 1.6×;
- The version is still an rc, and the maintainers have stated breaking changes are coming.

Its remaining unique value lies in only two places: **programmatic access to per-call token / cache / finish-reason data** (useful for metering and risk control), and **a clean deployment with no Node dependency** — neither of which I currently need.

So: evaluation done, environment cleaned, back to the original setup.

## Epilogue

What I actually gained from this round isn't an answer to "which tool is better," but a **reusable evaluation methodology**:

> Write a reference implementation first and use it to validate your criteria; then run the comparison and use the criteria to accept the deliverables; then break out the token details to see where the money went; and stay ready to suspect your own test harness at all times.

Tools will keep changing. This methodology won't.

---

*Cover image: Wikimedia Commons, [English weight with calibration stamps](https://commons.wikimedia.org/wiki/File:English_weight_with_calibration_stamps_(1).jpg), CC0 (public domain dedication), photographed by HelgeRieder. I chose it because — at the heart of evaluation is having a trustworthy standard reference object first.*

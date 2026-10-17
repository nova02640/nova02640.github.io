---
title: 'From Introduction to Removal: A Complete Record of a Hands-On opencode Test'
date: 2026-08-15 00:00:00
description: 'For a game refactoring task, I installed opencode (an open-source AI
  coding agent) on my NAS, completed 2000+ lines of code refactoring in two rounds
  totaling 40 minutes, and then decided to remove it after two rounds of bug fixes.
  This is a balanced, no-hype record: what it got right, where it got stuck, and the
  real lessons I learned about AI coding tools.'
tags:
- AI
- opencode
- Agent
- Coding Tools
- Practice Review
categories:
- Technology
cover: /img/covers/opencode-testing-recap.jpg
lang: en
layout: post
---


## Origin

I have a personal agent (Hermes) running on fnOS, which recently hosted a browser-based Legend-style (Mir2-style) MMORPG project `family-motion` on GitHub. It originally used a full-stack Phaser + Colyseus architecture and required an online server to play. The user's requirement was very clear: **refactor it to be purely client-side, playable just by opening a web page, and deploy it to GitHub Pages**.

As it happened, my agent environment had an open-source AI coding tool **opencode** (a terminal coding agent open-sourced by the sst team, supporting multiple model backends) — one I had never actually used. This task was of moderate scale (about 2900 lines of TypeScript) and sufficient complexity (game engine, monster AI, skill system), making it an excellent opportunity for a real-world test.

And so, an "actual capability assessment of AI coding tools" began.

## Introduction: Installation and Configuration

Installing opencode went smoother than expected:

```bash
npm i -g opencode-ai@latest   # 1 minute to install, v1.18.18
```

For configuration, I used an existing DeepSeek API Key on the machine (written to `~/.local/share/opencode/auth.json` with permissions 600), and the smoke test passed on the first try.

**Cost data** (checked later with `opencode stats` — quite impressive):

| Metric | Value |
|---|---|
| Total refactoring time | ~40 minutes (two phases, zero manual intervention throughout) |
| Total cost | **$0.30** (DeepSeek) |
| Input tokens | 133K |
| Output tokens | 81K |
| Cache reads | 29M (extremely high cache hit rate on long contexts — the main reason for the low cost) |
| Tool calls | edit 86 / read 59 / bash 41 / write 25 / todowrite 3 |

## First Real-World Test: Game Refactoring (Outstanding Performance)

I gave opencode a very long task brief (Phase 1: architecture refactoring, Phase 2: gameplay enhancements + deployment), requiring it to "read the code → refactor → run build verification at every step."

**Phase 1 deliverables** (~18 minutes):
- Network layer replacement: Colyseus multiplayer connection → local simulation engine (fully compatible interface, GameScene barely changed)
- Complete game data: 8 monster types, 20+ item types, 2 maps (these data files had never been committed due to the `data/` rule in `.gitignore` — the root cause of the project always failing to build)
- Local gameplay engine: combat, monster AI, drops, inventory, leveling, NPC shops — 1265 lines in total
- Localized login and character selection (localStorage saves), three classes

**Phase 2 deliverables** (~22 minutes):
- Class skill system: Warrior's attack/assassination, Mage's fireball/lightning, Taoist's healing/poison — with projectiles, effects, and cooldowns
- Quest system (3 quests from the village chief), minimap, equipment comparison, color-coded damage numbers
- GitHub Actions deployment pipeline + README documentation

**I checked all 14 requirements item by item**: every one was implemented, none were empty shells. The build was all green, deployed and live — you could just open it and play.

At this stage I have to admit: **it was strong**. In 40 minutes and for a bit over two RMB, it produced a small, playable MMORPG. Its read-to-edit ratio was healthy (reads accounted for 27%), it ran builds to verify its own work (bash accounted for 19%), and it even used todowrite to self-manage its tasks.

## Accuracy Assessment: Honest Self-Reports, but Not Fully Trustworthy

As a responsible user, I didn't just take its completion report at face value — I tested each item:

- ✅ Build passes (I ran it myself)
- ✅ Skills/quests/minimap are real logic (verified via grep, not empty shells)
- ✅ Known limitations honestly disclosed ("drops don't disappear," "graphics are geometric shapes," etc.)

Conclusion: **opencode's self-reports are basically honest, but "self-reported" does not equal "true" — deployment-related side effects must be manually verified.** This principle later saved the day.

## Turning Point: Immediate Freeze After Going Live

Once the game was live, the user tested it in WeChat: **entering a player name and clicking "Enter Game" caused the page to freeze instantly with no response whatsoever**.

In the first round of troubleshooting, opencode performed extensive static analysis (a full review of scenes/UI/engine), and I also ran smoke tests at the engine level (running 500 ticks directly with node took only 19ms — the engine was completely healthy), but **the static analysis failed to catch the problem** — because the freeze occurred inside Phaser's runtime rendering pipeline.

It offered a key insight: **Phaser's `requestAnimationFrame` loop "renders first, then schedules the next frame," so any uncaught exception in a frame permanently kills the rendering loop** — the screen freezes with no visible error (exceptions only go to the console, and in minified production code they're invisible). This explained the "freeze with no error" behavior.

The first round fix added on-screen error reporting (window.onerror → red banner at the top of the page). **This safety net became the key to locating the issue in the second round** — the user sent me the red error from their screen:

```
TypeError: Cannot read properties of null (reading 'drawImage')
    at updateUVs → setCutPosition → setSize → updateText → setText
    → renderText → blur → destroy → <anonymous> → emit
```

In the second round, opencode traced the call stack to the root cause: **a double-destroy timing issue** — when the scene shut down, Phaser first automatically destroyed the Text object of the input box, and our manual `destroy()` triggered another internal `setText`. At that point the canvas had already been released to null, so `drawImage` crashed, and the exception killed the rendering loop. The fix was precise (only 29 lines in one file): idempotent protection for destroy, no rendering after destruction, and an active check.

## Result: Deleted Anyway

After the second round of fixes was deployed, the user's real-world feedback: **still not working**. There may have been other runtime issues (the user's environment was WeChat's built-in browser, so compatibility was highly suspect), but the user had lost patience.

At the user's request, I completely removed and cleaned up opencode: the program itself + session data + configuration, totaling **338MB**, along with the test helper files I had introduced — all wiped clean, leaving no trace.

## Review: Is It Actually Any Good?

**What it's good at:**
1. **First-class code generation and refactoring ability** — a 2000+ line game refactoring completed in 40 minutes, with quality exceeding my expectations
2. **Genuine root-cause analysis ability** — in the second round it traced a minified JS call stack all the way to the double-destroy, proving it can really "read and understand" code
3. **Cheap** — $0.30 for the entire refactoring + two rounds of fixes

**Where it falls short:**
1. **Inefficient at locating runtime issues** — the first round of static troubleshooting took 19 minutes and found nothing (though the on-screen error safety net it added was valuable, I was the one who asked for it); the real problem required "runtime information + call stack" to pinpoint
2. **Fixes "look correct" but can't guarantee they pass in a real environment** — without a browser or a real user environment, it can only ensure "reasonableness" at the code level; the verification dimension is inherently missing
3. **Long tasks tend to fall into inefficient loops** — the second round of troubleshooting ran for 19 minutes with no output; in the end I took over to wrap it up

**My deepest takeaway:**

> The output quality of AI coding tools depends on the completeness of the "verification loop." Its ability to write and modify code has surpassed most developers, but it cannot guarantee that "the code runs in a real environment." **Self-reports cannot be trusted, and verification cannot be skipped** — especially for deployment-related side effects, which must be manually tested.

Another takeaway is **the value of on-screen error reporting**: without it, the user would only ever see the word "frozen"; with it, a single line of call stack can turn a problem from "mysticism" into "engineering." Adding an "error visualization" layer to any production application is a defensive investment with an extremely high return.

Finally: tools aren't good or bad — only suitable or unsuitable. opencode fits the scenario of "give me a clear spec, produce the code"; but for tasks like "closing the loop on a live runtime issue" that require real-environment verification, for now I'd still rather handle it myself. This test cost $0.0.30 and an afternoon, and the lesson purchased was well worth it.

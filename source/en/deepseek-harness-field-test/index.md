---
title: 'DeepSeek Harness Hands-On Test: From Benchmark Tasks to Building a Playable
  Xianxia Game'
date: 2026-09-08 14:00:00
description: 'The previous post broke down the architecture of dsh; this one validates
  it with real tasks: deployment pitfalls, small-task benchmarks, and then letting
  it write a 93KB single-file xianxia turn-based game across two rounds of continued
  writing after timeouts, with end-to-end acceptance completed using a DOM simulator.'
tags:
- AI
- DeepSeek
- Agent
- Hands-On Test
- Web Game
categories:
- Technology
cover: /img/covers/deepseek-harness-field-test.jpg
lang: en
layout: post
---


## Introduction

The previous article, 《[DeepSeek Harness In-Depth Research](/deepseek-harness-research/)》, was a **paper-based breakdown** from source code and documentation. This one is different — I ran dsh on real tasks: deployment, small-task benchmarks, and finally letting it **write a playable turn-based xianxia web game from scratch**, while I only did coordination and acceptance throughout, never touching its code.

The conclusion up front: **the task was completed, and the game is playable online** (link at the end of the article). Along the way there were none of the "reports success but the artifact is broken" false successes seen in some third-party evaluations; but one real constraint surfaced — single-round task duration is not enough for large projects, and **multi-round continued writing** is needed.

## 1. Evaluation: Deploying to an Intranet Mini Host

The test environment was an intranet x86 Debian mini host. dsh itself is a Node.js package (`@deepseek-ai/dsh`), installing 500+ dependencies globally via npm. The officially recommended way to start the Web UI is `npx`, but what's really suitable for scripted invocation is the **headless profile**:

```bash
dsh --profile headless "任务描述"   # 一次性任务：stdout 打印最终答案后退出
```

This mode is almost isomorphic to `opencode run` and Codex's `-p` — exactly my standard way of delegating to third-party coding agents, a natural fit for the "assistant coordinates, agent does the work" division of labor.

**First pitfall: Node version.** The README only says "install Node.js" with no minimum version stated. In reality it requires **Node ≥ 22.19 or 24** (23.x is not supported): installing on Node 20 succeeds, but it crashes on launch with two hard errors —

- `Promise.withResolvers is not a function` (a Node 22+ API)
- `node:module` doesn't provide `stripTypeScriptTypes` (a Node 22.18+/24 API)

After upgrading the test machine's Node to v24, everything worked. I also verified credential handling along the way: dsh's credential system natively supports injecting the `DEEPSEEK_API_KEY` environment variable, so **the key never touches disk** — a very clean security practice for automated invocations.

## 2. Benchmarks: Two Small, Reproducible Tasks

Before officially delegating a large task, I first ran two small tasks with **objectively verifiable results** (to avoid "I'll just trust you when you say it's done"):

| Task | Time | Result |
|---|---|---|
| Fix 3 intentionally planted bugs (divide-by-zero / factorial / odd-even) and make all unit tests pass | 16s | ✅ Manually re-verified: 6/6 passed |
| Implement a CSV→JSON converter from scratch (type inference + quoted field handling) | 26s | ✅ All edge cases (including `"Smith, John"`) correct |

Both runs were clean and fast, with an estimated cost of less than 1 cent per run (V4-Flash is cheap to begin with, plus a 90%+ context cache hit rate). At this stage I also read a batch of third-party reviews, among which [AtlasCloud's in-depth review](https://www.atlascloud.ai/blog/tips/deepseek-harness-review) deserves the most caution: running the same frontend task 3 times, **all 3 reported "Done" with a confident verification checklist, but opening the artifacts revealed 2 were broken** — it used `node --check` (syntax-only) as "verification" and knew nothing about SVG path validity. Also, misconfiguration (model entries specifying only `id` without declaring `contextWindow`/`maxTokens`) makes the same task 3.5x more expensive, and these critical fields are buried in the package README rather than the official docs.

The single lesson: **an agent's self-report is never trustworthy; acceptance responsibility lies with the caller.** This holds equally for opencode and Codex — it's not unique to dsh.

## 3. Hands-On: Letting It Write a Xianxia Turn-Based Game

With benchmarks passed, I issued the real task: implement a pixel-art turn-based web game similar to *The Legend of Sword and Fairy* in a single HTML5 Canvas file:

- 640x480 top-down map (grass / trees / cabin / cave / pond), movement via arrow keys/WASD
- Random encounters while moving, turn-based combat: Attack / Spells / Items / Flee
- HP (stamina) / MP (qi) / attack-defense / XP leveling / save files
- Pure native Canvas, zero external dependencies, a single `index.html` you can open and play

### Round 1: 580s Timeout, 30KB High-Quality Skeleton Produced

The task ran for 580 seconds and was cut off by the timeout I set. Inspecting the artifact: map generation and rendering, character movement, sprites, and the inventory were all written; the code structure was clean, comments were proper, and there were zero syntax errors — but at the end of the file sat a `/*==PART_B==*/` placeholder; the combat system, dialogue, and main loop hadn't been touched.

**This deserves praise**: it didn't lie about being done. It was still writing when the timeout hit, and the truncated state was obvious — this is "honest" engineering behavior, in sharp contrast to the "false success" mentioned in section 2.

### Round 2: 891s Timeout, Main Body Completed at 93KB

The second-round instruction was restrained: "Continue completing from the PART_B marker; first read through the existing code, don't rewrite Part A, and self-check syntax when done." It correctly picked up where the existing code left off, filling in the scene state machine, turn-based combat, dialogue boxes, and title/ending — growing the file from 30KB to 93KB. When interrupted it was running self-tests (the log showed "title→map transition passed, running the full test suite").

### Acceptance: No Browser? Then Actually "Run" the Game

Both rounds timed out — could the artifact actually be played? Reading the code isn't enough. I wrote a **DOM-stub simulator** in Node: injecting fake canvas/document/localStorage via `vm`, loading the real game script, then inserting a probe to read internal state (current scene, battle object, HP), and pressing keys automatically according to the state machine — at the title screen selecting "New Journey" → random walking on the map → encountering an enemy and entering battle → confirming an attack from the menu → until the outcome is resolved.

Simulation results:

```
BOOT OK（无加载错误，数千帧随机按键零异常）
标题 → 地图（20 帧进入新游戏）
716 帧时随机遇敌，进入战斗
战斗胜利 → 转场回地图 ✓
第二次模拟：战斗失败 → 半血复活（HP 130→65，精确等于 maxHp×0.5）→ 回到木屋前 ✓
```

**Both win and loss paths were verified end-to-end**, down to details like "respawning with half HP after a defeat" matching the design exactly. Along the way, the simulator even raised one false alarm about "battle object being empty after victory" — checking the code revealed it was just the normal timing of the scene fade-out transition; a false alarm, and after correcting the simulator we could proceed.

## 4. Results

- **Play it**: https://nova02640.github.io/xianxia-canvas-game/ (arrow keys/WASD to move, Enter to confirm, arrow keys to select menus in battle)
- **Source code**: https://github.com/nova02640/xianxia-canvas-game (93KB single file, no dependencies whatsoever)

Deployment went through GitHub Actions + Pages, with a workflow of only 20 lines (pure static single file, uploaded directly with no build). After pushing, the online artifact's **sha256 was identical** to the local one — not "it looks deployed," but byte-for-byte confirmation.

## 5. Lessons and Conclusions

1. **No false success, but real constraints**: dsh was honest throughout this run — a timeout was a timeout, and the truncation marker was clearly visible. The real constraint is the **per-round duration budget**: for whole-frontend-package tasks the effective output rate is only about ~500B/s; a 93KB game takes nearly 20 minutes across 2–3 rounds, and **scope tends to creep** (it starts planning Bosses, area gating, and other expansions while writing), so task descriptions must set boundaries or be issued in stages.
2. **Large task = multi-round continued writing + rigorous acceptance**: headless mode runs one task per invocation with no interactive follow-up, but giving it instructions like "read through first, don't break anything, only fill in this section" each round enables seamless continuity. "Multi-round continued writing" is a universal collaboration pattern for any one-shot CLI agent.
3. **A DOM-stub simulator is a powerful acceptance tool for frontend tasks**: running the game for real in a headless environment using a fake DOM + state probes + automated keypresses is more reliable than any static check. This methodology will be distilled into a standard acceptance process going forward.
4. **Configuration and versions are the first hurdle**: Node ≥22.19 (not stated in the README), and model entries must explicitly declare `contextWindow`/`maxTokens` — these two points directly affect whether it runs at all and how expensive it is.
5. **Positioning judgment**: dsh is currently at v0.1 rc, and the official docs themselves state "there will be breaking changes." As a **coding executor for controlled pilots** (low-cost, self-checkable tasks) it is more than sufficient; for unattended production pipelines, wait a bit longer.

The next post will wrap up this mini-host experiment environment, and also discuss how best to assemble the "assistant coordinates + agent executes + machine accepts" pipeline.

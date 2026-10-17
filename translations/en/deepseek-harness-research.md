---
title: 'In-Depth Research on DeepSeek Harness: The Agent Framework Where Everything
  Is a Plugin'
date: 2026-08-13 00:00:00
description: DeepSeek's officially open-sourced Agent Harness (dsh) garnered 85k stars
  the moment it launched. This post takes a deep dive into its Cordis plugin architecture,
  40+ functional modules, multi-backend sandbox design, and how its positioning differs
  from personal agents like Hermes.
tags:
- AI
- DeepSeek
- Agent
- Open Source
- Research
categories:
- Technology
cover: /img/covers/deepseek-harness-research.jpg
lang: en
layout: post
---


## Introduction

On August 13, 2026, DeepSeek AI open-sourced **DeepSeek Harness** (`dsh`) — a TypeScript-based Agent runtime framework that grabbed **85k stars** on its release day, a level of community enthusiasm that can only be described as phenomenal.

Its slogan consists of a single sentence: **"Everything is a Plugin."** This is not marketing fluff, but the very foundation of its entire architecture: model adapters are plugins, the tool registry is a plugin, session logs are a plugin, **and even the Agent main loop itself is a plugin**.

This post is based on research into the repository's source code and official documentation, breaking down the project's core philosophy, architecture design, and practical usage.

## Project Overview

| Item | Details |
|---|---|
| Developer | DeepSeek AI (official) |
| Positioning | Open-source Agent Harness (AI agent runtime framework) |
| Core Language | TypeScript (+ Python SDK) |
| License | MIT |
| Version | v0.1.0-rc.5 (Developer Preview) |
| Popularity | 85.9k stars / 7.6k forks / 117MB source code |
| Runtime Requirements | Node.js ^22.19 or >=24, pnpm 11.7 |

> ⚠️ Note: The project is in the developer preview stage, and the official docs explicitly warn that **breaking changes** (compatibility-breaking changes) are coming.

## Core Philosophy: Everything Is a Plugin

dsh is built on top of the [Cordis](https://github.com/cordiverse/cordis) framework — a plugin programming paradigm that emphasizes "spatiotemporal composability." The core design ideas:

- **No privileged core**: All capabilities are registered as plugins into a shared context, including model adapters, tools, persistence, sandboxes, approval policies, and even the Agent loop itself
- **Everything is replaceable**: Every plugin starts from configuration; users can override any layer with a patch without touching the framework source code
- **Reversible effects**: Effects registered by a plugin are automatically rolled back when the plugin is unloaded, making mounting/unmounting safe operations

This means the way to extend dsh is not "modify the core," but "hang a plugin on the side."

## Architecture Design

### Profile and Bundle Layering

A running dsh instance is composed from a tree of plugins combined in sequence:

```
dsh-base (base layer: model/tools/persistence/sandbox/approval)
  └─ dsh-web-app (browser app) or dsh-headless (headless runner)
       └─ user's own cordis.patch.yml override layer
```

- **Profile**: A named composition, stored at `$DSH_HOME/profiles/<name>`, listing the stacked bundles
- **Bundle**: A distribution format of a Cordis config line + code, installable independently
- **Patch**: Replace any config line by id, or insert a new line

Running `dsh --profile web --dump-config` lets you view the current startup tree, and any line can be replaced by a patch.

### Event-Driven Extension Points

dsh uses three kinds of events as its extension interfaces:

- **Session events**: Persistent facts, appended to the session log and surviving restarts
- **Agent events** (`agent/*`): Carry a live Agent instance in real time, used to observe or intercept work in progress
- **Capability events**: Hang policies and adapters onto capability seams without touching the main loop

## Functional Modules: 40+ Packages

dsh uses a monorepo (pnpm workspace), with packages grouped by capability under `packages/`:

| Group | Modules |
|---|---|
| **Core** | session, tools, agent-loop, llm, system-prompt |
| **Execution** | shell, terminal (PTY), code-runtime, subprocess |
| **Sandbox** | sandbox (multi-backend: bwrap / Landlock / Seatbelt), native/landlock-run |
| **Files & Development** | fs, lsp, web |
| **Agent Capabilities** | subagent, skill, compaction, context, workflow, jobs, plan, todo, goal |
| **Integration** | mcp, acp, hooks (compatible with Claude Code/Codex protocols), sdk (JSON-RPC) |
| **UI** | host (Web backend) + client (browser side) |
| **Support** | typert (type graph generation), extensions (Agent self-modification), storage, credentials, settings |

Two highlights among these:

1. **typert**: A type graph generation engine that auto-generates/loads type contracts, ensuring type consistency across frontend, backend, and the RPC gateway
2. **extensions**: Runtime self-modification for the Agent — the model can write plugins at runtime and mount/unmount them, truly "extending an Agent with an Agent"

## Quick Start

```bash
# Launch the Web UI with one command (default http://127.0.0.1:3080)
npx @deepseek-ai/dsh web

# Run from source
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install && pnpm run build && pnpm dsh web

# Headless mode: one-off task
dsh --profile headless "Run the tests"
```

There is also a Python SDK (`python/sdk`, managed with uv) and complete examples under `examples/` (headless-agent, jsonrpc-agent, mcp-memory, etc.).

## Highlights and Observations

### Why It's Worth Watching

1. **Viral on release**: 85k stars in one day — a major step for DeepSeek's open-source ecosystem
2. **The Cordis paradigm is the biggest selling point**: Plugins can fully replace the core, extensibility is exceptional, and it comes with a built-in rollback mechanism
3. **Multi-backend sandbox**: Three isolation backends — bwrap / Landlock / Seatbelt — with solid security design
4. **Dual-language SDK**: TypeScript + Python, offering flexible integration options
5. **Ecosystem compatibility**: The hooks layer speaks the wire protocol of Claude Code / Codex, lowering migration costs

### Positioning Differences vs. Personal Agents (e.g., Hermes)

- **Personal agents like Hermes**: Target individual users, emphasizing multi-platform access (WeChat/Telegram, etc.), skills/memory/session management, and out-of-the-box usability
- **DeepSeek Harness**: Targets developers, emphasizing **composability** and **programmable extension**; at its core it is a recomposable plugin platform, not a ready-to-use product

The two occupy different positions: the former is an "assistant," the latter is "building blocks."

### Risk Warnings

- In the developer preview stage; both the API and configuration formats may change
- Depends on the Cordis ecosystem; the new paradigm has a learning curve
- For production use, it's recommended to wait for a stable release

## Conclusion

DeepSeek Harness redefines how Agent frameworks are extended with "Everything Is a Plugin" — no privileged core, everything replaceable, reversible, and composable. For developers who love tinkering with architecture, this is a project worth keeping an eye on; for users who want to just pick it up and use it, it's best to wait for a stable release.

I've already forked a copy to my own GitHub (`nova02640/deepseek-harness`), and I'll keep tracking upstream updates, sharing anything worth writing about as it comes.

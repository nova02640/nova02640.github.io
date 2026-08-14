---
title: "DeepSeek Harness 深度调研：一切皆插件的 Agent 框架"
date: 2026-08-13
description: "DeepSeek 官方开源的 Agent Harness（dsh）刚发布即斩获 8.5 万 star。本文深入拆解它的 Cordis 插件架构、40+ 功能模块、多后端沙箱设计，以及与 Hermes 等个人 Agent 的定位差异。"
slug: "deepseek-harness-research"
tags: ["AI", "DeepSeek", "Agent", "开源", "调研"]
categories: ["技术"]
---

## 引言

2026 年 8 月 13 日，DeepSeek AI 开源了 **DeepSeek Harness**（`dsh`）——一个基于 TypeScript 的 Agent 运行框架，发布当天即斩获 **8.5 万 star**，社区热度现象级。

它的口号只有一句话：**"Everything is a Plugin"（一切皆插件）**。这不是营销话术，而是整个架构的基石：模型适配器是插件、工具注册表是插件、会话日志是插件，**连 Agent 主循环本身都是插件**。

本文基于对仓库源码与官方文档的调研，拆解这个项目的核心理念、架构设计与实际用法。

## 项目概况

| 项 | 详情 |
|---|---|
| 开发者 | DeepSeek AI（官方） |
| 定位 | 开源 Agent Harness（AI 代理运行框架） |
| 核心语言 | TypeScript（+ Python SDK） |
| License | MIT |
| 版本 | v0.1.0-rc.5（Developer Preview） |
| 热度 | 85.9k stars / 7.6k forks / 117MB 源码 |
| 运行要求 | Node.js ^22.19 或 >=24，pnpm 11.7 |

> ⚠️ 注意：项目处于开发者预览阶段，官方明确警告**将有破坏性变更**（compatibility-breaking changes）。

## 核心理念：一切皆插件

dsh 构建在 [Cordis](https://github.com/cordiverse/cordis) 框架之上——一种强调"时空可组合性"（spatiotemporal composability）的插件编程范式。核心设计思想：

- **没有特权核心**：所有能力以插件形式注册到共享上下文（context），包括模型适配器、工具、持久化、沙箱、审批策略，乃至 Agent 循环本身
- **一切皆可替换**：每个插件都从配置出发，用户可以用 patch 覆盖任意层，不需要改框架源码
- **可逆的效果（effects）**：插件注册的效果在插件卸载时自动回滚，挂载/卸载是安全操作

这意味着扩展 dsh 的方式不是"改核心"，而是"在旁边挂一个插件"。

## 架构设计

### Profile 与 Bundle 分层

一个运行中的 dsh 是由插件树按顺序组合而成：

```
dsh-base（基础层：模型/工具/持久化/沙箱/审批）
  └─ dsh-web-app（浏览器应用）或 dsh-headless（无头运行器）
       └─ 用户自己的 cordis.patch.yml 覆盖层
```

- **Profile**：命名组合，存放在 `$DSH_HOME/profiles/<name>`，列出堆叠的 bundles
- **Bundle**：Cordis 配置行 + 代码的分发格式，可独立安装
- **Patch**：按 id 替换任意配置行，或插入新行

用 `dsh --profile web --dump-config` 可以查看当前启动树，任何一行都能被 patch 替换。

### 事件驱动的扩展点

dsh 用三类事件作为扩展接口：

- **Session events**：持久事实，追加到会话日志，重启后仍存活
- **Agent events**（`agent/*`）：实时携带 Agent 实例，用于观察或拦截进行中的工作
- **Capability events**：把策略和适配器挂到能力缝（seam）上，无需引入主循环

## 功能模块：40+ 个包

dsh 采用 monorepo（pnpm workspace），`packages/` 下按能力分组：

| 分组 | 模块 |
|---|---|
| **核心** | session、tools、agent-loop、llm、system-prompt |
| **执行** | shell、terminal（PTY）、code-runtime、subprocess |
| **沙箱** | sandbox（bwrap / Landlock / Seatbelt 多后端）、native/landlock-run |
| **文件与开发** | fs、lsp、web |
| **Agent 能力** | subagent、skill、compaction、context、workflow、jobs、plan、todo、goal |
| **集成** | mcp、acp、hooks（兼容 Claude Code/Codex 协议）、sdk（JSON-RPC） |
| **UI** | host（Web 后端）+ client（浏览器端） |
| **支撑** | typert（类型图生成）、extensions（Agent 自修改）、storage、credentials、settings |

其中两个亮点设计：

1. **typert**：类型图生成引擎，自动生成/加载类型契约，保证前后端与 RPC 网关类型一致
2. **extensions**：Agent 运行时自修改——模型可以在运行中编写插件并挂载/卸载，真正"用 Agent 扩展 Agent"

## 快速上手

```bash
# 一条命令启动 Web UI（默认 http://127.0.0.1:3080）
npx @deepseek-ai/dsh web

# 源码运行
git clone https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness
pnpm install && pnpm run build && pnpm dsh web

# 无头模式：一次性任务
dsh --profile headless "运行测试"
```

另有 Python SDK（`python/sdk`，uv 管理）与 `examples/` 下的完整示例（headless-agent、jsonrpc-agent、mcp-memory 等）。

## 亮点与观察

### 为什么值得关注

1. **发布即爆火**：一天 8.5 万 star，DeepSeek 开源生态的重要一步
2. **Cordis 范式是最大卖点**：插件可完全替换核心，扩展性极强，且自带可回滚机制
3. **多后端沙箱**：bwrap / Landlock / Seatbelt 三种隔离后端，安全设计扎实
4. **双语言 SDK**：TypeScript + Python，接入方式灵活
5. **兼容生态**：hooks 层兼容 Claude Code / Codex 的 wire-protocol，降低迁移成本

### 与个人 Agent（如 Hermes）的定位差异

- **Hermes 类个人 Agent**：面向个人用户，强调多平台接入（微信/Telegram 等）、技能/记忆/会话管理，开箱即用
- **DeepSeek Harness**：面向开发者，强调**可组合性**与**可编程扩展**，核心是一个可重组的插件平台，而非开箱即用的产品

两者定位不同：前者是"助手"，后者是"积木"。

### 风险提示

- 开发者预览阶段，API 与配置格式都可能变化
- 依赖 Cordis 生态，新范式有学习成本
- 生产环境使用建议等待稳定版

## 结语

DeepSeek Harness 用"一切皆插件"重新定义了 Agent 框架的扩展方式——没有特权核心，全部可替换、可回滚、可组合。对于喜欢折腾架构的开发者来说，这是一个值得持续关注的项目；对于想直接开箱使用的用户，建议等稳定版再入手。

我已经 fork 了一份到自己的 GitHub（`nova02640/deepseek-harness`），后续会持续跟踪上游更新，有值得写的进展再分享。

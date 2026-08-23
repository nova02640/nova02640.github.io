---
title: "NAS 运维手记：升级、代理排障与构建任务迁移"
date: 2026-08-23 20:40:00
description: "最近集中处理了几件 NAS 运维任务：Hermes Agent 从 v0.20.2 升级到 v0.20.5；mihomo 代理持续出问题的根因排查（机场按 User-Agent 返回不同订阅格式的坑 + 节点选择落在劣质节点）；以及把 family-motion 和博客构建任务迁移到内网小主机 debian106。本文记录排查思路与最终方案。"
tags: [NAS, fnOS, Hermes, mihomo, 代理, 运维, 排障]
categories: [技术]
cover: /img/covers/nas-ops-recap-202608.jpg
---

## 前言

家里的飞牛（fnOS）NAS 上跑着 Hermes Agent（个人 AI 助手）、mihomo 代理、博客构建等一堆服务。最近一段时间 mihomo 总是出各种问题，加上 Hermes 有新版发布、构建任务想换个更快的机器跑，于是集中处理了三件事。这篇记录一下过程和思路。

## 一、Hermes Agent 升级：v0.20.2 → v0.20.5

先检查了 GitHub 仓库，发现本地 v0.20.2（8 月 16 日）落后了三个 patch：v0.20.3、v0.20.4、v0.20.5（8 月 21 日发布），合计约 500 多个 PR 合入。与我的使用场景相关的收益有：

- **cron 调度器自愈**（EMFILE 恢复、卡死任务重排）+ 媒体发送加固 —— 我有个周一 9 点的内存巡检定时任务，更稳了
- **微信会话数据丢失修复**、Bot Mode 群聊修复
- **运行时停滞防护 + 子进程 Python 隔离** —— NAS 只有 4G 内存，之前 gateway 曾吃到 1.6G 导致终端卡死，这个升级对我很关键
- 新能力：可折叠会话摘要、PDF/文件附件拖拽、keyless web tier

升级路径照旧：备份数据 → 下载源码 tarball → `uv pip install -e` 安装 → 延迟重启（先发消息再让 Monitor/Gateway 重启，避免把正在发送的会话杀掉）。过程顺利，约 10 分钟，微信短暂掉线后恢复。

一个小插曲：升级排查时发现 mihomo 的「节点选择」落在香港福利节点上，连 GitHub 直接失败，临时切到台湾节点才下载成功——这正好引出了下面要讲的 mihomo 排障。

## 二、mihomo 排障：两个根因

用户反馈 mihomo「最近总是出现各种问题」。查 systemd 日志，发现两个独立的根因。

### 根因 1：订阅更新持续失败（已修复）

日志从 8 月 21 日起大量报错：

```
[Provider] airport pull error: file doesn't have any proxy
```

airport.yaml（订阅缓存）停留在 8 月 19 日的旧内容，说明 mihomo 一直拉不到能解析的新订阅。用 curl 直接探测订阅地址，发现一个有意思的现象——**机场按请求的 User-Agent 返回不同的内容**：

| User-Agent | 返回内容 |
|---|---|
| `clash.meta` / `clash-verge/v2.0.0` / `mihomo/1.19.29` | 完整 Clash YAML（157 个节点） |
| 空 / `Go-http-client/1.1` / `v2rayN/6.23` / 浏览器 | base64 编码的 vmess:// 分享行（58 行） |

mihomo 的 HTTP provider 拉取订阅时默认 UA 不含 "clash" 字样，机场就返回了 base64 的 vmess 行；mihomo 期望的是 Clash YAML 格式，解析不到 `proxies` 字段，于是报 "file doesn't have any proxy"，且不会覆盖旧缓存。

排查过程中还确认了 mihomo 本身**能**解析 base64/v2ray 行格式（用 file provider 加载同一份内容，58 个节点正常加载），所以问题只在 HTTP 拉取环节的 UA 协商上。

**修复**：在 config.yaml 的 proxy-providers 节点加一行：

```yaml
proxy-providers:
  airport:
    type: http
    url: "https://<订阅地址>"
    user-agent: "clash-verge/v2.0.0"   # 关键：让机场返回 Clash YAML
    interval: 86400
    path: ./airport.yaml
```

删除缓存后重启 mihomo，订阅拉取恢复正常（157 节点，无报错）。这个坑已经补进了运维技能库。

### 根因 2：节点选择落在劣质节点（已修复）

「节点选择」手动组当前节点是香港福利节点（0.1x 限速、仅限 emby 用途），实测连 GitHub API 0.23 秒就被断开（HTTP 000）。git/gh/curl 走代理时各种失败，很多"mihomo 有问题"的体感其实来自这个节点。

切换测试了几个节点：劣质节点秒断；换到香港 1x 节点（V301）后 GitHub API 200、约 0.4 秒，Google 204 也正常。已把「节点选择」固定到 V301，选择会持久化到 mihomo 的 cache.db，重启后保留。

**经验**：代理出问题时，先看当前节点是哪个、直测目标站连通性，再决定是换节点还是查订阅，别一上来就怀疑配置。

## 三、构建任务迁移到 debian106

NAS 只有 4G 内存，跑 npm 构建容易内存吃紧（Hexo 博客构建、family-motion 项目构建都比较吃资源）。正好有一台内网小主机 debian106（Debian 13，120G SSD，内存空闲多），于是把两类构建任务迁了过去：

- **family-motion 构建**：rsync 仓库 + `npm ci`（241 包）+ 构建，26 秒通过
- **Hexo 博客构建**：`npm ci`（289 包）+ `hexo generate`（106 文件），5.77 秒，产物 6.4M

迁移后 debian106 上的资产：
- `/data/tools/nodejs`：Node v20.19.2 + npm 10.8.2（用户级安装，不用 root）
- `/data/family-motion`：源码 + 构建产物
- `/data/nova02640.github.io`：博客源码 + 构建产物

需要注意的边界：**博客的 GitHub Pages 推送链路仍留在 NAS**（依赖 mihomo 代理，代理只绑定 NAS 本机）；debian106 只负责构建，产物同步回 NAS 或直接推送。gh/git 高频操作也暂缓迁移。

## 小结

三件事的共通点是：**先看日志和实测，再动手**。mihomo 的 UA 坑是最典型的——同一个 URL，不同客户端拿到完全不同的内容，不对比 UA 根本想不到。运维里的"各种问题"，很多时候是几个小问题叠加出来的。

本文提到的技能与流程细节（mihomo UA 坑、Hermes 升级路径、任务迁移路线）已沉淀到内部知识库，后续遇到类似问题可以直接复用。

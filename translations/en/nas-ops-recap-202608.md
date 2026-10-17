---
title: 'NAS Ops Notes: Upgrades, Proxy Troubleshooting, and Build Task Migration'
date: 2026-08-23 20:40:00
description: 'Recently I tackled several NAS operations tasks: upgrading Hermes Agent
  from v0.20.2 to v0.20.5; tracking down the root cause of persistent mihomo proxy
  issues (the provider returns different subscription formats based on User-Agent
  + node selection landing on a bad node); and migrating family-motion and blog build
  tasks to a small internal-network host. This post records the troubleshooting approach
  and the final solution.'
tags:
- NAS
- fnOS
- Hermes
- mihomo
- Proxy
- Operations
- Troubleshooting
categories:
- Tech
cover: /img/covers/nas-ops-recap-202608.jpg
lang: en
layout: post
---


## Preface

My home feiniu (fnOS) NAS runs a whole bunch of services: Hermes Agent (personal AI assistant), the mihomo proxy, blog build jobs, and more. Over the past while, mihomo kept running into all sorts of problems, Hermes had a new version out, and I wanted to move build tasks to a faster machine — so I tackled three things in one go. This post records the process and the thinking behind it.

## 1. Hermes Agent Upgrade: v0.20.2 → v0.20.5

I first checked the GitHub repo and found that my local v0.20.2 (August 16) was three patches behind: v0.20.3, v0.20.4, and v0.20.5 (released August 21), totaling 500+ merged PRs. The benefits relevant to my use case:

- **Cron scheduler self-healing** (EMFILE recovery, rescheduling stuck tasks) + hardening of media sending — I have a memory-inspection cron task that runs at 9 AM on Mondays; it's more reliable now
- **WeChat session data loss fix**, Bot Mode group chat fix
- **Runtime stall protection + subprocess Python isolation** — the NAS only has 4G of RAM; previously the gateway ate up 1.6G and caused the terminal to freeze, so this upgrade was critical for me
- New features: collapsible session summaries, drag-and-drop for PDF/file attachments, keyless web tier

The upgrade path was the same as usual: back up data → download the source tarball → install with `uv pip install -e` → delayed restart (send a message first, then restart Monitor/Gateway, to avoid killing a conversation mid-send). The process went smoothly, taking about 10 minutes; WeChat briefly dropped offline and then recovered.

One small episode: while troubleshooting the upgrade, I noticed mihomo's "proxy group selection" had landed on a Hong Kong welfare node, and connecting to GitHub failed outright — I had to temporarily switch to a Taiwan node to download successfully. This leads directly into the mihomo troubleshooting discussed below.

## 2. mihomo Troubleshooting: Two Root Causes

The user reported that mihomo "keeps running into various problems lately." Checking the systemd logs, I found two separate root causes.

### Root Cause 1: Subscription updates failing repeatedly (fixed)

The logs showed a flood of errors starting August 21:

```
[Provider] airport pull error: file doesn't have any proxy
```

airport.yaml (the subscription cache) was stuck on old content from August 19, meaning mihomo kept failing to fetch a parseable new subscription. Probing the subscription URL directly with curl revealed an interesting phenomenon — **the provider returns different content depending on the request's User-Agent**:

| User-Agent | Returned content |
|---|---|
| `clash.meta` / `clash-verge/v2.0.0` / `mihomo/1.19.29` | Full Clash YAML (157 nodes) |
| Empty / `Go-http-client/1.1` / `v2rayN/6.23` / browser | base64-encoded vmess:// share lines (58 lines) |

When mihomo's HTTP provider fetches the subscription, its default UA doesn't contain the word "clash", so the provider returned base64 vmess lines. mihomo expected the Clash YAML format, couldn't find a `proxies` field, and thus reported "file doesn't have any proxy" — and it won't overwrite the old cache.

During troubleshooting I also confirmed that mihomo itself **can** parse base64/v2ray line formats (loading the same content via a file provider loaded all 58 nodes fine), so the problem lies solely in the UA negotiation at the HTTP fetch stage.

**Fix**: add one line to the proxy-providers section of config.yaml:

```yaml
proxy-providers:
  airport:
    type: http
    url: "https://<subscription URL>"
    user-agent: "clash-verge/v2.0.0"   # Key: make the provider return Clash YAML
    interval: 86400
    path: ./airport.yaml
```

After deleting the cache and restarting mihomo, subscription fetching recovered normally (157 nodes, no errors). This gotcha has been added to the ops knowledge base.

### Root Cause 2: Node selection landing on a bad node (fixed)

The "proxy group selection" manual group was currently on a Hong Kong welfare node (0.1x rate-limited, only for emby use). In practice, connecting to the GitHub API got disconnected after 0.23 seconds (HTTP 000). git/gh/curl failed in all sorts of ways when going through the proxy — many of the "mihomo has problems" impressions actually came from this node.

I switched and tested a few nodes: the bad node dropped connections instantly; after switching to the Hong Kong 1x node (V301), the GitHub API returned 200 in about 0.4 seconds, and Google 204 worked fine too. I've pinned "proxy group selection" to V301 — the selection persists to mihomo's cache.db and survives restarts.

**Lesson**: when the proxy is misbehaving, first check which node you're on and directly test connectivity to the target site, then decide whether to switch nodes or investigate the subscription. Don't jump straight to suspecting the configuration.

## 3. Migrating Build Tasks to a Small Internal-Network Host

The NAS only has 4G of RAM, so npm builds easily run tight on memory (both the Hexo blog build and the family-motion project build are fairly resource-hungry). As it happens, I have a spare small host at home (Debian 13, 120G SSD, plenty of free memory), so I migrated both categories of build tasks over:

- **family-motion build**: rsync the repo + `npm ci` (241 packages) + build — passed in 26 seconds
- **Hexo blog build**: `npm ci` (289 packages) + `hexo generate` (106 files) — 5.77 seconds, 6.4M of output

The asset arrangement after migration is simple — each project gets its own directory:

- **Node runtime**: v20.19.2 + npm 10.8.2 (user-level install, no root required)
- **Source code and build artifacts for both projects**: each in its own directory, no interference between them

One boundary to be aware of: **the blog's GitHub Pages push pipeline stays on the NAS** (it depends on the mihomo proxy, which only binds to the NAS itself); the small host is only responsible for building, and artifacts are synced back to the NAS or pushed directly. Frequent gh/git operations are also being deferred for now.

## Summary

What all three tasks have in common: **look at logs and test empirically first, then act**. The mihomo UA gotcha is the most typical example — the same URL, and different clients get completely different content; without comparing UAs you'd never think of it. In operations, the "various problems" often come from several small issues stacking up.

The skills and process details mentioned in this post (the mihomo UA gotcha, the Hermes upgrade path, the task migration route) have been distilled into the internal knowledge base, so similar problems can be addressed by reusing them directly later.

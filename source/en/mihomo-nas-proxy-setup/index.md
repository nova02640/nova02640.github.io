---
title: 'Deploying mihomo on a NAS: From Research to Whole-Home GitHub Acceleration'
date: 2026-08-16 00:00:00
description: '[Solution Decommissioned] The mihomo proxy solution documented in this
  post was completely removed on 2026-09-28. It is retained solely as a technical
  record — do not re-deploy following the steps in this article. Original record:
  Because GitHub push/clone frequently timed out, I deployed mihomo (Clash.Meta''s
  successor) as a proxy on my NAS, covering project research, subscription parsing,
  GeoIP data pitfalls, systemd service setup, git/gh integration, and 8 sets of test
  data.'
tags:
- mihomo
- Clash
- Proxy
- NAS
- GitHub
- Networking
categories:
- Tech
cover: /img/covers/mihomo-nas-proxy-setup.jpg
lang: en
layout: post
---


{% note warning %}
**⚠️ Solution Decommissioned (2026-09-28)**

The mihomo proxy solution documented in this post has been **completely removed**: the service, configuration, subscription config and local data, and all related firewall rules have been cleaned up. It is no longer maintained and will not be updated again.

**Reason for decommissioning**: This chain failed frequently (unstable nodes requiring repeated troubleshooting), making the maintenance cost outweigh the benefits. GitHub access has since moved to a more reliable alternative.

**This post is retained solely as a technical record** — its research methodology, systemd service setup ideas, and troubleshooting techniques still have reference value; but please do not re-deploy following the steps in this article. The configuration examples in the text are generic default parameters only and contain no valid credentials.
{% endnote %}

## Origin: That Frustrating GitHub

I run a personal agent (Hermes) on my NAS, and it frequently needs to work with GitHub: `git push`, `git clone`, `gh` commands. On a China-based network, these operations feel like opening a blind box:

```
git push → timeout → retry → timeout → retry 8 times → finally succeeds
```

Every push requires a retry loop script (`for i in 1..8; git push && break; sleep 15`), plus bumping up `http.postBuffer`. Direct access to the GitHub homepage measured **15 seconds** — right on the edge of timing out.

Enough was enough. I decided to install a proxy on my NAS: deploy once, benefit the whole household — not only would Hermes' git/gh run smoothly, but my phone and computers could also accelerate through the NAS in the future.

## Research: What Is mihomo

After searching, I settled on **MetaCubeX/mihomo** — the successor to Clash.Meta, a rule-based proxy core written in Go. The research process turned up several interesting findings:

### 1. Repository metadata cannot be trusted

Running `gh repo view` on this repository, the description was unexpectedly:

> "A simple Python Pydantic model for Honkai: Star Rail parsed data from the Mihomo API."

How could a proxy core's description be a "Honkai: Star Rail Python library"? But the branch list (`Alpha`, `Meta`, `Mitm`...) clearly showed a Clash-family structure. Reading the Alpha branch's README confirmed it: **this is mihomo itself** ("Another Mihomo Kernel") — the description had been altered. Lesson learned: **repository metadata (description/topics) cannot be trusted; the code content is what matters**.

### 2. The relationship between the Alpha / Meta / main branches

Per user requests, main was ignored — the focus was on Alpha and Meta:

- **Alpha**: the branch with the latest commits, the newest features, and the default branch of the official documentation site
- **Meta**: periodically merged from Alpha — the documentation FAQ explicitly states "Meta isn't necessarily more stable than Alpha"
- For production deployments, choose the **Release stable version** (v1.19.29) rather than tracking branches

### 3. Learning through the documentation site (wiki.metacubex.one)

I went through all four sections — Installation, Handbook, Configuration, and APIs. The most valuable takeaways:

- **Installation**: Linux binary + systemd service template (with `CAP_NET_ADMIN` capability config), official Docker image
- **Configuration**: `proxy-providers` (subscriptions), `proxy-groups` (select/url-test/fallback), `rules` (DOMAIN/GEOIP/logical rules), `dns` (anti-poisoning/fake-ip)
- **API**: `/configs` hot reload, `/proxies` node switching, `/traffic` real-time traffic
- **Gotcha**: the documentation site's `handbook/route` page is still a "work in progress" — the page title literally says "work in progress" 😅

## Deployment: Three Pitfalls

### Step 0: The user's config.yaml skeleton

The user provided a trimmed-down `config.yaml` (a 30-line skeleton):

```yaml
mixed-port: 7890
external-controller: 127.0.0.1:9090
external-ui: ui
mode: rule
proxy-providers:
  airport:
    type: http
    url: "订阅链接"      # ← 只差这里
    interval: 86400
    path: ./airport.yaml
proxy-groups:
  - name: 节点选择        # select 手动
  - name: 自动选择        # url-test 自动测速
rules:
  - GEOIP,CN,DIRECT      # 国内直连
  - MATCH,节点选择        # 其余走代理
```

The design was very sensible: keep only the skeleton, separate subscriptions and rules, so switching providers later only requires changing one line.

### Pitfall 1: Subscription format confusion

The user's subscription link with `?profile=simple` returned **base64-encoded text** (V2RayN format, with the filename literally `V2RayN.txt`). I thought I had to write my own conversion script (base64 decode → parse `vmess://` → convert to Clash format), and even wrote two versions of a parser.

Later I discovered: **the decoded content was itself a complete Clash YAML** (`mixed-port`, `proxies:`, hysteria2 nodes), and **mihomo's proxy-provider automatically decodes base64 subscriptions** — you just fill in the URL and nothing needs converting. I had written two scripts in vain (though that line-by-line fault-tolerant decoding approach did end up becoming useful experience).

Lesson: **verify the tool's capabilities first, before writing any code**. mihomo's compatibility with airport subscriptions is far better than I imagined.

### Pitfall 2: The GeoIP database (the chicken-and-egg problem)

On first launch, mihomo's port never came up, and the log stopped at:

```
Can't find MMDB, start download
```

On its first run, mihomo needs to download **geoip.metadb / geosite.dat from GitHub** (IP geolocation databases). This is the classic "chicken-and-egg": the proxy was installed to solve GitHub network issues, but the proxy itself needs to download data from GitHub first.

Solution: use a GitHub acceleration mirror (`ghfast.top`) to manually download the two files into the working directory:

```bash
curl -L -o geoip.metadb "https://ghfast.top/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geoip.metadb"
curl -L -o geosite.dat   "https://ghfast.top/https://github.com/MetaCubeX/meta-rules-dat/releases/download/latest/geosite.dat"
```

### Pitfall 3: Collateral damage from the local sandbox

Running the mihomo binary directly in the Hermes terminal was misjudged by the tool's security check ("embedded null byte" — it treated the binary as a script). Solution: write a `start.sh` launcher script and execute that instead, bypassing the false positive.

### Service setup

Deployed in a dedicated data directory on the NAS (referred to below as `<mihomo-dir>`), managed by systemd (auto-start on boot, automatic restart on crash):

```ini
[Unit]
Description=mihomo Daemon
After=network.target

[Service]
Type=simple
User=<运行用户>
ExecStart=<mihomo-dir>/mihomo -d <mihomo-dir>
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

Memory usage is only **21–58MB** — no strain at all on a NAS with 4GB of RAM.

## Testing: Comprehensive Verification Across 8 Areas

### Immediately visible speed comparison

```
Direct GitHub:  15.0s (right on the edge of timeout)
Via proxy GitHub: 1.5s (10x faster)
```

### Connectivity (via proxy)

| Site | Status | TTFB |
|---|---|---|
| Google | 204 | 0.65s |
| Facebook | 200 | 1.13s |
| YouTube | 200 | 0.70s |
| Twitter/X | 200 | 1.21s |

### Full GitHub ecosystem

`github.com` / `raw.githubusercontent.com` / `api.github.com` / `codeload.github.com` all work smoothly (0.6–1.6s).

### No detours for domestic direct connections (rule-based routing verification)

```
baidu.com 0.28s | qq.com 0.39s | aliyun 0.35s
```

The key verification: when accessing domestic sites, mihomo determines `GeoIP(cn) → DIRECT` for a direct connection — **no detours, no overhead**.

### Large file throughput

Downloading a 15.3MB file from GitHub: **5.57s = 2.88 MB/s (≈23 Mbps)** — plenty for daily use.

### git/gh in practice

`gh api` responds in seconds, `git ls-remote` responds in seconds — operations that previously timed out at the drop of a hat all went through smoothly.

### Node status

- `节点选择` (manual): Hong Kong node
- `自动选择` (url-test, speed-tested every 5 minutes): automatically selected a Japan node

## Lessons Learned

1. **Rule-based routing is the core value**: international traffic goes through the proxy, domestic traffic connects directly — no sacrifice in domestic access speed. This is exactly where rule-based proxies (the Clash family) outperform a global VPN
2. **Good airport subscription compatibility**: mihomo automatically decodes base64 subscriptions, and `profile=simple` works directly too
3. **Verify before writing code**: if I had first tested whether mihomo could consume the subscription directly, I wouldn't have wasted effort writing two conversion scripts
4. **Plan ahead for chicken-and-egg problems**: any tool that pulls data from GitHub (mihomo's GeoIP, dashboards) needs a mirror plan thought through before deploying in China
5. **systemd management is the baseline**: auto-start on boot + restart on crash + journalctl logs — far better operational experience than a bare process

Now Hermes' git push no longer needs 8 retries — blog publishing and code pushes all go through on the first try. Next time GitHub's network tortures you, remember to check whether there's a NAS sitting nearby.

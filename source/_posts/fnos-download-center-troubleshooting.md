---
title: "飞牛 NAS 下载中心故障排查实录：任务删不掉、无法下载的完整解决过程"
date: 2026-08-20 14:30:00
description: "飞牛(fnOS)下载中心出现\"已完成任务删不掉、无法添加新下载\"的故障，持续数月。本文记录完整排查过程：从任务数据库入手，层层下挖到 qBittorrent 引擎 5 个月无法启动，最终定位到两个叠加根因（admin 用户 home 目录丢失 + qbt 数据目录权限错乱），修复后实测验证端到端可用。"
tags: [fnOS, NAS, 下载中心, qBittorrent, aria2, 排障]
categories: [技术]
cover: /img/covers/fnos-download-center-troubleshooting.jpg
---

## 前言

家里的飞牛（fnOS）NAS 下载中心有个困扰了很久的毛病：**三个早已下载完成的任务（Ubuntu 镜像、两部剧）反复删除也删不掉，新的下载任务也添加不上**。问题持续了好几个月，一直没找到机会处理。

这篇文章记录完整的排查、定位、修复与验证过程——从"任务数据库里有什么"一路追到"qBittorrent 引擎为什么起不来"，希望能给遇到类似问题的朋友一个排查路径参考。

## 一、系统架构：下载中心其实是三层结构

fnOS 的下载中心（下载应用）不是单一程序，而是三部分协作：

| 组件 | 角色 | 说明 |
|---|---|---|
| `dlcenter` | 主守护进程 | systemd 服务，API 入口，负责任务数据库管理 |
| `trim-aria2c` | HTTP 下载引擎 | 处理 HTTP/HTTPS/FTP 直链下载 |
| `trim-qbittorrent-nox` | BT 下载引擎 | 处理磁力/BT 下载，qBittorrent v4.6.4 |

**关键数据与日志位置**（排查的抓手）：

- 任务数据库：`/usr/trim/var/downloadcenter/downloadcenter.db`（SQLite，TASKS/CONFIGS 表）
- 主日志：`/usr/trim/logs/dlcenter.log`（qbt/aria2 状态、fork 记录全在这里）
- qbt 配置与种子：`/usr/trim/var/downloadcenter/1000/qbt/qBittorrent/`（BT_backup 里存种子和续传文件）

> 每个用户（uid）有独立的数据目录，这里 `1000` 是 admin 用户的 uid。

## 二、排查过程：从数据库一路挖到引擎

### 第一步：任务数据库——三个任务都是 qBittorrent 类型

用 Python 直读 SQLite 数据库，TASKS 表正好 3 行，对应 UI 上删不掉的三个任务：

```text
ID=1  荣耀01-08（电影港）      TYPE=qbt  STATE=pausedUP  完成于 2026-03-10
ID=2  在你的灿烂季节 S01E01-04  TYPE=qbt  STATE=pausedUP  完成于 2026-03-10
ID=4  ubuntu-22.04.5-desktop  TYPE=qbt  STATE=pausedUP  完成于 2026-03-14
```

几个关键细节：

- 三个任务**全部是 qbt（qBittorrent）类型**——走 BT 引擎
- ID 是 1、2、4，**缺了 3**——说明曾经删掉过一个任务，但没删干净
- `pausedUP` = 已完成、暂停做种状态，数据完全下载完了

### 第二步：引擎进程——qBittorrent 根本没在运行

查进程，发现只有 `dlcenter` 和 `trim-aria2c` 在跑，**没有任何 qbittorrent 进程**。再翻 qbt 的数据目录，发现更惊人的事实：

```text
data/BT_backup/*.fastresume    最后修改 2026-03-16
data/logs/qbittorrent.log      最后写入 2026-03-16
```

**qBittorrent 引擎已经 5 个月没有运行过了**。而 dlcenter 日志里每 6 秒刷一条：

```text
sync maindata failed. code : 7.msg : Couldn't connect to server
sync maindata failed. code : 50331675.msg : initializing...
```

每 5 分钟还有一次重启 qbt 的尝试，全部失败：

```text
Restart the qbt due to too many login attempts
qbt pid = 61283 not exist
new process: 61547 forked     ← fork 出来的进程立刻死亡
```

真相逐渐清晰：**dlcenter 想连 qBittorrent 拿任务数据，但 qbt 引擎永远起不来**。所以删除任务（要调 qbt API）永远失败，添加 BT 任务（要交给 qbt）也永远失败。UI 上看到的任务列表只是数据库里的旧记录。

### 第三步：手动启动 qbt——逼出两个根因

既然日志里 qbt fork 即死，那就手动模拟 dlcenter 的方式启动它，看真实报错：

```bash
sudo -u admin /usr/trim/bin/trim-qbittorrent-nox --profile=/usr/trim/var/downloadcenter/1000/qbt
```

**根因 ①：admin 用户的 home 目录丢失**

```text
Could not create required directory '/home/admin/.cache/qBittorrent'
```

qBittorrent 启动第一步要创建用户缓存目录 `~/.cache/qBittorrent`，但系统 passwd 里 admin 的 home 是 `/home/admin`，**这个目录根本不存在**（不知道什么时候丢的）。qbt 连启动的资格都没有。

先补上 home 目录再试：

```bash
sudo mkdir -p /home/admin && sudo chown admin:Users /home/admin
```

这次 qbt 走得更远（出现了 "WebUI 将在内部准备不久后启动"），但立刻崩在第二个错误：

```text
terminate called after throwing an instance of 'AsyncFileStorageError'
```

**根因 ②：qbt 数据目录权限错乱**

`AsyncFileStorageError` 是 libtorrent 写续传文件失败的典型报错。检查 qbt 数据目录的所有权，发现问题：

```text
$ find /usr/trim/var/downloadcenter/1000/qbt/ -not -user admin | wc -l
20
```

**20 个文件/目录的所有者变成了 root:root**——包括 BT_backup 目录、所有 `.fastresume` 续传文件、配置文件、GeoDB 等。而 qbt 以 admin 用户运行，往这些目录写续传数据时直接崩溃。

修复：

```bash
sudo chown -R admin:Users /usr/trim/var/downloadcenter/1000/qbt/
```

### 第四步：dlcenter 自动接管——无需重启服务

dlcenter 有个"每 5 分钟自动重试 fork qbt"的机制。权限修好后的下一轮重试，日志出现了最想看到的一行：

```text
new process: 66161 forked
login with admin : 1000 successfully     ← qbt 起来了！
user 1000 all listen tcpv4 ok            ← BT 端口监听正常
```

**qBittorrent 引擎恢复运行，dlcenter 自动接管，全程不需要重启任何服务。**

## 三、验证：任务删除 + 添加下载 + 落盘

### 验证 1：三个删不掉的任务，全部删除成功

```bash
trim-cli download rm 1 2 4    # 返回 {}
```

任务列表清空，数据库 TASKS 表清零。**困扰数月的"删不掉"问题解除。**

### 验证 2：添加新下载，端到端可用

用英剧《Fearless》(2017 ITV) 做真实测试：从 TPB 数据库 API（apibay.org）找到磁力链接，添加到下载中心：

```text
Fearless 2017 S01 1080p WEB-DL HEVC x265 BONE
大小：3.72 GB（全季 6 集）
状态：downloading → 66MB 真实落盘 /vol1/1000/下载/
```

数据库确认任务入库，下载目录出现 4 个 `.part` 文件（多文件种子正常解析、并行下载），证明**添加 → 引擎处理 → 文件落盘**全链路正常。

> 小插曲：磁力添加请求耗时 15 秒，超过了命令行接口的 5 秒等待，客户端报"超时"，但任务实际已成功入库——**接口超时 ≠ 操作失败**，这是排查时容易踩的坑。

### 验证 3：测试任务清理

测试结束后删除任务、清理 66MB 测试文件，数据库/引擎/文件系统三处完全同步，下载中心回到干净初始状态。

## 四、经验总结

这次排查沉淀下几个可复用的要点：

1. **先看日志，再看 UI**。`/usr/trim/logs/dlcenter.log` 是下载中心故障的第一现场，sync 报错、qbt 重启循环全在里面。
2. **引擎状态用数据说话**。`BT_backup` 和日志的 mtime 是判断 qbt "多久没跑了"的铁证。
3. **权限问题排查**：`find <dir> -not -user <预期用户>` 一条命令找出所有权限错乱的文件。
4. **服务崩溃不一定在 UI 可见**。dlcenter 一直在跑、UI 正常打开，但底层引擎已经死了几个月——这类"僵尸服务"需要进程 + 日志 + 数据时间戳三方交叉验证。
5. **CLI 通道与 WebUI 通道是两回事**。命令行 API 偶发超时/报错（errno 135168）时，WebUI 可能完全正常，反之亦然；排查时别被单一通道的假象带偏。

## 五、遗留观察

- 三个任务的下载文件其实**早已不在 NAS 上**（下载目录为空）——它们是"下载完成过、后来被清理"，不是"没下载完"。qbt 恢复后把这些任务标记为 `missingFiles`（文件缺失），这也是它们此前显示异常的原因之一。
- 下载中心的 CLI 接口（trim-cli 5666 通道）在处理慢请求时会偶发 `errno 135168` 报错，属于已知不稳定点，不影响 WebUI 日常使用。

希望这篇记录对遇到类似问题的朋友有帮助。排查的思路比结论更重要：**问题在 UI 之外，答案在日志和数据里。**

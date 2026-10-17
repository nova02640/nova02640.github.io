---
title: 'fnOS Download Center Troubleshooting: The Full Fix for Undeletable Tasks and
  Failed Downloads'
date: 2026-08-20 14:30:00
description: 'The fnOS Download Center suffered a "completed tasks can''t be deleted,
  new downloads can''t be added" failure that lasted for months. This post records
  the full troubleshooting process: starting from the task database, digging layer
  by layer down to a qBittorrent engine that hadn''t started in 5 months, and finally
  identifying two compounding root causes (a missing home directory for the admin
  user + broken permissions on the qbt data directory). After the fix, end-to-end
  functionality was verified in practice.'
tags:
- fnOS
- NAS
- Download Center
- qBittorrent
- aria2
- Troubleshooting
categories:
- Technology
cover: /img/covers/fnos-download-center-troubleshooting.jpg
lang: en
layout: post
---


## Preface

My home fnOS NAS Download Center had been plagued by a nagging problem for a long time: **three long-completed download tasks (an Ubuntu image and two TV series) could not be deleted no matter how many times I tried, and no new downloads could be added**. The problem persisted for months, and I never found the time to deal with it.

This article records the complete troubleshooting, diagnosis, repair, and verification process — chasing all the way from "what's in the task database" to "why won't the qBittorrent engine start," in the hope of offering a reference troubleshooting path for anyone facing similar issues.

## 1. System Architecture: The Download Center Is Actually a Three-Layer Structure

The fnOS Download Center (the download app) is not a single program but three components working together:

| Component | Role | Description |
|---|---|---|
| `dlcenter` | Main daemon | systemd service, API entry point, responsible for task database management |
| `trim-aria2c` | HTTP download engine | Handles direct HTTP/HTTPS/FTP downloads |
| `trim-qbittorrent-nox` | BT download engine | Handles magnet/BT downloads, qBittorrent v4.6.4 |

**Key data and log locations** (the starting points for troubleshooting):

- Task database: `/usr/trim/var/downloadcenter/downloadcenter.db` (SQLite, TASKS/CONFIGS tables)
- Main log: `/usr/trim/logs/dlcenter.log` (qbt/aria2 status and fork records are all here)
- qbt config and torrents: `/usr/trim/var/downloadcenter/1000/qbt/qBittorrent/` (BT_backup stores torrents and resume files)

> Each user (uid) has its own data directory; here `1000` is the admin user's uid.

## 2. Troubleshooting: Digging from the Database All the Way to the Engine

### Step 1: The Task Database — All Three Tasks Are qBittorrent Type

Reading the SQLite database directly with Python, the TASKS table had exactly 3 rows, corresponding to the three tasks that couldn't be deleted in the UI:

```text
ID=1  Glory 01-08 (Movie Port)      TYPE=qbt  STATE=pausedUP  Completed 2026-03-10
ID=2  In Your Bright Season S01E01-04  TYPE=qbt  STATE=pausedUP  Completed 2026-03-10
ID=4  ubuntu-22.04.5-desktop  TYPE=qbt  STATE=pausedUP  Completed 2026-03-14
```

A few key details:

- All three tasks are of the **qbt (qBittorrent) type** — they go through the BT engine
- The IDs are 1, 2, and 4 — **3 is missing**, meaning a task had been deleted at some point, but not cleanly
- `pausedUP` = completed, paused seeding state — the data was fully downloaded

### Step 2: The Engine Process — qBittorrent Wasn't Running at All

Checking the processes, only `dlcenter` and `trim-aria2c` were running — **no qbittorrent process whatsoever**. Digging into the qbt data directory revealed an even more alarming fact:

```text
data/BT_backup/*.fastresume    last modified 2026-03-16
data/logs/qbittorrent.log      last written 2026-03-16
```

**The qBittorrent engine hadn't run for 5 months.** Meanwhile, the dlcenter log was printing a line every 6 seconds:

```text
sync maindata failed. code : 7.msg : Couldn't connect to server
sync maindata failed. code : 50331675.msg : initializing...
```

Every 5 minutes there was also an attempt to restart qbt, all failing:

```text
Restart the qbt due to too many login attempts
qbt pid = 61283 not exist
new process: 61547 forked     ← the forked process died immediately
```

The truth was coming into focus: **dlcenter wanted to connect to qBittorrent to fetch task data, but the qbt engine could never start.** So deleting tasks (which requires calling the qbt API) always failed, and adding BT tasks (which must be handed to qbt) always failed too. The task list shown in the UI was just old records in the database.

### Step 3: Manually Starting qbt — Forcing Out Two Root Causes

Since the log showed qbt dying right after being forked, I started it manually in the way dlcenter does, to see the real error:

```bash
sudo -u admin /usr/trim/bin/trim-qbittorrent-nox --profile=/usr/trim/var/downloadcenter/1000/qbt
```

**Root cause ①: The admin user's home directory is missing**

```text
Could not create required directory '/home/admin/.cache/qBittorrent'
```

qBittorrent's first step on startup is to create the user cache directory `~/.cache/qBittorrent`, but the system passwd file says admin's home is `/home/admin` — **and that directory simply doesn't exist** (it's unknown when it was lost). qbt didn't even qualify to start.

First, create the home directory and try again:

```bash
sudo mkdir -p /home/admin && sudo chown admin:Users /home/admin
```

This time qbt got further (it printed "WebUI will start internally shortly"), but immediately crashed on the second error:

```text
terminate called after throwing an instance of 'AsyncFileStorageError'
```

**Root cause ②: Broken permissions on the qbt data directory**

`AsyncFileStorageError` is the typical error libtorrent throws when it fails to write resume files. Checking ownership of the qbt data directory revealed the problem:

```text
$ find /usr/trim/var/downloadcenter/1000/qbt/ -not -user admin | wc -l
20
```

**20 files/directories were owned by root:root** — including the BT_backup directory, all `.fastresume` resume files, config files, GeoDB, and more. And since qbt runs as the admin user, it crashed outright when trying to write resume data to these directories.

Fix:

```bash
sudo chown -R admin:Users /usr/trim/var/downloadcenter/1000/qbt/
```

### Step 4: dlcenter Takes Over Automatically — No Service Restart Needed

dlcenter has a "retry forking qbt automatically every 5 minutes" mechanism. On the first retry after the permissions were fixed, the log produced the line I most wanted to see:

```text
new process: 66161 forked
login with admin : 1000 successfully     ← qbt is up!
user 1000 all listen tcpv4 ok            ← BT port listening normally
```

**The qBittorrent engine resumed operation, dlcenter took over automatically, and no service had to be restarted at any point.**

## 3. Verification: Task Deletion + Adding Downloads + Files on Disk

### Verification 1: All Three Undeletable Tasks Deleted Successfully

```bash
trim-cli download rm 1 2 4    # Returns {}
```

The task list was emptied and the database TASKS table zeroed out. **The months-old "can't delete" problem was resolved.**

### Verification 2: Adding a New Download — End-to-End Works

I used the British series *Fearless* (2017 ITV) as a real-world test: found a magnet link via the TPB database API (apibay.org) and added it to the Download Center:

```text
Fearless 2017 S01 1080p WEB-DL HEVC x265 BONE
Size: 3.72 GB (full season, 6 episodes)
Status: downloading → 66MB actually written to disk in the NAS download directory
```

The database confirmed the task was stored, and 4 `.part` files appeared in the download directory (multi-file torrents parsed and downloaded in parallel), proving the full chain of **add → engine processing → files on disk** was working.

> A minor episode: the magnet-add request took 15 seconds, exceeding the command-line interface's 5-second wait, so the client reported a "timeout" — but the task had actually been stored successfully: **an interface timeout ≠ an operation failure**. This is an easy pitfall to fall into while troubleshooting.

### Verification 3: Cleaning Up the Test Task

After the test, the task was deleted and the 66MB of test files cleaned up. Database, engine, and filesystem were fully in sync across all three, and the Download Center returned to a clean initial state.

## 4. Lessons Learned

This troubleshooting session distilled several reusable takeaways:

1. **Check the logs before the UI.** `/usr/trim/logs/dlcenter.log` is the primary crime scene for Download Center failures — sync errors and the qbt restart loop are all in there.
2. **Let data speak for engine status.** The mtime of `BT_backup` and the logs is hard evidence of "how long qbt hasn't been running."
3. **Checking for permission problems:** a single command, `find <dir> -not -user <expected user>`, finds every file with wrong ownership.
4. **A crashed service isn't necessarily visible in the UI.** dlcenter kept running and the UI opened fine, while the underlying engine had been dead for months — this kind of "zombie service" requires cross-verification across processes, logs, and data timestamps.
5. **The CLI channel and the WebUI channel are different things.** When the command-line API sporadically times out or errors (errno 135168), the WebUI may be perfectly fine, and vice versa — don't be misled by the illusion of a single channel while troubleshooting.

## 5. Remaining Observations

- The download files for the three tasks were actually **long gone from the NAS** (the download directory was empty) — they were "completed once and later cleaned up," not "never finished downloading." After qbt recovered, it marked these tasks as `missingFiles` (files missing), which is one of the reasons they displayed abnormally before.
- The Download Center's CLI interface (trim-cli channel 5666) sporadically throws `errno 135168` when handling slow requests. It's a known instability that doesn't affect everyday WebUI use.

I hope this record helps anyone facing a similar problem. The thinking behind troubleshooting matters more than the conclusion itself: **the problem lies outside the UI, and the answers lie in the logs and data.**

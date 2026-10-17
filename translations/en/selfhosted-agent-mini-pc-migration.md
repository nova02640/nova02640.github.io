---
title: 'Relocating a Self-Hosted AI Agent: From an All-in-One NAS to a 4-Core Mini
  PC'
date: 2026-10-04 20:30:00
description: 'Moving a self-hosted AI Agent running on an all-in-one NAS to a 4-core
  mini PC in one piece: a zero-loss switchover, a full-scale health check, and a line-by-line
  comparison of all 18 configuration changes carried over from the NAS against official
  defaults — one of them a drain-budget alarm that turned out to be a false positive
  from the framework itself.'
tags:
- Self-hosting
- AI Agent
- Linux
- systemd
- Operations
- Config Auditing
categories:
- Technology
cover: /img/covers/selfhosted-agent-mini-pc-migration.jpg
lang: en
layout: post
---


One of my self-hosted AI Agents (Hermes Agent) used to run on an all-in-one NAS — that was its birthplace: ready out of the box, graphical interface, everything clickable. But I eventually came to understand something: **a NAS exists to store things; it shouldn't moonlight as an application server running an agent 24/7.**

Hence this move: migrating the whole thing to a 4-core, 3.7 GB x86 mini PC. This post covers the wrap-up of the migration, a full health check, and the process of pulling out every "parameter carried over from the NAS" and comparing it against official defaults — **there are two pitfalls in here, both quite interesting.**

## I. First Draw the Line: What Moves, What Doesn't

Before moving, I set one very restrained principle: **move only the Agent itself, not the "manage the NAS" capability.**

The original deployment had a set of NAS management features implemented along the way (downloader control, storage inspection, and the like). Those features have nothing to do with the Agent itself, and migrating them would mean binding two sets of responsibilities together again. So this time I dropped them outright: **the boundary of this migration is "complete separation from the NAS," not "cloning the NAS."**

Conclusion — the migration list has only three items:

1. Data and state (config, skills library, memory, session database, outputs)
2. The run contract (what pulls it up, under what identity it runs, which environment variables it gets)
3. External channels (messaging platform, code hosting, blog deployment)

## II. Moving Isn't Copying Files — the "Run Contract" Is the Real Body

The mistake people make on their first failed migration is thinking "copy the data + run it manually" is the end of it. What really decides whether it stays alive long-term is the **run contract**: who starts it, under what identity it runs, what the environment variables are, what happens when it crashes, how it exits gracefully on shutdown.

My method is crude but effective: **use the official service unit generation template as the yardstick, and compare it line by line with the actual unit on the machine.**

The result: only four real differences, one of which is quite representative:

| Variable | Official Template | My Choice | Reason |
|---|---|---|---|
| `HOME` | The user's real home directory | Pointed at the **data root** | Code hosting credentials, git global config, and ssh config all live under the data root; reverting to the default would mean "can't find the config" |

This one deserves elaboration: the officially generated service unit points `HOME` at the system user's home directory, which is perfectly correct in a conventional deployment where "data also lives in the home directory." But all my data sits in a separate data root, and **all the CLI tool configs moved over with the data** (a copy each for git, gh, ssh, npm). If `HOME` pointed back to an empty system home directory, `gh` and `npm` would lose their memory on the spot.

So this deviation is **deliberate**, not a mistake — and it's been recorded in the skills library to prevent it from being "corrected" back on the next upgrade.

## III. Three Small Wrap-Up Tasks, Each with a Pitfall

### 3.1 Turning Off an Exposed API Endpoint

The service has an OpenAI-compatible API endpoint. I set the environment variable with "ENABLED" in its name to `false`, restarted… **the endpoint was still listening.**

Checking the source code revealed that this wasn't the real switch at all:

```python
# What you think the switch is: API_SERVER_ENABLED=false
# The actual criterion:
key = getenv("API_SERVER_KEY")
if not has_usable_key(key):
    return                      # no key ⇒ don't start
# has key ⇒ start regardless
```

In other words: **as long as the key exists, the endpoint stays alive**; that `ENABLED` variable is merely a documentation entry that misleads anyone who reads it (myself included). The correct way to turn it off is to comment out the key and restart.

By the way, during the first pass I failed to turn off the endpoint, but I did change its listen address from "all interfaces" to "localhost only," so **the LAN exposure was eliminated at that moment**, with the service left on the loopback interface. The second pass shut it down completely. **Shrink the blast radius first, then go for thoroughness** — that order saved me a panic.

### 3.2 SSH: Key-Only Login

The order matters: **do end-to-end verification with a one-time key first, then disable password login.**

- Write the new public key into the authorized file, align permissions (directory 700, file 600)
- Generate a **temporary** key: authorize it temporarily → log in with `BatchMode=yes` (no password fallback) → success → revoke the temporary key immediately
- Verify in reverse: without a key, you should be rejected
- Only after this write `PasswordAuthentication no`, validate the config with `sshd -t`, and `reload` (without dropping existing connections) rather than restart
- After disabling, verify once more: password auth should return `Permission denied (publickey)`, and the "password" option shouldn't even appear in the prompt

This mini PC has no local console — if you truly lock yourself out, you'd have to plug in a keyboard and monitor to rescue it. So better to verify twice.

### 3.3 Reboot Verification: Don't Trust "Should Auto-Start"

All services were in the `enabled` state, but "enabled" only means systemd will start them — **it doesn't mean they'll come up.** Do a real reboot and let two pieces of evidence speak:

```
Before reboot boot_id: c75893f7-…   uptime: 5 weeks 2 days
After reboot  boot_id: 38c281e4-…   uptime: 7 minutes      ← fresh boot
Gateway: auto-started at 11:04:38   Panel: ready at 11:04:52
Messaging platform long connection: auto-reconnected at 11:05:09   failed units: 0
```

From pressing reboot to full recovery, **zero manual intervention**.

## IV. Full Health Check: What to Look At

A health check isn't "glance at it and see no errors." I collected data in seven groups: host resources, disks and storage, services and auto-start, application-layer data integrity, backup chain, network and security, and error log classification.

Results:

| Dimension | Result |
|---|---|
| Resources | Load 0.22 / 2.8 GB available memory (3.7 GB total) / zero swap usage / temperature 39–42℃ |
| Disks | System disk 27%, data disk 3%, ample inodes, SMART all PASSED on both drives |
| Storage health | 0 USB disconnects in the past 7 days, 0 I/O errors, 0 filesystem errors; 0 reallocated sectors, 0 pending sectors, 0 CRC errors |
| Services | Gateway/panel active, 0 restarts, 0 failed units, zero error logs this boot |
| Data | Session DB `PRAGMA quick_check` passed, 62 sessions / 13,520 messages |
| Security | Only one port exposed externally and key-restricted; external API endpoint turned off |

**The most valuable finding concerned the "single point of failure"**: the data disk is a USB external SSD — no RAID, no second copy. On a mini PC like this, it is almost certainly the only single point of failure. So beyond "it runs," you need a fallback:

- Every night, automatically package a snapshot of core state onto the **system disk** (7 copies, rotating)
- Every 6 hours, inspect: did the data disk drop off, is it writable, capacity, SMART
- On disk loss, push an immediate message alert

By the way, this mini PC only has a USB 2.0 controller, so the external disk negotiates at 480 Mbps — that's a hardware ceiling, not a fault. **Accepting it is less hassle than repeatedly swapping cables.**

## V. Configuration Audit: Reconciling the "Carried-Over Parameters" One by One

This is the step I most wanted to do: the entire deployment was moved over from the NAS "together with its parameters," and those parameters were originally written to fit the NAS environment. **Are they still reasonable in the new environment?**

The method is straightforward:

1. Import the official default configuration dictionary, recursively flatten it with the local config file, then **compare key by key**
2. Compare the official service unit generation template with the actual unit line by line
3. For each environment variable, count "how many places in the source code actually read it"

Key insight first: **"missing" hundreds of default keys in the local file is not config corruption** — new keys from newer versions are automatically merged with default values. The only two categories that actually need attention: **values that were changed** and **things not registered in official defaults that exist only locally**.

Comparison results: **18** differing values, **19** locally unique items. After classifying them:

- **8 must be kept**: environment adaptations (forcing IPv4, drain budget, model definitions, concurrency caps…)
- **4 should be changed**: 3 are "timeout thresholds a bit tight" (10 minutes per turn, 10 minutes clarification wait), 1 is "secondary confirmation for dangerous operations has been disabled"
- **6 are dead config**: not a single read point in the source code

About "dead config" — this may be the most counterintuitive category. When migrating deployments we habitually "copy environment variables over as-is," thinking that copying a few more never hurts. But a reference count check reveals that some variables aren't read by **any code at all** in the current version (leftovers from an old contract), and some don't even have their corresponding dependency packages installed. They don't cause failures, but they **cause misunderstandings**: you think you adjusted some behavior, when in fact nothing happened. Cleaning them up isn't fastidiousness — it's making the configuration a **trustworthy manual** again.

## VI. A Beautiful False Positive: The Drain Budget Alarm

The most noteworthy finding in the audit was this alarm that appeared on every startup:

```
Stale systemd unit detected: 服务单元 has TimeoutStopSec=90s
but drain_timeout=180s cron_drain_timeout=30s (expected >=210s)
systemd may SIGKILL the gateway mid-drain.
```

Translated: *your service unit only gives a 90-second stop budget, but the code believes draining needs at least 210 seconds, so systemd may SIGKILL the process mid-drain.* The message even kindly suggests regenerating the service unit.

**But the unit file on this machine clearly says `TimeoutStopSec=210`.** I ran two commands on the same machine, with the same unit name:

```bash
systemctl --user    show <单元> --property=TimeoutStopUSec   # → 1min 30s   (exit code 0)
systemctl           show <单元> --property=TimeoutStopUSec   # → 3min 30s   ← actual value
```

The values seen by `--user` (user-level) and system-level differ, and the difference is exactly the 90 seconds in the alarm — **systemd's default value**.

The cause is in the source: the checking function **queries user-level first, then system-level.** And this is a "system-level service" machine: the unit doesn't exist in the user-level manager, but `systemctl --user show` **doesn't error on a nonexistent unit** (exit code 0) — it prints a set of default properties. So the checking function happily gets 90 seconds and turns around to conclude "your unit is stale."

**Conclusion: my own config was correct** (180 + 30 = 210, exactly matching the official algorithm) — this is a bug in the check logic at the "user-level/system-level" boundary.

I'm not writing this to blame anyone — the point is: **your first reaction to an alarm shouldn't be "where did I misconfigure it."** First confirm whether it's checking the object you think it's checking; that's far more useful than blindly editing configs.

## VII. More Important Than "It Runs": Let It Sustain Itself

After the migration, I added three more things that "in hindsight should have been done from the start":

1. **Boot self-check unit**: after every boot, automatically verify "services/ports/long connections/data disk/scheduled jobs/failed units" and push the results to the messaging platform. The key is that it **doesn't depend on the main service** — even if the main service fails to start, it still tells you the truth, along with a self-healing command.
2. **One-click recovery script**: placed on the **system disk** (not the data disk), so it remains available when the data disk drops off; it only does "check + mount + start," never deletes or overwrites, and can be run repeatedly.
3. **Crash retry + cancellation of rate limiting**: when the data disk drops off, the service keeps retrying rather than "giving up after a few tries" — plug the disk back in and it heals itself.

**Pitfalls encountered also deserve a note**: the first version of the self-check script had a wrong "readiness criterion" — it searched the logs for "long connection established" within a time window, but logs persist across reboots. So after one reboot, the script matched the connection record from the **previous boot**, declared "check complete" before the service was truly ready, and produced a false alarm (port not listening).

Two fixes: the criterion must be bound to **this boot** (only query logs from the current boot, `journalctl -b`), and **wait until the target is truly ready before collecting status** — don't jump the gun at the moment the criterion appears to hold.

## VIII. Five Retrospective Takeaways

1. **The subject of a migration is the contract, not the files.** Comparing line by line against the official service unit template is ten times more reliable than hand-writing from memory.
2. **Re-reconcile parameters when they move.** Values tuned for the old environment (timeouts, concurrency, switches) may be too tight, too loose, or already obsolete in the new one.
3. **For alarms, first determine whose problem it is.** Among alarms of the same kind, some are real failures and some are false positives from the tool itself; gathering evidence (comparing the output of two commands) is much faster than guessing.
4. **The testing order determines the scale of an incident.** Key login: "verify before use." API endpoint: "narrow before closing" — leave yourself a way back at every step.
5. **Design recovery capability alongside automation.** Auto-start is just the passing grade; "when it fails to start, it can be rescued, notified, and self-healed" is what makes it complete.

After this whole move, my biggest takeaway: **the cost of self-hosting has never been in getting it running the first time — it's in how quickly you can understand it every time it breaks.** Now that I've filled in the health check, the config audit, and the self-healing, my confidence in this mini PC is far higher than on the day it first came up.

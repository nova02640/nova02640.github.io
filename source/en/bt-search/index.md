---
title: '"Finding It ≠ Being Able to Download It": Adding a Chinese Search Frontend
  and Dead-Torrent Pre-Screening to a Self-Hosted Magnet Indexer'
date: 2026-10-02 22:00:00
description: 'A self-hosted DHT indexer can scrape torrent metadata from across the
  internet, yet it can''t answer the most practical question of all: is anyone still
  seeding this magnet link? Even more interestingly, its Chinese search is architecturally
  broken — the default tokenizer treats an entire Chinese string as a single word.
  This post documents the full process of adding "seed-alive pre-screening + Chinese
  search" to the indexer, including four bugs that only surfaced once things were
  actually running, and an investigation that overturned a second-hand conclusion.'
tags:
- DHT
- BitTorrent
- Magnet Search
- Python
- SQLite
- FTS5
- Self-Hosted Services
- Open Source
categories:
- Tech
cover: /img/covers/bt-search.jpg
lang: en
layout: post
---


I run a DHT indexer on a small LAN box that sits idle most of the time. It works hard: hooked into BitTorrent's DHT network, it logs every torrent announced to it. In practice it records 0.7 entries per second — 60,000 a day — with full metadata (name, size, file list) included.

But once you actually try to use it, you realize it only solves the question of "**what exists**," and not at all the question of "**can I download it**."

## 1. The Indexer's Two Blind Spots

**Blind spot one: finding something doesn't mean you can download it.**

The index database does have `n_seeders` / `n_leechers` fields — which sounds exactly like "number of seeders." I checked with high expectations: **across all 285 records in the database, both columns are entirely NULL.**

This isn't a bug; it's an inherent limitation of DHT indexers. It merely "hears" on the DHT network who is announcing a torrent — whether anyone is still seeding right now, it never verifies. So you find something that looks great, paste the magnet link into your client, and it sits frozen at 0% forever — **every search result is a blind box.**

**Blind spot two (more subtle): its Chinese search is architecturally broken.**

The indexer ships with a web interface backed by SQLite's FTS5 full-text index. I searched a Chinese keyword and got 0 results — even though I knew the name was in the database.

Digging in revealed the root cause: FTS5's default tokenizer, `unicode61`, treats **an entire run of consecutive Chinese characters as a single token.** In the index, 《诸神的黄昏》 (Twilight of the Gods) is **one indivisible word**. So:

- Searching 「诸神的黄昏」 — hits (exact full-string match)
- Searching 「诸神」 — **doesn't hit** (not equal, not a prefix either… actually prefix queries can save half of this)
- Searching 「黄昏」 — **can never hit** (it's in the middle of the token, and FTS5's token matching doesn't recognize "substring within a token")

The reality: **19% of my entries have Chinese names.** One fifth of the content is invisible to this search box. That's not "poor UX" — that's a **feature that doesn't exist.**

So I set myself a goal: **add seed-alive pre-screening and Chinese search, building it into a search tool just for myself.**

## 2. Solving "Does It Exist": Technology Selection

For the indexer I chose magnetico — because it runs as **a single static binary plus one SQLite file**, no Docker, no PostgreSQL, very friendly to an idle 4-core, 3.7 GB box. (The more full-featured bitmagnet requires Postgres; neither the cost nor the blast radius is in the same league.)

The selection itself wasn't complex, but I hit two traps:

**Trap one: SQLite requires the `-cgo` build.** The release includes a `magnetico-linux-amd64` that looks most normal, but running it immediately throws `go-sqlite3 requires cgo to work. This is a stub` — it's built with `CGO_ENABLED=0`, and the static build only works with PostgreSQL. You need the one with the `-cgo` suffix.

**Trap two: the default bootstrap nodes are nearly unusable in China.** Upstream defaults to the author's self-hosted `dht.tgragnato.it` (six ports). The domain has multiple A records with round-robin, and in practice it's flaky — sometimes reachable, sometimes not. Switching to the public `dht.transmissionbt.com:6881` was far more stable — across multiple tests it consistently responded with 56 bytes.

A bonus trivia note: **magnetico has no subcommands.** It's not `magnetico crawl`; you pass options directly (`-d` runs only the crawler, `-w` runs only the Web UI). I initially typed `crawl` out of habit — luckily I ran `--help` before writing the docs and didn't put the wrong command into the README.

## 3. Determining Whether a Torrent Is Alive or Dead: Queries Only, No Content Downloads

The core idea is straightforward: **for each info_hash, ask the DHT network, "Who's on this torrent?"**

Technically it's the BEP-5 `get_peers` query: pick the nodes in the local DHT routing table closest to the target info_hash, send a KRPC query, and collect the returned peer list. Peers come back → alive; clearly some nodes responded but zero peers → dead; no responses at all → uncertain (network jitter, retry later, **never misclassify as dead**).

The entire probe **only sends UDP query packets — it downloads no content**, so bandwidth overhead is tiny (a few Mbps). I implemented the probe engine with pure standard library code: bencode encoding/decoding, and the node table bootstrap / extension / persistence are all hand-written, with zero third-party dependencies.

**The key question is how you verify the judgments are correct.** I designed ground-truth tests:

- **Positive sample**: the Debian official ISO torrent — mirror sites worldwide are seeding it, so it's **definitely alive**. In practice it returned **256 peers** ✅
- **Negative sample**: a randomly generated info_hash — there can't be any peers. In practice: **0 peers** ✅
- Cross-validated against 8 real torrents from the index database: all detected, peer counts ranging from 2 to 135 ✅

Of course, if you write the engine yourself, you test it with questions that have known answers.

## 4. Load Testing Decides the Architecture

The most important next step was load testing — because the architecture depends on a ratio.

I ran the probe engine and measured throughput at different batch sizes. Result: **~6.9 probes/second at batch size 50** (≈600,000/day).

The indexer's ingest rate is **0.7 entries/second.** That means **detection capability is ten times the production rate** — full pre-screening keeps up easily; no need for compromises like "sampling" or "only check popular torrents."

So the architecture was set: a resident worker with a dual-priority queue.

- **Queue A (search juggling, small batches of 16)**: torrents the user is currently viewing get probed first, status within seconds;
- **Queue B (background backfill, batches of 50)**: scanning from newest to oldest, skipping torrents already probed and not yet expired.

Combined with a TTL strategy: alive torrents rechecked every 24 hours, dead torrents every 7 days, failed probes retried after 1 hour. This keeps search results fresh without wasting bandwidth repeatedly re-verifying the same data.

## 5. Four Bugs That Only Surfaced Once It Was Actually Running

This is the part I most want to document. The gap between "code runs after you write it" and "code actually works" is these bugs.

### Bug 1: The architectural flaw in Chinese search

As mentioned, the root cause: `unicode61` treats an entire Chinese string as one token.

To fix it, I first tried FTS5's other built-in tokenizer, `trigram` (trigrams, natively supports substrings) — **but it requires queries of at least 3 characters**, and 「诸神」 is only 2, so it failed outright. Two-character Chinese words are far too common; that path doesn't work.

The final solution was to build my own index:

- **When indexing**: split every CJK character with spaces: `诸神的黄昏` → `诸 神 的 黄 昏` (non-CJK characters kept as-is)
- **When querying**: join Chinese by **bigrams**: `"诸 神" AND "神 的" AND "的 黄" AND "黄 昏"`, and convert English/numeric terms to prefix queries like `"1080p"*`

This way 1-character, 2-character, and any-position Chinese substrings all hit, while the adjacency constraint of bigrams keeps precision high. After the fix, 「诸神」, 「黄昏」, 「中文字幕」, 「电影」 all hit, in 1–6ms.

The same index incidentally solved English substring matching too (searching `nkkd` hits `17.nkkd011`).

### Bug 2: A non-UTF-8 torrent name took down the whole API

After going live, an endpoint started intermittently returning 500s. The exception in the logs was odd:

```
OperationalError("Could not decode to UTF-8 column 'name' with text '2012.03.21_...rmvb'")
```

The cause: the index database contains **legacy non-UTF-8 encoded torrent names** (GBK, Shift-JIS, etc. — artifacts of old Windows days). Python's `sqlite3` default `text_factory` attempts strict UTF-8 decoding and throws on such names — **the entire query fails, and the entire endpoint 500s.**

The fix was a custom `text_factory` doing lenient decoding (`errors="replace"`): bad characters become replacement symbols, without bringing down the endpoint.

### Bug 3: I got systemd's dependency backwards

I wrote `Requires=magnetico.service` in my service unit, thinking "I depend on it." But systemd's semantics are: **if the depended-on unit stops, the unit depending on it also gets stopped.** So whenever the indexer restarted (say, for an upgrade), the search service went down with it — and wouldn't come back automatically. I hit this during testing.

Changing it to `Wants=` (soft dependency) fixed it: when the indexer is down, the search service degrades gracefully (the database is still there, just not updating).

### Bug 4: A dict key collision made me think "all probes are broken"

I glanced at the stats endpoint and noticed "alive torrents" dropped from 776 to 423, while "probed" was rising. My first thought: the probing had broken.

After digging through the database for a while, I found the data was perfectly fine. The real culprit was one lazy line of Python:

```python
return {"indexed": ..., **health.counts(), **prober.snapshot()}
```

`health.counts()` returns **cumulative** alive/dead counts, while `prober.snapshot()` contains alive/dead counts **for this process session** — **the two dicts share key names, and the latter overwrote the former.** So the "alive count" I was looking at was actually "alive torrents probed since this process started," unrelated to the whole database. The self-contradicting numbers led me to suspect the wrong thing.

Lesson: when merging via dict unpacking (`**a, **b`), **duplicate keys are silently overwritten** — no error is raised. Renaming the session counters to `session_*` solved it.

## 6. Proving It Actually Works

I don't trust "page opens = done" as acceptance criteria. So I built three layers of verification:

**Layer one: end-to-end proof of dead-torrent filtering.** Take a torrent from the alive database **already judged dead**, search by its name, then assert: it does NOT appear when "hide dead torrents" is on, and it DOES appear when off. This proves "the filtering logic actually works," not "I think it works."

**Layer two: the frontend actually executed via jsdom.** The easiest frontend acceptance is "I opened it in a browser, looked at it, seemed fine" — but that's neither repeatable nor detail-complete. Better to have the page truly run in a headless environment: load it with jsdom, inject `fetch`, then really trigger searches, click buttons, and assert rendered row counts, Chinese search, dead-torrent filtering, file-list expansion, empty-result prompts, and **zero JS errors throughout.**

One run produced 12 conclusions, and it's repeatable. This test suite later caught the security issue I'm about to mention.

**Layer three: security testing.** The service is exposed on the LAN, so path traversal, XSS, etc. all had to be tested by hand:

```bash
curl --path-as-is "http://<host>:8090/static/../../etc/passwd"   # expect 404
curl --path-as-is "http://<host>:8090/static/%2e%2e%2fapp.py"    # expect 404
```

On the frontend side, I stuffed `<img src=x onerror=...>` into the search box inside jsdom and asserted it **does not execute**, and that the UI displays the escaped literal text.

## 7. A Second-Hand Conclusion That Turned Out to Be Backwards

Halfway through development, I came across a claim: **"You should use bitmagnet, because magnetico is no longer maintained."**

It sounded very reasonable — and it was the kind of question that would decide whether to tear everything down and start over. Rather than take it at face value, I pulled first-hand data from the GitHub API:

| Repository | Stars | Last Commit | Commits (90d) | Latest Release |
|---|---|---|---|---|
| `boramalper/magnetico` (**original**) | 3131 | 2022-01-20, **archived** | 0 | v0.12.0 (2020-11) |
| **`tgragnato/magnetico` (the fork I'm using)** | 147 | **2026-09-29** | **54** | v2.4.1 (2026-09-28) |
| `bitmagnet-io/bitmagnet` | 4387 | 2026-05-21 | **0** | v0.10.1-**beta**.1 |

The conclusion was the reverse:

- "magnetico is unmaintained" actually refers to the **original repository** — which was indeed archived back in 2022, and it's the first result when you search "magnetico" (with all the stars on it too). What I'm using is the **community's active fork**, with a commit from two days ago.
- Meanwhile the recommended bitmagnet has **0 commits in the last 90 days**, and its last release was a beta (stable releases stopped at 2025-03).

I didn't switch. What this taught me isn't "which project is better," but: **second-hand claims like "project X is dead/superior" are worth five minutes of pulling first-hand data to verify** — especially when they'd have you throw away existing work. Star counts, archive status, and commit timelines are all in the API, for free.

By the way, during that period I also noticed bitmagnet has an issue requesting "SQLite storage support" (meaning it still requires Postgres), while magnetico has an issue requesting "add seeders/leechers fields" — **exactly the dead-torrent pre-screening I built.** Upstream hasn't done it yet, so I built it for myself first.

## 8. Going Open Source, and the Privacy Audit Before Release

Once the code was done, I open-sourced it: **https://github.com/nova02640/bt-search** (AGPL-3.0).

Regarding licensing and attribution, I made a deliberate choice. This project **does not modify a single line of upstream source code** — it only reads upstream's SQLite index database in read-only mode; the alive-probing was implemented by me from scratch per the BEP-5 spec. So:

- **No fork** — I created a standalone repository instead. Forking a repo you haven't modified would falsely imply "my changes are in here";
- The **very top of the README** states the derivative-work declaration (which branch it's based on, that the original is archived, and that the same license applies);
- The license follows upstream's **AGPL-3.0** — this way there's no ambiguity whether it's viewed as a "derivative work" or an "independent implementation."

Before release I ran a privacy audit, scanning **all files plus the entire git history** with regexes, checking for: credential keywords, private key blocks, emails, LAN IPs, private paths, host usernames, and real magnet links.

One finding deserves special mention: the scan flagged `dht_probe.py` hitting `"192.168."`. I opened it up — it's the **private-address filter allowlist** in the probe engine (used to avoid sending probe packets to reserved LAN addresses). **It's a security feature, not a leak.** If I had "cleaned it up" without looking at the context, I would have deleted a protection mechanism with my own hands. The scanner only flags things — the judgment still has to be made by a human.

There were four real issues to fix, all of my own making:

| Issue | Fix |
|---|---|
| 500 errors returned raw exception text to the client (leaking internal paths/SQL details) | Return only `internal error`; details go to local logs |
| Search term echoed back via `innerHTML` (self-XSS vector) | HTML-escape it, plus null-check the return value |
| Service file contained the host username | Replace with a `YOUR_USER` placeholder |
| Static directory prefix check didn't include a path separator (theoretically bypassable by a directory sharing the prefix) | Add separator comparison |

After fixing, I redeployed and ran all four verifications: all four path-traversal variants return 404, normal static files still return 200, the XSS assertion doesn't execute, and functional regression passes. **A security fix without verification is no fix at all.**

## 9. What It Looks Like Now

The service runs resident on the LAN — any device can just open it and use it: arbitrary Chinese substring search, results with peer counts and detection timestamps, dead torrents hidden by default, one-click magnet link copy, expandable torrent file lists.

Measured numbers:

- With an index of ~1,800 entries: **1,758 probed, of which 255 are dead (~14.5%)** — meaning without this filter, **1 in every 7 search results is a dead link**;
- Search response time 1–15ms; the service itself uses ~17MB RAM and ~3% CPU;
- Probe throughput 6.9/sec — full pre-screening runs with no pressure.

There are limitations worth being clear about: **the index is young.** It went live only a few hours ago and can only accumulate about 60,000 entries a day, so obscure old torrents likely won't be searchable tonight — not a feature gap, it just hasn't crawled that far yet. Few peers on DHT doesn't always mean dead either (obscure torrents can be misjudged). And most importantly: **this system only determines "is anyone seeding," not whether the content is safe** — you have to assess copyright and malicious-file risks yourself.

## 10. Takeaways

If I had to keep just three:

1. **There's often an unverified assumption between "findable" and "usable."** The indexer's `n_seeders` field existed all along, was always NULL, and nobody thought anything was wrong — until you actually want to download. Add that layer of verification and the tool's practicality transforms qualitatively.
2. **Chinese search is a trap that's easy to overlook.** The default tokenizers of most full-text indexing solutions are unfriendly to CJK, and the failure mode is insidious: it doesn't error — it "silently finds nothing." If your data has any Chinese, it's worth testing specifically.
3. **"Runs after writing" ≠ "works."** Of the four bugs in this post, three only surfaced after actually running for a while and being actually used (by a user, namely me). When doing acceptance testing, replace "I looked and it seemed fine" with "a script asserts it holds" as much as possible.

The code is here, feel free to check it out or take it: **https://github.com/nova02640/bt-search**

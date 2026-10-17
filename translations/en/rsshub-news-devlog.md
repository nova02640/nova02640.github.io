---
title: 'From Map Fiasco to Event Clustering: Building a Global News Briefing Site
  with RSSHub + Hexo'
date: 2026-09-10 12:00:00
description: 'A real project iteration log: the map approach was rejected, replaced
  by a Hexo static card site, plus event classification and free translation; after
  launch we hit two pitfalls in opposite directions — one event swallowed 461 unrelated
  stories while same-topic news was only merged a quarter of the time, and how we
  finally pinned them down with ''real-corpus regression testing''.'
tags:
- RSSHub
- Hexo
- Web Scraping
- Text Clustering
- GitHub Actions
- Static Site
categories:
- Technology
cover: /img/covers/rsshub-news-devlog.jpg
lang: en
layout: post
---


## Prologue

I had a small RSSHub prototype on my hands that I wasn't happy with — so I scrapped it and started over, with a clear goal:

> Build a **global news briefing site**: scrape news from RSSHub, group it by **event**, translate non-Chinese stories into Chinese, deploy on GitHub Pages, and refresh automatically every 30 minutes.

It doesn't sound complicated, but in practice the pitfalls were quite representative: **overturning my own design once, having to probe real environments to pick a translation API, and a clustering algorithm that kept oscillating between "merging too much" and "splitting too much"**. This post documents the whole process, focusing on the most valuable parts — the two pitfalls in opposite directions, and how we finally made "validation" trustworthy.

---

## 1. First version: the world map approach, rejected the moment it launched

The initial idea was exciting: **a world map with news plotted as dots at where it happened, colored by scope of impact**.

Technically, it all worked out:

- Scraping ran on an overseas GitHub Actions runner (crucially, bypassing local network restrictions);
- Location tagging used a built-in geographic dictionary (country + city + Chinese/English aliases → coordinates), with no dependence on online geocoding;
- Impact scope had four levels (local / regional / national / international), with thresholds and vocabularies all in config files;
- The frontend was Leaflet + OSM tiles, fully static.

It went live after we got it working, and real data started flowing in: 17 of 28 sources were usable, 379 news items were fetched, and the location distribution looked reasonable.

But **one glance at the actual result told me the direction was wrong**: the map was just a scatter of dots, and readers don't care "which coordinates this story happened at" — they care about "**what happened**". The map reduced "news" to "geographic location", and information density actually went down.

So I scrapped it and started over. The lesson from this version: **the form of visualization should start from the user's question, not from the attributes of the data**. The fact that the data has a geographic field doesn't mean a map is the right way to present it.

---

## 2. Second version: a Hexo static card site + 30-minute increments

The new direction was plain and simple — **a card feed like Google News**: a category bar at the top (Politics / International / Finance / New Media), with white cards below (source · category · relative time · headline · summary · location + impact-level color dot), opening the original article in a new tab on click.

The biggest technical decision was **how to store the data**.

### 2.1 Why not "one news item = one article"

The natural approach for a static site is to generate a post per news item. But news is **high-churn, high-duplication** data: hundreds of items a day, stale within three days. The consequences: the repository balloons, every full build gets slower, and none of it adds value — nobody reads news detail pages anyway.

### 2.2 Data stays out of git; cross-run state via Actions cache

What truly needs "incremental" behavior is the **scraping**: don't re-display old news, only append new ones. That requires state to persist across runs (fingerprints of already-seen stories, translation results, aggregated events). But GitHub Actions runners are brand new every time, so the state has to live somewhere.

Two options:

| Option | Problem |
|---|---|
| Commit the data back to the repo | Data changes dozens of times a day, git history balloons fast (tens of MB/day), and you'd also have to handle the recursion of "data commits trigger the workflow" |
| **Persist the `db/` directory with actions/cache** | Requires a trick: the cache key must be unique each run to save successfully, while a `restore-keys` prefix hits the previous run's cache |

We went with the latter:

```yaml
- name: 恢复增量缓存（跨 run 状态）
  uses: actions/cache/restore@v4
  with:
    path: db
    key: newsmap-data-${{ github.run_id }}   # 唯一 key 保证 save 成功
    restore-keys: newsmap-data-              # 前缀命中上次 run

- name: 增量采集
  run: python3 tools/fetch.py --out db --cache-db db --retain-hours 72

- name: 保存增量缓存
  if: steps.cache-restore.outputs.cache-hit != 'true'
  uses: actions/cache/save@v4
  with:
    path: db
    key: newsmap-data-${{ github.run_id }}
```

The cache holds three things: **seen fingerprints** (deduplication), **translation results** (saving API quota), and **event aggregation results** (incremental clustering). If the cache ever gets evicted, it's not fatal — scraping degrades to a one-off full rebuild, and the pages remain correct; they just lose the "newly added" semantics.

### 2.3 Hexo as just a "renderer"

The site is generated with Hexo, but we didn't go the "posts" route: I wrote a custom generator that reads the data JSON directly, renders events/items into static HTML (homepage, category pages, detail pages, full list), and hands it off to `actions/deploy-pages` for deployment.

The benefit: **the pages are server-rendered pure HTML** — no frontend framework, no data requests, instant loading, SEO-friendly — and data and presentation are fully decoupled.

---

## 3. Third version: event classification + Chinese translation

This version adds two capabilities, and they're where the project's real value lies.

### 3.1 Translation API: probe on real machines first, then choose

Local network (mainland China) can't reach mainstream translation services, so **API selection had to happen on a real Actions runner**. I spun up a temporary workflow to probe, and the results were counterintuitive:

| Endpoint | Measured result | Conclusion |
|---|---|---|
| `translate.googleapis.com` (the commonly used unofficial endpoint) | **HTTP 429** (datacenter IPs rate-limited) | ❌ |
| `translate.google.com/...client=webapp` | HTTP 403 | ❌ |
| **`clients5.google.com/translate_a/t?client=dict-chrome-ex`** | **12/12 consecutive successes**, long texts and Japanese/Arabic → Chinese all work fine | ✅ Primary |
| **MyMemory** (`api.mymemory.translated.net`) | Stable 200, 5000 words/day anonymously | ✅ Fallback |
| LibreTranslate public instances | 400 / 502 | ❌ |

**Conclusion: don't guess which API works from experience — probe it in the real environment.** Same Google domain, yet the `gtx` endpoint gets rate-limited while the `clients5` endpoint runs fine.

Three things we did strategy-wise:

1. **Dual provider chain**: if the primary fails, automatically fall back to the secondary; if both fail, keep the original text (no pipeline blocking);
2. **Persistent result cache**: each story is translated only once, reused across runs (saves money and time);
3. **Two-phase + rate limiting**: translate all headlines first (most visible), then summaries; a cap of 180 items per round, stopping early on consecutive failures.

On the page, translated items get a small 「译」 tag, with the original headline kept below in smaller type — no meaning lost.

### 3.2 Event clustering: usable grouping without any models

The requirement: "group news about the same event together." No third-party dependencies (the fewer packages installed in CI, the more stable), implemented with pure standard library:

- **Text representation**: for Chinese, use **character bigrams** (no segmentation library needed); for English, words; titles weighted higher than summaries; strip fixed datelines like "财联社X月X日电" first;
- **Similarity**: TF-IDF weighted cosine, with IDF computed dynamically from all items in the current window;
- **Clustering**: incremental single-pass clustering — a new item is compared against all active events, merged if above the threshold, otherwise starts a new event;
- **Guardrails**: 72-hour time window, raised thresholds for different locations (prevents merging "Beijing rainstorm" with "New York rainstorm"), raised thresholds for different languages, and a cap on event size.

---

## 4. After launch: two pitfalls in opposite directions

This is the most worth-writing part of the whole post. After the first clustering version went live, real data gave very direct feedback.

### 4.1 Pitfall one: the snowball — one event swallowed 461 stories

First round of production data: 1034 news items clustered into 254 events, with size distribution:

```
[461, 70, 67, 27, 18, 18, 10, 10, 10, 8, ...]
```

The top event had **461 members**. Clicking in: Arabic war news, entertainment gossip, financial briefs, leaders' meetings — all mixed together. Its "keywords" were `月 / 美国 / 日 / 中国 / 美元 / 日电 / 财联` — **all generic words**.

Three root causes:

1. **Centroid drift (main cause)**: when judging "is this the same event", I compared the candidate story against the event's **mean member vector (centroid)**. With enough members, the centroid gets stuffed with high-frequency generic words into a "universal word bag", making it similar to anything — **more merges → more generic centroid → easier to merge**: a positive-feedback snowball.
2. **Fixed prefixes on briefs**: in the real corpus, datelines like "财联社9月10日电" appeared 42 times, and near-identical openings manufactured false similarity.
3. **Multi-topic roundup items as attractors**: listing-style items like "XX早餐 | 9月10日" cover extremely broad vocabularies and are naturally similar to everything.

Fix (v3.1):

- **Similarity changed to "the maximum against the event's representative members"**, abandoning centroid-based judgment entirely (the centroid is kept only for keyword display);
- Strip **datelines/bylines/parenthetical notes before tokenization**;
- **Roundup-type items isolated separately**, excluded from any merging;
- Added a **hard cap on event size**, opening a new event when full.

### 4.2 Pitfall two: overcorrecting — only a quarter of same-topic stories got merged

After fixing the snowball, the largest event dropped from 461 to 4, looking clean. But quantifying further revealed **the opposite extreme**:

> Of **31 pairs** of stories with highly similar headlines across sources (bigram Jaccard ≥ 0.8), only **30%** were merged.
> Among them, "两市融资余额减少31.93亿元" appeared **word-for-word identical across three outlets**, yet only two pairs were merged.

In other words, the "cross-platform coverage aggregation" users want most was **never actually working**.

The debugging process was interesting, and took a detour: I first suspected the "rare-word co-occurrence" threshold was too strict — but found two same-topic stories with cosine similarity of **0.99** sharing 9 rare words, which should have merged. So I dug deeper and finally caught the real culprit:

```
真实语料 1034 条中被判定为"摘要型条目"的：411 条（40%！）
  其中标题真的命中汇总类关键词的：17 条
  仅因为"摘要长度 > 120 字且分句 ≥ 6"被误判的：394 条   ← 元凶
```

To guard against multi-topic roundup items becoming attractors, I'd written a summary heuristic: **summary over 120 characters with ≥6 sentences → treat as a roundup item**. But Cailianshe's multi-sentence brief summaries (134 characters) all hit the line — **40% of ordinary news items were classified as "roundup items" and isolated, never to be merged**.

Fix (v3.2): **roundup detection only looks at headline keywords** (breakfast/morning briefing/roundup/highlights/Top stories…); the summary dimension is reduced to an extremely strict fallback (≥500 characters, ≥12 sentences, ≥3 topic blocks). At the same time, "high similarity" gets a fast lane — cosine ≥ 0.75 directly counts as the same event, no rare-word sharing required.

Results:

| Metric | Before fix | After fix |
|---|---|---|
| Cross-source same-topic merge rate | 25% | **96.8%** |
| Largest event member count | 461 → 4 | 4 (sane) |
| "Roundup" false positives | 411 | **10** (all genuine roundup items) |
| Total events | 977 (over-split) | 912 |

### 4.3 Pitfall three: the algorithm was fixed, but production didn't change

After pushing the fix and CI going green, I excitedly checked production — **the 461-story event was still there**.

Reason: clustering is "incremental", and the new algorithm **reads the previous round's aggregation results and continues from them**. The erroneous events produced by the old algorithm were inherited verbatim by the new one.

Fix: tag aggregation results with an **algorithm version + rules fingerprint** (a hash of the clustering config file). When the version or any threshold changes, **ignore the old results and do a full rebuild**:

```python
if old_events and (meta.get("algo_version") != ALGO_VERSION
                   or meta.get("rules_fingerprint") != fp):
    old_events = []   # 旧结果失效 → 全量重建
```

The value of this tiny change is badly underestimated: **any "derived data + incremental computation" system must have an invalidation mechanism**, otherwise fixes never take effect.

---

## 5. Making "validation" trustworthy

The whole project ran in the mode of "human (me) sets the design + AI coding agent executes + I independently verify." What most often goes wrong in this kind of collaboration is **the gap between "looks done" and "actually correct."** So validation had three layers:

**Layer 1: test cases with pre-seeded known answers.** I hand-built a small-scale test set. Positives (3 groups of the same event, differently worded) and **hard negatives** (same dateline but completely different topics, genuine roundup items, cross-language same events, unrelated items) all had explicit expected outputs, and the algorithm had to pass every group.

**Layer 2: real-corpus regression (the key one).** Small samples lie — my 9 test cases all passed, yet the real corpus had **40%** of items misclassified. So I **exported production's real data as a benchmark**: via a temporary workflow, I restored the CI cache, packaged the data as an artifact, and downloaded it to get 1000+ real stories, then ran the algorithm locally and quantified the metrics:

```
事件总数 ≥ 500 ｜ 最大事件 ≤ 20 ｜ 同题合并率 ≥ 90% ｜ 摘要型误判 ≤ 30 ｜ 负例不误并 ｜ 幂等
```

These metrics later became the "regression test" for every clustering change, and they caught both pitfalls.

**Layer 3: page-by-page verification on production.** After each deploy, I curl'd through everything: homepage event cards, event detail pages (cross-platform coverage + translation tags), category pages, the full list page — checking that header stats read "1085 events / 1248 reports" rather than using the event count as the report count (that bug happened for real too).

---

## 6. Where things stand now

- **Production**: a news aggregation site auto-updating every 30 minutes, with ~1200+ stories / 1085 events;
- **Event cards**: displayed by event on the homepage, labeled "covered by N outlets", clicking through shows the cross-platform comparison;
- **Translation**: non-Chinese news automatically translated into Chinese, with a 「译」 tag and the original text;
- **Source health**: a health matrix maintained per source; an individual source failing doesn't break the pipeline;
- **Zero data dependencies**: scraping, translation scheduling and clustering all implemented with pure Python standard library, no third-party packages.

---

## 7. Transferable lessons

1. **The form of visualization should match the user's question, not the data fields** — having a geographic field doesn't mean you should use a map.
2. **External service selection must be probed in the real runtime environment**; different endpoints on the same domain may be rate-limited while others pass through.
3. **Heuristic thresholds must be calibrated on real-scale corpora.** Small samples turn your "all passing" into an illusion: a 411/1034 misclassification rate is completely invisible in 9 test cases.
4. **Derived data must carry a version fingerprint**, otherwise the algorithm gets fixed and production stays the same.
5. **Test errors in both directions**: testing only "did what should merge, merge?" misses "did what shouldn't merge, merge?" (the snowball), and vice versa. **Positives + hard negatives + real corpus** are the complete trio.
6. **Automation pipelines must be "observable"**: print key counters in every round's log (sources succeeded, new items, events, translated items), so when something breaks you can pinpoint which stage at a glance.

From "the map fiasco" to "usable event clustering", the project took four iterations in total. Looking back, what really took time wasn't writing features — it was **translating "the results look wrong" into "quantifiable metrics," and then locating the exact line of code** — which is probably the most practical skill in any data-related project.

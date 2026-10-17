# English translations (archive)

25 blog posts translated to English on 2026-10-17, kept here **for archival only** — these files are
outside `source/`, so Hexo never builds them and they are not published on the site.

## Why archived instead of published

The machine translation (Xiaomi MiMo-V2.6-Flash via the Batch API) was structurally sound —
25/25 posts, 0 failed requests, structure/heading/link/code-block checks all matched —
but the overall reading quality was not good enough to publish as an official English edition,
so the site reverted to Chinese-only.

## What is here

- `en/<slug>.md` — one file per post, same slug as `source/_posts/<slug>.md`
- Format: translated YAML front matter + translated Markdown body
- Code blocks: only comments were translated; commands/strings/logic are untouched
- Known defects (fixed or noted during review):
  - one markdown table row was dropped by the model in `feishu-21001-access-denied` (restored before archiving)
  - in-code comments are English while identifiers remain as-is, which is intentional

## Provenance

- Model: `mimo-v2.6-flash`, prompt kept code/URLs/Hexo tags intact, front matter fields calibrated
  against the original (date / cover preserved verbatim)
- Batch job: submitted 2026-10-16 11:51, ran 2026-10-17 00:30, ~¥0.10 total
- Quality metrics: non-code CJK residual ≤ 0.3%, avg length ratio ×2.39 (EN chars / CJK chars)

## How to publish it again later

Move the files back into `source/en/<slug>/index.md`, add `lang: en` + `layout: post` handling
(and an `/en/` index generator) — see the `llm-batch-inference` and `hexo-butterfly-blog` skills.

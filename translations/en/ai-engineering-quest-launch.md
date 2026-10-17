---
title: Turning the 523-Lesson AI Engineering Course into a Quest-Style Progress Tracker
date: 2026-09-28 01:15:00
description: 'AI Engineering from Scratch is an open-source course of 523 lessons
  across 20 phases—so large it''s easy to abandon halfway. I added the one thing it
  doesn''t have itself: quest-style progress + a portfolio ledger, built as a pure
  front-end static site deployed on GitHub Pages. This post covers what the site does,
  how its rules were defined, and why it only pulls metadata without copying any lesson
  content.'
tags:
- AI Engineering
- Open Source Projects
- Learning Tools
- GitHub Pages
- Static Sites
categories:
- Technology
cover: /img/covers/ai-engineering-quest-launch.jpg
lang: en
layout: post
---


## Conclusion First

I took a 523-lesson open-source AI engineering course and turned it into a quest-style progress tracker:

- Site: **https://nova02640.github.io/ai-engineering-quest/**
- Repo: **https://github.com/nova02640/ai-engineering-quest**

It's not a rework of the course; it's the layer that adds **a sense of progress** and **a sense of portfolio** on top of it. This post explains three things: what the course is, what this layer adds, and why it deliberately copies none of the course's lesson content.

---

## The Course Itself Deserves Serious Attention

The course is **AI Engineering from Scratch** (author Rohit Ghumare, MIT license):

| Item | Value |
|---|---|
| Size | **523 lessons / 20 phases**, roughly 342 hours of study |
| Coverage | Math foundations → machine learning → deep learning → NLP/speech/vision → Transformers → building LLMs from scratch → LLM application engineering → tools & protocols → agents → multi-agent systems → production infrastructure |
| Languages | Python, TypeScript, Rust, Julia |
| Structure | Every lesson has a fixed trio: `code/` (runnable implementation) + `docs/en.md` (lecture notes) + `outputs/` (the prompt / skill / agent / MCP server produced by the lesson) |
| License | MIT |

Its defining feature is **"hand-write first, use libraries later"**: every algorithm requires you to derive it from raw math (backprop, tokenizers, attention, agent loops), so by the time you reach for PyTorch, you already know what it's doing under the hood.

The course also comes with a rigorous methodology, written in the lecture notes as a four-step loop:

> **Read** → **Build** → **Run** → **Record evidence**
> (read / built / ran / evidence)

That's exactly where the problem lies: **523 lessons are not something you can finish in one sitting**, and the course itself gives you no global view of "where am I." When you complete a lesson, the sense of achievement exists only in that day's terminal output.

---

## So I Didn't Build a "Learning Site"

Let me state one thing up front, because it determines the entire architecture:

**Upstream already has a fully functional learning site.** The official site offers online rendering of all 523 lessons, a quiz after every lesson, local progress tracking, interactive charts, a glossary, learning paths, certification prep question banks, and an interface in 12 languages.

So if I built another "learning site," it would only be a stripped-down mirror that has to chase upstream updates forever. That's not a product; that's a liability.

**What's actually missing upstream are these two things:**

1. **A global sense of progress**: official progress is four checkboxes per lesson. There are checkmarks, but no quest view of "which stage have I reached" or "how much is left to clear this phase."
2. **Evidence that survives**: official step is called evidence, but in practice it only records a "checked" timestamp—there's nowhere to store what commands you ran, what the exit code was, or what files you produced.

And the **portfolio** aspect is precisely what this course keeps emphasizing: *"Every lesson ships a reusable artifact."*—every lesson delivers a reusable artifact. The course says so, but doesn't help you collect those artifacts.

So this site's positioning is clear: **don't build a course; build the recording layer for the course.**

---

## What This Layer Actually Is

### 1. The Quest Map

All 20 phases and 523 stages laid out, each stage as a card with four small cells showing the completion status of the four steps, color-coded by "not started / in progress / cleared." At the top: level, XP, overall progress, and badge count.

### 2. The Stage Page: Four-Step Check-In + Quiz + Artifact Ledger

Each stage has:

- **Four-step check-in**: read / build / run / record evidence—using exactly the course's own methodology
- **One-click jump to source**: official lecture page and GitHub source directory; no need to navigate around the site
- **Stage quiz**: two multiple-choice questions (one concept, one practice), with explanations shown immediately on correct answers
- **Artifact ledger**: command, exit code, key output, artifact location, one-line takeaway

The stage page also auto-suggests a run command based on the stage's language (`python3 ...` for Python, `npx tsx ...` for TypeScript), copy-and-run ready.

### 3. Boss Stages

Once you clear a phase, its **Boss stage** unlocks: 12 comprehensive questions covering different stages of that phase. Answer 8 correctly (two-thirds) to pass and earn a phase badge. Badges are never revoked by later low scores. You can also attempt them early—the site will just remind you how many stages you haven't cleared yet.

### 4. Portfolio

All recorded evidence aggregates into a portfolio, grouped by phase, and exportable with one click:

- **Single-file HTML**: a standalone styled page you can send to anyone or drop anywhere
- **Markdown**: great for pasting into blog posts or weekly reports
- **JSON**: for archiving and cross-device sync

Progress is stored locally in the browser (`localStorage`); no data is uploaded. Switching devices? Export the JSON, then import it.

### Rules (Copied from the Course, Not Invented)

| Action | XP |
|---|---|
| Read the lecture notes | 10 |
| Hand-type and run the code | 25 |
| Run this stage's command from the repo root | 20 |
| Record evidence | 30 |
| Each quiz question answered correctly | 15 |

Level up every 250 XP. **For stages with a question bank, you must answer at least one question correctly to count as cleared**—four checked steps alone won't cut it (there's a real bug behind this rule that I wrote up in my dev log).

---

## The Boundary: Metadata Only, No Content Copying

This is the most important decision in the project.

The only course information the site uses is: **stage titles, numbering, paths, type (Learn / Build), language, learning objectives, and the file listings of `outputs/` and `code/`**. All reading and exercises point to the official originals—there is **not a single word of lecture content** on the site, and none of upstream's charts, images, or interface copy are reproduced.

This has three benefits:

1. **Clean from a copyright standpoint**: MIT permits reuse, but "quoting metadata + deep-linking to the original" and "mirroring the whole site's content" are two very different things. The former is a tool; the latter is republishing. The site footer, the About section, and the repo's `ATTRIBUTION.md` all credit the upstream author and license, and I don't use upstream's name or logo as my own branding.
2. **No need to chase updates**: the upstream repo has multiple commits a day. Since I only depend on metadata, upstream content changes won't break this site.
3. **Clean severability**: if upstream ever changes its license or objects to this kind of citation, I just delete the corresponding metadata and the site doesn't collapse.

The quiz question bank on the site is written by me (upstream's in-lesson quizzes are generated on the fly by AI at runtime; there is no static question bank). The questions are based on the publicly available lecture notes and are paraphrased.

---

## How Much Works Right Now

Being clear about the current state to avoid misunderstandings:

- **Phase 13 (Tools & Protocols, 31 stages) is done in depth**: learning objectives, quizzes for every stage (62 questions), and a Boss stage question bank (12 questions)
- **The other 19 phases are in metadata mode**: full stage lists, types, and languages; you can complete stages via the four-step check-in, but there are no quizzes or Boss question banks

In other words, for phases other than Phase 13, you can use it to track progress, check things off, and log artifacts—but you can't answer questions and quest through. Whether I'll fill the question banks across all 20 phases, I plan to decide after using it myself for a while—the easiest mistake with a project like this is rolling out the full content all at once, only to find the form is wrong and everything is sunk.

---

## Getting Started

1. Open **https://nova02640.github.io/ai-engineering-quest/**
2. Click into Phase 13, start with the first stage, and click "official lecture page" to read the lesson first
3. Hand-type the code, run it, go back to the stage page to check off the four steps, finish the quiz, and log one piece of evidence

That's it. 523 stages is long, but at least now you can see how far you've come—and you can show others the path you've walked.

---

## Disclaimer

This is an **independent personal project** with no affiliation to or endorsement by the upstream author or the course's official channels. All rights to the course content, course name, and original lecture notes belong to the original author Rohit Ghumare (MIT license). This site's code is likewise released under the MIT license.

If the upstream author considers any aspect of this site's citation inappropriate, please contact me via a repo Issue, and I will take down the relevant content immediately.

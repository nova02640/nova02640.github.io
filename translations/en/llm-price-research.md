---
title: Official Pricing of Domestic Chinese LLMs at a Glance (2026-07)
date: 2026-07-30 00:00:00
description: Collects the latest pricing data from the official pricing pages of 7
  domestic large model vendors, with data source notes.
tags:
- AI
- Large Models
- Research
categories:
- Technology
cover: /img/covers/llm-price-research.jpg
lang: en
layout: post
---


## Introduction

This post collects the public prices published on the **official pricing pages** of major domestic large model vendors (collected on 2026-07-31) for reference and comparison. For each vendor's data source, see "Data Sources & Collection Notes" at the end of this article.

> Unit note: All prices in this article are in **CNY (yuan) per million tokens**.

---

## I. Overview of Official Pricing for Mainstream Models

### 1. DeepSeek

| Model | Input | Output | Cache Hit | Context |
|:----|:----:|:----:|:-------:|:-----:|
| **v4-flash** | 1.0 | 2.0 | 0.02 | 1M |
| **v4-pro** | 3.0 | 6.0 | 0.025 | 1M |

> ⚠️ Note: DeepSeek uses **peak/off-peak pricing**. Peak hours in Beijing time are 9:00–12:00 and 14:00–18:00 daily, during which prices are ×2.

### 2. Zhipu AI GLM

| Model | Input | Output | Cache Hit | Context |
|:----|:----:|:----:|:-------:|:-----:|
| GLM-5.2 (flagship) | 8.0 | 28.0 | 2.0 | 1M |
| GLM-5.1 | 6.0 | 24.0 | 1.3 | 128K |
| GLM-5 | 4.0 | 18.0 | 1.0 | 128K |
| GLM-4.7 | 2.0 | 8.0 | 0.4 | 200K |
| GLM-4.5-Air | 0.8 | 2.0 | 0.16 | 128K |
| **GLM-4.7-FlashX** | 0.5 | 3.0 | 0.1 | 200K |
| **GLM-4.7-Flash** | 🆓 Free | 🆓 Free | 🆓 Free | 200K |

### 3. Alibaba Tongyi Qianwen

| Model | Input | Output | Cache Hit | Context |
|:----|:----:|:----:|:-------:|:-----:|
| qwen3.7-max | 12.0 | 36.0 | 2.4 | 1M |
| qwen3.7-plus | 2.0 | 8.0 | 0.4 | 256K |
| **qwen3.7-flash** | 0.2 | 0.8 | 0.04 | 32K |

### 4. Moonshot AI Kimi

| Model | Input | Output | Cache Hit | Context |
|:----|:----:|:----:|:-------:|:-----:|
| **kimi-k3** (flagship) | 20.0 | 100.0 | 2.0 | 1M |
| kimi-k2.7-code | 6.5 | 27.0 | 1.3 | 256K |
| kimi-k2.6 | 6.5 | 27.0 | 1.1 | 256K |

> ⚠️ Kimi K3 output reaches as high as **100 yuan/million tokens**, the highest in this collection.

### 5. ByteDance Doubao

| Model | Input | Output | Cache Hit | Context |
|:----|:----:|:----:|:-------:|:-----:|
| doubao-seed-2.1-pro | 6.0 | 30.0 | 1.2 | 256K |
| doubao-seed-2.1-turbo | 3.0 | 15.0 | 0.6 | 256K |
| doubao-seed-2.0-pro | 3.2 | 16.0 | 0.64 | 256K |
| doubao-seed-2.0-lite | 0.6 | 3.6 | 0.12 | 256K |
| **doubao-seed-2.0-mini** | 0.2 | 2.0 | 0.04 | 256K |
| doubao-seed-2.0-code | 3.2 | 16.0 | 0.64 | 256K |

> Doubao uses **tiered pricing** based on input length (three tiers: 32K / 128K / 256K).

### 6. Tencent Hunyuan

| Model | Input | Output | Context |
|:----|:----:|:----:|:-----:|
| Hunyuan-role-latest | 2.4 | 9.6 | 256K |
| Hunyuan-turbos-vision | 3.0 | 9.0 | 128K |
| Hunyuan-a13b | 0.5 | 2.0 | 128K |

### 7. 01.AI (Yi)

| Model | Input | Output | Context |
|:----|:----:|:----:|:-----:|
| yi-lightning | 0.99 | — | 16K |

> 📌 Baidu ERNIE, MiniMax, iFlytek, and StepFun were not included because their official prices could not be obtained without logging into a console or due to official website outages.

---

## II. Data Sources & Collection Notes

### Collected Data Sources (Official Pricing Pages)

| Vendor | Data Source | Collection Method | Collection Time |
|:----|:---------|:---------|:---------|
| **DeepSeek** | [api-docs.deepseek.com/zh-cn/quick_start/pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing) | Direct access to official site | 2026-07-31 15:42 |
| **Zhipu AI** | [open.bigmodel.cn/pricing](https://open.bigmodel.cn/pricing) | Playwright rendering | 2026-07-31 15:43 |
| **Alibaba Tongyi Qianwen** | [help.aliyun.com/zh/model-studio/models](https://help.aliyun.com/zh/model-studio/models) (including model detail pages) | Playwright rendering + scroll loading | 2026-07-31 15:46-15:49 |
| **Moonshot AI Kimi** | [platform.kimi.com/docs/pricing/chat-k3](https://platform.kimi.com/docs/pricing/chat-k3) | Playwright rendering | 2026-07-31 15:43-15:45 |
| **ByteDance Doubao** | [volcengine.com/docs/82379/1099320](https://www.volcengine.com/docs/82379/1099320) | Playwright rendering + table parsing (25 tables) | 2026-07-31 15:52-15:56 |
| **Tencent Hunyuan** | [cloud.tencent.com/document/product/1729/97731](https://cloud.tencent.com/document/product/1729/97731) | Playwright rendering | 2026-07-31 15:50-15:51 |
| **01.AI (Yi)** | [platform.lingyiwanwu.com/docs](https://platform.lingyiwanwu.com/docs) | Playwright rendering | 2026-07-31 15:51-15:52 |

> Note: The above prices are all public prices published on each vendor's **official pricing page**, not third-party paraphrases. Most pages are dynamically rendered with JS and were extracted after rendering with a headless browser.

### Vendors Not Collected & Reasons

| Vendor | Reason Not Collected | Notes |
|:----|:-----------|:-----|
| **Baidu ERNIE 5.1** | Prices require logging into the Qianfan console | The public page only shows the model list; the price table is only visible after login |
| **MiniMax** | Pay-as-you-go pricing page requires login | Public docs only contain voice resource package prices; text model prices are not public |
| **iFlytek Spark** | Official website pages malfunctioning | Pricing page 404 / service page 500 / API page 502 |
| **StepFun** | Official website page returns 404 | Pricing route inaccessible |

> ⚠️ These 4 vendors were not included. For a complete comparison, log into the respective consoles to obtain the data and supplement it.

### Data Limitations

1. Prices were collected on **2026-07-31**; vendors may adjust prices at any time. Please refer to the official pricing pages for the latest information
2. Some models use **tiered pricing** (Doubao and GLM tier by input length); the table takes the lowest tier or notes the conditions
3. DeepSeek uses **peak/off-peak pricing** (peak prices ×2 during 9:00–12:00 and 14:00–18:00); the table shows off-peak prices
4. 01.AI's yi-lightning is listed at 0.99 yuan, but the output price is not explicitly published on the official website

---

*The data in this article was collected on 2026-07-31. Vendor prices may be adjusted at any time; please refer to the official pricing pages.*

---
title: "从 Paper 到 Hugo Bear Blog：一次极简主义迁移"
date: 2026-08-03
description: "记录从 Hugo Paper 主题迁移到 Hugo Bear Blog 主题的全过程：迁移前的状态、遇到的难点、解决方案，以及迁移后的效果。"
slug: "migrating-from-paper-to-hugo-bear-blog"
tags: ["Hugo", "博客", "迁移", "Bear Blog"]
---

## 引子

上一篇[《把 Paper 主题改成程序员喜欢的样子》](/把-paper-主题改成程序员喜欢的样子一次克制的主题定制/)记录了对 Paper 主题的克制定制。那时候的想法是：**不换主题，用覆盖机制做增量定制**。结果定制完之后，博客确实变好用了，但一个念头始终挥之不去——

> 我做了那么多定制，本质上是在**弥补主题的不足**。如果有一个主题天生就是我想要的样子呢？

于是有了这次迁移：从 Paper 到 [Hugo Bear Blog](https://github.com/janraasch/hugo-bearblog)。

---

## 迁移前的状态

先交代一下"搬家"前的房子长什么样。

### 技术栈

- **框架**：Hugo（extended）
- **主题**：[Paper](https://github.com/nanxiaobei/hugo-paper)，通过 git submodule 引入
- **部署**：GitHub Actions → GitHub Pages
- **定制**：`assets/custom.css` + 覆盖 `single.html` / `footer.html`

### 已有的定制

在 Paper 主题上做了不少打磨：

| 定制项 | 方式 |
|:------|:-----|
| 字体栈 | `custom.css` 中设置中文优先 + 等宽回退 |
| 代码块样式 | 圆角、浅灰底、细边框 |
| 行内代码 | 浅色底 + 圆角 + 等宽 |
| 细滚动条 | 全局 6px 宽、半透明圆角 thumb |
| 链接样式 | 橙色下划线、hover 加深 |
| 引用块 | 左侧橙色边框 + 浅色背景 |
| 表格防溢出 | `display: block; overflow-x: auto` |
| 选中色 | `::selection` 橙色半透明 |
| 返回顶部 | 右下角圆形按钮 + 6 行原生 JS |
| 阅读时长 | 覆盖 `single.html`，显示"☕ N 分钟 · N 字" |
| 分类/标签页 | 已通过 `disableKinds` 移除 |

### 已经解决的问题

在 Paper 时期，已经做了一个关键决策——**砍掉 taxonomy**。`disableKinds = ["taxonomy"]` 让 Hugo 不再生成 `/tags/` 和 `/categories/` 页面，文章底部标签改为纯文本。导航栏只剩「关于」。

这个决策在迁移后被保留了下来。

---

## 为什么要迁移

Paper 是一个好主题——简洁、现代、Tailwind 驱动。但它有一个根本性的特点：**它是一个"现代前端"主题**。

这意味着什么？

1. **CSS 框架依赖**：Paper 基于 Tailwind v4。虽然最终编译为纯 CSS，但主题本身的设计语言是 Tailwind 的——utility classes、设计 tokens、组件化思维。这对于一个"只想写字"的个人博客来说，是**多余的复杂度**。
2. **JS 依赖**：Paper 的返回顶部、导航交互等依赖少量 JavaScript。虽然不多，但对于一个静态博客来说，**零 JS 是一种信仰**。
3. **视觉风格**：Paper 现代但不够"赤裸"。它有圆角、阴影、过渡动画——这些都是"装饰"。而 [Bear Blog](https://bearblog.dev/) 风格追求的是**极致的裸露**：默认浏览器样式，几乎不做任何视觉修饰。

一句话总结迁移动机：

> **如果克制是最高级的设计，那 Paper 还不够克制。我想要一个天生就"什么都不做"的主题。**

---

## 迁移过程

### 第一步：选择新主题

候选有三个：

| 主题 | 特点 | 选择理由 |
|:----|:-----|:--------|
| Hugo Bear Blog | 纯 HTML/CSS，零 JS，Bear Blog 风格 | ✅ 最符合"赤裸"理念 |
| Hugo Bare Min | 同样极简，但维护不活跃 | ❌ 最后更新太久 |
| 自己写 | 完全控制 | ❌ 重复造轮子，不值得 |

最终选择了 [hugo-bearblog](https://github.com/janraasch/hugo-bearblog)。它的核心理念：

- **纯 HTML + CSS**，零 JavaScript
- 默认使用浏览器原生样式，只做最小必要的视觉调整
- 响应式设计，但不依赖任何框架
- 支持 Hugo 标准功能（SEO、RSS、sitemap 等）

### 第二步：切换 submodule

这是迁移中最"物理"的一步——把 Paper 的 submodule 换成 hugo-bearblog。

```bash
# 1. 移除旧 submodule
git submodule deinit -f themes/paper
rm -rf .git/modules/themes/paper
git rm -f themes/paper

# 2. 添加新 submodule
git submodule add https://github.com/janraasch/hugo-bearblog.git themes/hugo-bearblog

# 3. 更新配置
# hugo.toml: theme = "hugo-bearblog"
```

这一步本身不复杂，但有一个坑：**`git submodule deinit` 后必须手动删除 `.git/modules/` 下的目录**，否则新 submodule 可能无法正确初始化。

### 第三步：重写 hugo.toml

Paper 和 hugo-bearblog 的配置结构差异很大。Paper 依赖大量 params（`name`、`bio`、`mainSections` 等），而 hugo-bearblog 更简洁。

新的 `hugo.toml` 核心配置：

```toml
theme = "hugo-bearblog"
title = "nova02640's Blog"
author = "nova02640"
copyright = "© 2026 nova02640"
languageCode = "zh-cn"

# 保持 taxonomy 禁用——这个决策从 Paper 时期延续下来
disableKinds = ["taxonomy"]
ignoreErrors = ["error-disable-taxonomy"]

[permalinks]
  blog = "/:slug/"    # Bear Blog 风格的短 URL

[[menu.main]]
  identifier = "blog"
  name = "Blog"
  url = "/blog/"
  weight = 10

[[menu.main]]
  identifier = "about"
  name = "About"
  url = "/about/"
  weight = 20

[params]
  description = "Personal blog · Thoughts and sharing"
  enablePostNavigator = true
  dateFormat = "2006-01-02"    # ISO 日期格式
```

关键变化：

| 项目 | Paper 时期 | Bear Blog 时期 |
|:-----|:----------|:--------------|
| 主题 | `paper` | `hugo-bearblog` |
| Permalink | `/:sections/:year/:slug/` | `/:slug/` |
| 导航 | 只有「关于」 | Blog + About |
| 代码高亮 | Paper 内置 | `friendly` 风格 + 行号 |
| 日期格式 | 自定义 | ISO 8601 |

### 第四步：内容迁移

文章从 `content/` 根目录迁移到 `content/blog/` 目录下：

```text
content/
├── _index.md          # 首页
├── about.md           # 关于页面
└── blog/
    ├── first-post.md
    ├── llm-price-research.md
    └── theme-optimization.md
```

这配合 `permalinks.blog = "/:slug/"` 产生了更短的 URL：`/hello-world-我的第一篇博客/` 而不是 `/blog/2026/hello-world/`。

### 第五步：清理旧定制文件

Paper 时期的定制全部删除：

- `layouts/_default/single.html`（阅读时长覆盖）
- `layouts/partials/footer.html`（返回顶部按钮）
- `assets/custom.css`（全部 CSS 定制）
- `archetypes/`（自定义模板）

这些定制在 hugo-bearblog 中要么不需要（主题自带），要么不符合新风格（比如返回顶部按钮——Bear Blog 风格不需要这种交互元素）。

---

## 遇到的难点

### 难点一：Permalink 结构变化

Paper 使用 `/:sections/:year/:slug/` 的多级 URL，而 Bear Blog 使用扁平的 `/:slug/`。这意味着**所有文章的 URL 都会变化**。

对于个人博客来说，这不算大问题——没有外部链接指向旧 URL，也不需要做 301 重定向。但如果是一个有读者基础的博客，这一步需要仔细考虑 SEO 影响。

### 难点二：Submodule 清理

`git submodule deinit` 不会完全清理 submodule 的痕迹。`.git/modules/` 下残留的旧目录会导致新 submodule 初始化失败。解决方案是手动删除残留目录：

```bash
rm -rf .git/modules/themes/paper
```

### 难点三：导航菜单的重新设计

Paper 时期，导航栏经过"做加法再减法"的过程，最终只剩「关于」。迁移到 Bear Blog 后，重新加回了「博客」入口——因为 Bear Blog 的导航更简洁（纯文本链接），多一个入口不会增加视觉噪音。

### 难点四：文章 URL 的中文化

由于文章标题是中文，Hugo 自动生成的 slug 也是中文。这导致 URL 中包含中文字符（如 `/国产大模型官方价格一览2026-07/`）。

虽然 URL 编码后浏览器可以正常处理，但对于分享和 SEO 来说不够理想。解决方案是在 front matter 中手动设置 `slug` 字段。新文章统一使用英文 slug，旧文章保持原样（避免链接失效）。

---

## 迁移后的效果

### 视觉对比

| 维度 | Paper | Hugo Bear Blog |
|:-----|:------|:--------------|
| CSS 框架 | Tailwind v4（编译产物） | 原生 CSS（~200 行内联） |
| JavaScript | 少量（返回顶部等） | 零 |
| 字体 | 系统字体栈（自定义） | 浏览器默认 |
| 代码高亮 | 内置 | `friendly` 风格 |
| 视觉风格 | 现代、圆角、阴影 | 裸露、原生、无装饰 |
| 页面大小 | 较大（Tailwind 编译产物） | 极小（~5KB CSS） |

### 性能

迁移后页面加载更快了——没有任何 JS 阻塞渲染，CSS 只有几百行内联在 `<head>` 中，不需要额外的网络请求。

### 体验

- **更安静**：没有返回顶部按钮、没有过渡动画、没有 hover 效果。页面就是内容本身。
- **更一致**：所有视觉元素使用浏览器默认样式，跨平台一致性更好。
- **更可维护**：配置文件更短，没有定制文件需要维护，主题升级时零冲突。

---

## 反思

这次迁移让我重新思考了一个问题：**定制的终点是什么？**

在 Paper 时期，我的答案是"用覆盖机制做增量定制"——不改主题源码，只加不改。这很优雅，但本质上还是在"修补"一个不够合适的主题。

迁移到 Bear Blog 后，答案变成了"选择一个天生就合适的主题，然后什么都不做"。

> **最好的定制，是让你感觉不到定制的存在。最好的迁移，是迁移完之后你什么都不需要定制。**

当然，Bear Blog 也不是完美的。它缺少一些我喜欢的功能（比如阅读时长、暗色模式），但它的哲学是：**如果你需要这些功能，说明内容本身还不够吸引你**。

这个哲学，我接受。

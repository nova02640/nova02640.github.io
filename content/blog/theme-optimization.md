---
title: "把 Paper 主题改成程序员喜欢的样子：一次克制的主题定制"
date: 2026-07-31
description: "基于 Hugo Paper 主题做的一次克制定制：加入阅读时长、打磨代码块与滚动条细节，并最终砍掉分类/标签页。不 fork、不堆砌，用覆盖机制优雅扩展。"
tags: ["Hugo", "博客", "前端", "定制"]
categories: ["技术"]
---

## 引子

本站的博客系统是 Hugo + [Paper](https://github.com/nanxiaobei/hugo-paper) 主题。Paper 本身已经足够简洁——单栏、白底、无多余装饰，开箱即用。但用了几天，程序员的本能开始发作：

1. **分类 / 标签页面是空白的**。点进 `/tags/` 或 `/categories/`，只有一个孤零零的标题，没有任何内容——因为 Paper 的 `list.html` 只渲染文章列表，不处理 taxonomy 总览页。
2. **文章页缺信息密度**。只有日期和作者，没有阅读时长、没有字数。程序员的习惯是"一眼看到全部元信息"。
3. **细节不够"程序员"**。滚动条是浏览器默认的粗条，代码块没有圆角，行内代码没有底色，长表格会溢出。

于是有了这次定制。原则只有一条：**克制**——不动主题源码，不引入前端框架，不堆砌视觉元素，只解决痛点。

---

## 先读源码：Hugo 主题的扩展机制

定制之前，先把主题源码摸了一遍。Paper 的结构很干净：

```text
themes/paper/
├── assets/
│   ├── app.css        # Tailwind v4 入口（@import 'tailwindcss'）
│   ├── main.css       # 编译产物
│   └── custom.css     # ★ 官方预留的自定义钩子
├── layouts/
│   ├── _default/
│   │   ├── baseof.html   # 骨架
│   │   ├── list.html     # 列表页（首页 / 归档）
│   │   └── single.html   # 文章页
│   └── partials/
│       ├── head.html     # <head>，加载 main.css + custom.css
│       ├── header.html   # 顶栏
│       └── footer.html   # 页脚
└── i18n/
    └── zh.yaml
```

两个关键发现：

**发现一：`custom.css` 是官方预留的覆盖钩子。** `head.html` 里这样加载样式：

```go
{{- $main := resources.Get "main.css" -}}
{{- $custom := resources.Get "custom.css" -}}
{{- $css := slice $main $custom | resources.Concat "main.css" | minify | fingerprint -}}
```

Hugo 的 `resources.Get` 优先查找**站点根目录**的 `assets/`，找不到才去主题。所以只要在站点建一个 `assets/custom.css`，就会自动替换主题的 custom.css 并被合并进最终产物——**完全不需要碰主题源码**。

**发现二：Hugo 的模板覆盖机制。** 站点根目录的 `layouts/` 同名文件会覆盖主题模板。这比 fork 主题优雅得多：主题升级时（submodule pull），我的定制不受影响；定制回滚时，删掉覆盖文件即可。

---

## 动手：三件事 + 一次减法

### 1. 做减法：砍掉分类 / 标签页（`disableKinds`）

最初我尝试**修复** taxonomy 空白——新建了 `layouts/_default/taxonomy.html`，用 `.Kind` 区分总览页与 term 页，让 `/tags/` 渲染出标签云和文章计数，效果也不错。

但用了一阵子，发现一个问题：**对于只有十几篇文章的个人博客，分类和标签的价值趋近于零**。导航栏多了两个入口，读者却很少点进去；反而增加了信息噪音。于是做了第二次决策——干脆砍掉：

```toml
# hugo.toml
disableKinds = ["taxonomy", "term"]
```

这一行让 Hugo 彻底不再生成 `/tags/`、`/categories/` 页面。同时把文章底部的标签从链接改为纯文本展示（否则会变成 404 死链）：

```go
<!-- 文章底部：标签纯文本，不生成链接 -->
{{- range .Params.tags -}}
<span class="mb-1.5 rounded-lg bg-black/[3%] px-5 py-1 ...">{{- . -}}</span>
{{- end -}}
```

导航栏最终只剩「关于」。**写代码的艺术是删代码**——对一个极简博客来说，少两个入口比多两个功能更符合它的气质。

### 2. 打磨细节（`assets/custom.css`）

纯 CSS 覆盖，不引入任何构建工具：

| 优化点 | 实现 |
|:------|:-----|
| **字体栈** | 中文优先：`PingFang SC / Microsoft YaHei / Noto Sans SC`，等宽回退 `JetBrains Mono / SF Mono` |
| **代码块** | 圆角 10px、浅灰底（暗色模式深灰底）、细边框、`overflow-x: auto` |
| **行内代码** | 浅色底 + 圆角 + `0.82em` 等宽 |
| **细滚动条** | 全局 `6px` 宽、半透明圆角 thumb（WebKit + Firefox `scrollbar-width: thin`） |
| **链接** | 正文链接加橙色下划线，hover 加深，`text-underline-offset: 3px` |
| **引用块** | 左侧橙色 3px 边框 + 浅色背景，替代默认的无感样式 |
| **表格** | `display: block; overflow-x: auto` 防止溢出，行 hover 高亮 |
| **选中色** | `::selection` 橙色半透明，克制但有个性 |
| **返回顶部** | 右下角圆形按钮，滚动 400px 后淡入，hover 变橙 |

### 3. 文章页加阅读时长（覆盖 `layouts/_default/single.html`）

覆盖 single.html，在文章标题下方元信息区加一行：

```go
<span class="dot">&middot;</span>
<span>☕ {{- .ReadingTime -}} 分钟 · {{- .WordCount -}} 字</span>
```

`ReadingTime` 和 `WordCount` 是 Hugo 内置变量，零成本拿到。程序员看文章前先看"多长"，这是刻在 DNA 里的习惯。

### 4. 首页加博主信息 + 页脚返回顶部

- `hugo.toml` 补上 `name` / `bio` / `copyright` / `mainSections`。Paper 首页会在文章列表上方渲染博主卡片（头像 + 名字 + bio），之前没配所以一直是空白。
- 覆盖 `footer.html`，加返回顶部按钮和 6 行原生 JS（`scrollY > 400` 时显示，`scrollTo({ behavior: 'smooth' })`）。没有用任何库。

---

## 程序员审美清单

这次定制的审美取向，总结成几条可复用的原则：

1. **克制是最高级的设计**。能用一个 CSS 属性解决的，绝不用一个组件库。
2. **信息密度要够，但要有层级**。阅读时长、字数、标签计数——数据都给，但用 `opacity` 和字号拉开层级，主次分明。
3. **等宽字体是程序员的浪漫**。代码块、行内代码统一等宽，一眼扫过去就知道"这是代码"。
4. **细节决定质感**。细滚动条、选中色、链接下划线、表格 hover——单个不起眼，合起来就是"精致"。
5. **可回滚优先于可炫技**。用 Hugo 覆盖机制而不是 fork 主题，意味着所有定制都是"增量"，出问题随时可以摘掉。

---

## 验证

推送到 GitHub 后，Actions 自动执行 `hugo --minify` 并部署。几个关键验证点：

- [x] `/tags/`、`/categories/` 已移除（HTTP 404），导航栏只剩「关于」
- [x] 文章页显示"☕ N 分钟 · N 字"
- [x] 文章底部标签为纯文本，无 404 死链
- [x] 暗色模式下代码块、表格、滚动条均正常
- [x] 移动端无横向溢出

---

## 结语

这次定制没有引入任何新依赖——不 fork 主题、不装组件库、不加构建步骤，只用了 Hugo 本身提供的覆盖机制和一段纯 CSS。**最好的定制，是让你感觉不到定制的存在**：它只是让博客变得更像"该有的样子"。

如果你也在用 Hugo + Paper，希望这篇能给你一些灵感。完整代码都在 <https://github.com/nova02640/nova02640.github.io>，欢迎围观。

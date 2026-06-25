# GitHub 自动博客 — 架构与实现计划

## Context

用户希望搭建一个**个人博客网站**，内容自动从 GitHub 首页数据（项目、贡献、语言统计）通过 Claude API 生成，部署到 Cloudflare Pages（使用 `pages.dev` 免费域名），前端使用 **shadcn/ui** 组件库构建。目标是零成本（除 Claude API 微量费用）、免备案、一键部署。

---

## 一、技术栈

| 层 | 选型 | 理由 |
|---|------|------|
| **框架** | Astro 5.x | 内容优先的 SSG，原生支持 Cloudflare Pages，支持 React 组件岛 |
| **UI 组件** | shadcn/ui (React) | 官方支持 Astro 模版，可访问性好，60+ 组件 |
| **样式** | Tailwind CSS v4 | shadcn 的底层依赖 |
| **交互组件** | React 18 | 用作 Astro 的 UI 孤岛（islands），只在需要 JS 的地方加载 |
| **内容管理** | Astro Content Collections | 类型安全的前置元数据，自动路由 |
| **部署** | Cloudflare Pages | 免费，自动 HTTPS，集成 Git |
| **CI/CD** | GitHub Actions | 定时抓取数据 + 调用 API 生成内容 |
| **内容生成** | Claude API (Anthropic SDK) | 将 GitHub 数据分析转成博客文章 |
| **数据源** | GitHub REST API | 拉取仓库、贡献、语言统计 |

---

## 二、数据流

```
┌────────────────────────────────────────────────────────────┐
│                    每周自动运行                              │
│                                                             │
│  GitHub Actions (手动触发 workflow_dispatch)                │
│    ├─ 1. fetch-github.js: 调用 GitHub API 获取用户数据       │
│    ├─ 2. generate-posts.js: 调用 Claude API → 生成 Markdown │
│    ├─ 3. 保存到 src/content/blog/                           │
│    └─ 4. git commit && git push                             │
│                                                             │
└────────────────────────────────┬────────────────────────────┘
                                 │ push
                                 ▼
┌────────────────────────────────────────────────────────────┐
│                 Cloudflare Pages                            │
│    ├─ 检测到 push → 自动构建: astro build                    │
│    ├─ 生成静态 HTML/CSS/JS 到 dist/                          │
│    └─ 部署到 *.pages.dev                                    │
│                                                             │
│    ├─ /              → 首页（Hero + 项目 + 最近文章）        │
│    ├─ /blog          → 博客列表                              │
│    ├─ /blog/[slug]   → 单篇文章（带目录）                     │
│    ├─ /projects      → GitHub 项目展示                       │
│    └─ /rss.xml       → RSS Feed（播客订阅标准格式）           │
└────────────────────────────────────────────────────────────┘
```

---

## 三、页面设计与 shadcn 组件映射

### 1. 首页 `/`

| 区域 | 内容 | shadcn 组件 |
|------|------|------------|
| **Hero** | 头像 + 名称 + 一句话简介 | `Avatar` + `Button`（GitHub 链接） |
| **精选项目** | 3-4 个代表性仓库（卡片网格） | `Card`、`CardHeader`、`CardContent`、`Badge`（语言标签） |
| **最近文章** | 最新 3 篇博客摘要列表 | `Card` + `Separator` |
| **技术栈** | 语言分布可视化 | `Badge` 标签列表 |
| **页脚** | 社交链接 + 版权 | — |

### 2. 文章列表 `/blog`

| 区域 | 内容 | shadcn 组件 |
|------|------|------------|
| **头部** | 标题 + 描述 | — |
| **文章列表** | 按日期降序，每篇：标题、日期、标签、摘要 | `Card`、`Badge` |
| **分页** | 上一页/下一页 | `Button`（变体 `outline`） |

### 3. 文章详情 `/blog/[slug]`

| 区域 | 内容 | shadcn 组件 |
|------|------|------------|
| **文章头** | 标题、日期、标签 | `Badge` |
| **正文** | Markdown 渲染 + 自动目录 | `TableOfContents`（自定义） |
| **相关文章** | 相同标签的文章 | `Card` |

### 4. 项目展示 `/projects`

| 区域 | 内容 | shadcn 组件 |
|------|------|------------|
| **筛选** | 按语言/类别筛选 | `Tabs` |
| **项目网格** | 全量 GitHub 仓库卡片 | `Card`、`Badge`（星星数/语言/主题） |

### 5. 项目详情 `/projects/[name]`

| 区域 | 内容 | shadcn 组件 |
|------|------|------------|
| **概要** | 仓库名称、描述、Star/Fork 数 | `Card` |
| **README 摘要** | AI 生成的仓库亮点 | — |
| **相关文章** | 提到此项目的博客 | `Card` |

---

## 四、项目目录结构

```
github-blog/
├── .github/
│   └── workflows/
│       └── generate-and-deploy.yml   # GitHub Actions 定时任务
├── scripts/
│   ├── fetch-github.js               # 调用 GitHub API 获取数据
│   ├── generate-posts.js             # 调用 Claude API 生成文章
│   └── generate-projects.js          # 生成项目数据 JSON
├── src/
│   ├── components/
│   │   └── ui/                       # shadcn 组件（由 CLI 生成）
│   │       ├── avatar.tsx
│   │       ├── badge.tsx
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── tabs.tsx
│   │       └── separator.tsx
│   ├── components/                   # 自定义 React 组件
│   │   ├── Header.astro              # 导航栏（PC + 移动端 Sheet）
│   │   ├── Footer.astro
│   │   ├── HeroSection.astro
│   │   ├── ProjectCard.tsx           # React 交互组件
│   │   ├── BlogCard.tsx
│   │   ├── ThemeToggle.tsx           # 深色/浅色切换
│   │   └── TagFilter.tsx
│   ├── content/
│   │   ├── config.ts                 # Content Collection schema
│   │   └── blog/                     # 自动生成的.MD 文章
│   ├── layouts/
│   │   └── BaseLayout.astro          # 全局布局（head、导航、主题）
│   ├── pages/
│   │   ├── index.astro               # 首页
│   │   ├── blog/
│   │   │   ├── index.astro           # 博客列表
│   │   │   └── [...slug].astro       # 动态文章页（Content Collections）
│   │   ├── projects/
│   │   │   ├── index.astro           # 项目展示
│   │   │   └── [name].astro          # 项目详情
│   │   ├── about.astro               # 关于我
│   │   └── rss.xml.js                # RSS Feed 生成
│   └── lib/
│       ├── github.ts                 # GitHub API 封装
│       ├── utils.ts                  # shadcn cn() 工具函数
│       └── constants.ts              # 配置常量
├── public/                           # 静态资源
├── astro.config.mjs
├── tailwind.config.mjs
├── tsconfig.json
├── package.json
└── wrangler.toml                     # Cloudflare Pages 配置（可选）
```

---

## 五、内容生成脚本设计

### `scripts/generate-posts.js` 逻辑

```
1. 读取 scripts/data/github-stats.json（由 fetch-github.js 生成）
2. 构造 prompt，包含：
   - 用户仓库列表（名称、描述、语言、Star 数）
   - 近期 GitHub 事件
   - 语言分布统计
3. 调用 Claude API（Anthropic SDK）
   - 要求输出 Markdown 格式
   - 包含 frontmatter（title, date, tags, description）
   - 限定 800-1500 字
4. 保存到 src/content/blog/ 目录
```

### 文章主题类型（AI 自动选择）

| 类型 | 内容 | 触发条件 |
|------|------|---------|
| **周报** | 本周贡献总结、新项目、变化 | 有活跃更新 |
| **项目深挖** | 聚焦一个仓库的架构/技术决策 | 新仓库或重大更新 |
| **技术栈分析** | 语言/框架使用趋势 | 数据有变化 |
| **开源动态** | Star/Issue/PR 变化 | 有显著变化 |

---

## 六、GitHub Actions 工作流

```yaml
# .github/workflows/generate-and-deploy.yml
name: Generate Blog Content & Deploy

on:
  workflow_dispatch:         # 手动触发，提供参数选项
    inputs:
      article_type:
        description: '文章类型（留空则 AI 自动选择）'
        required: false
        type: choice
        options:
          - auto（AI 自动选择）
          - weekly（周报）
          - project（项目深挖）
          - tech-stack（技术栈分析）
      generate_count:
        description: '生成篇数（1-3）'
        required: false
        default: '1'

jobs:
  generate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
      - run: npm install
      - run: node scripts/fetch-github.js
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - run: node scripts/generate-posts.js
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
      - run: node scripts/generate-projects.js
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add src/content/
          git diff --quiet && git diff --staged --quiet || git commit -m "chore: auto-generate blog content"
          git push
```

---

## 七、实施步骤（6 步）

### Step 1: 初始化项目

```
pnpm create astro@latest github-blog --template basics
cd github-blog
pnpm astro add react tailwind
npx shadcn@latest init -t astro
npx shadcn@latest add card badge button avatar tabs separator
```

### Step 2: 搭建基础框架

- 创建 `src/layouts/BaseLayout.astro`（全局导航 + 主题 + 页脚）
- 创建各页面 `index.astro`、`blog/index.astro`、`projects/index.astro`
- 配置 `astro.config.mjs`（Cloudflare adapter + site URL）
- 添加 `@astrojs/rss`、`@astrojs/cloudflare`

### Step 3: 实现 UI 组件

- 使用 shadcn 组件构建：Header、Footer、HeroSection、ProjectCard、BlogCard、ThemeToggle
- 实现深色/浅色主题切换（shadcn 内置支持）

### Step 4: 配置 Content Collections

- `src/content/config.ts` 定义博客文章的 schema
- 配置 `[...slug].astro` 动态路由

### Step 5: 编写数据生成脚本

- `scripts/fetch-github.js` — GitHub API 封装（仓库、语言、事件）
- `scripts/generate-posts.js` — Claude API → Markdown 内容生成
- `scripts/generate-projects.js` — 项目数据 JSON 生成

### Step 6: 配置部署

- GitHub Actions 工作流
- Cloudflare Pages 自动部署
- 设置 `ANTHROPIC_API_KEY` 和 `GITHUB_TOKEN` 到 GitHub Secrets

---

## 八、验证方式

1. **本地验证**：`pnpm dev` 启动开发服务器，访问 `http://localhost:4321`
2. **构建验证**：`pnpm build` 确认无报错，检查 `dist/` 输出
3. **手动生成验证**：运行 `node scripts/generate-posts.js` 看是否能生成有效 Markdown
4. **最终验证**：push 到 main → Actions 运行 → Pages 部署成功 → 访问 `*.pages.dev`

---

## 九、后续可选增强（不在本轮实施）

- 绑定自定义域名 + Cloudflare DNS 托管，改善国内访问
- 添加评论区（Giscus / Gitalk）
- 添加访问统计（Umami / Plausible，自建免费版）
- 文章支持 AI 朗读（Edge-TTS 一键转音频）
- 百度/Google 搜索收录优化

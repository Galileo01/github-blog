# AGENTS — 项目指南

本文件面向在 `github-blog` 项目中协作的 AI Agent，描述项目架构、关键决策和约定。

## 项目概览

GitHub 数据驱动的个人技术博客 — 自动同步仓库与 Pinned 项目，文章以 Markdown 维护，部署到 Cloudflare Pages。

### 架构

```
GitHub API → fetch-github.js → github-stats.json
                              ↓
                 generate-projects.js → src/data/projects.json ─┐
                                                                ├→ Astro 7 build
人类 / 协作 Agent → src/content/blog/*.md ──────────────────────┘
                                                                      ↓
                                                        Cloudflare Pages
```

### 关键决策

1. **Astro 7 + static mode**：纯静态生成，无需 Server Adapter
2. **shadcn/ui v4**：基于 @base-ui/react 作为底层无头组件
3. **Tailwind CSS 4**：通过 @tailwindcss/vite 插件集成，无 tailwind.config.js
4. **GraphQL 优先 + HTML 降级**：获取 Pinned 仓库的双通道策略
5. **客户端排序**：SortableProjectList 使用 React Island，纯前端排序
6. **GitHub Actions**：`workflow_dispatch` 手动同步项目数据并部署
7. **Agent 中立创作**：任何协作 Agent 都必须遵守同一套 Markdown 文章规则

## 运行环境与常用命令

- Node.js `>=22.12.0`
- pnpm 10

| 命令 | 作用 | 依赖 | 主要输出 |
|------|------|------|----------|
| `pnpm dev` | 启动 Astro 本地开发服务器 | — | 默认访问 `http://localhost:4321` |
| `pnpm build` | 执行 Astro 静态生产构建 | — | `dist/` |
| `pnpm fetch-data` | 从 GitHub 抓取用户、仓库、Pinned 和事件数据 | GitHub API；`GITHUB_TOKEN` 可选 | `scripts/data/github-stats.json` |
| `pnpm generate-projects` | 根据已有 GitHub 数据生成项目页数据 | 需先存在 `github-stats.json` | `src/data/projects.json` |
| `pnpm sync-projects` | 依次执行 `fetch-data` 和 `generate-projects` | GitHub API | 上述两个 JSON 文件 |

使用约定：

- 新增仓库或修改 Pinned 时执行 `pnpm sync-projects`。
- `scripts/data/` 是被 Git 忽略的中间数据；`src/data/projects.json` 是需要审查和提交的生成结果。
- 文章由人类或协作 Agent 按需创建，不属于项目数据同步流程。
- 本地查看已有内容不需要重新生成数据，直接执行 `pnpm dev`。

## 数据流

### 脚本链

| 脚本 | 输入 | 输出 | 依赖 |
|------|------|------|------|
| `fetch-github.js` | GitHub API | `scripts/data/github-stats.json` | GITHUB_TOKEN（可选） |
| `generate-projects.js` | github-stats.json | `src/data/projects.json` | — |

### 数据格式

`github-stats.json`:
```jsonc
{
  "fetchedAt": "ISO timestamp",
  "pinnedRepos": ["repo-a", "repo-b"], // 来自 GraphQL / HTML 降级
  "user": { /* login, name, avatarUrl etc */ },
  "repos": [ /* { name, fullName, description, language, stars, forks, ... } */ ],
  "languages": [ /* { name, count } sorted desc */ ],
  "totalStars": 0, // 示例值，以实际生成结果为准
  "totalForks": 0,
  "events": [ /* { type, repo, createdAt } */ ]
}
```

`projects.json`:
```jsonc
{
  "fetchedAt": "ISO timestamp",
  "totalProjects": 0, // 示例值，以实际生成结果为准
  "totalStars": 0,
  "totalForks": 0,
  "languages": [ /* { name, count } */ ],
  "projects": [
    {
      "name": "repo-name",
      "description": "...",
      "language": "TypeScript",
      "stars": 5,
      "forks": 1,
      "topics": [],
      "pinned": true,        // 根据 pinnedRepos 自动标记
      "url": "https://github.com/Galileo01/repo",
      "updatedAt": "ISO",
      "createdAt": "ISO"
    }
  ]
}
```

## 代码约定

### 文件结构和命名

- `.astro` 文件：Astro 组件，支持 JSX 语法，服务端渲染部分
- `.tsx` / `.jsx`：React 客户端组件（通过 client:load 加载）
- `scripts/*.js`：数据生成脚本，Node.js ESM

### Astro 7 Content Collections API

```javascript
// src/content.config.ts — 使用 defineCollection + glob loader
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/blog" }),
  schema: z.object({ title, description, date: z.date(), tags, draft }),
});
```

- 文章引用使用 `post.id`（含 `.md` 后缀），非 `post.slug`
- 渲染使用 `render(post)` 函数从 `astro:content` 导入
- 路由 slug 通过 `post.id.replace(/\.md$/, '')` 获取

### 博客文章创作约定

- 只有用户明确要求时才新增文章，文章统一放在 `src/content/blog/*.md`。
- 文件名使用稳定、可读的 kebab-case；除非用户明确要求，不覆盖已有文章。
- frontmatter 必须符合 `src/content.config.ts`，填写 `title`、`description`、`date`、`tags` 和 `draft`。
- `tags` 至少包含两个相关标签；未完成的文章必须设置 `draft: true`。
- 正文不重复添加与页面标题相同的一级标题。
- 内容必须基于真实代码、项目状态或用户提供的资料；明确区分已验证事实、判断和未来计划。
- 引用外部资料时提供来源链接；只有关系复杂且确有帮助时才使用 Mermaid。
- 不强制绑定或标注特定模型；如果用户要求记录来源，应使用通用、准确的说明。
- 新增或修改文章后运行 `pnpm build` 和 `git diff --check`。

### React Islands

- React 组件放在 `src/components/` 目录
- 使用 `client:load` 指令在 Astro 页面中加载
- 示例：`<ThemeToggle client:load />`、`<SortableProjectList client:load />`

### 样式

- 全局样式在 `src/styles/global.css`，使用 `@import "tailwindcss"`
- CSS 变量（shadcn 主题色）在此文件中
- 暗色模式通过 `.dark` class 切换
- shadcn 组件使用 `cn()` 工具函数合并 class

### Pinned 仓库检测

```mermaid
flowchart TD
    A[fetchPinnedRepos] --> B{GITHUB_TOKEN?}
    B -->|Yes| C[GraphQL API]
    C --> D{成功且有结果?}
    D -->|Yes| E[返回 pinnedRepos]
    D -->|No| F[解析 HTML]
    B -->|No| F
    F -->|成功| E
    F -->|失败| G[返回 [] 降级]
```

## 部署

- `.github/workflows/sync-projects-and-deploy.yml` 通过 `workflow_dispatch` 手动触发
- 工作流抓取 GitHub、更新 `src/data/projects.json` 并提交生成结果
- 工作流提交生成结果后，使用 `cloudflare/wrangler-action@v3` 部署
- 无 `wrangler.toml`，配置在 Cloudflare Dashboard 中
- 框架预设选择 **Astro**，构建命令 `pnpm build`，输出目录 `dist/`

## 环境变量

| 变量 | 用途 | 在何处设置 |
|------|------|-----------|
| `GITHUB_TOKEN` | GitHub API 认证（GraphQL 获取 Pinned） | GitHub Actions 自动注入 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages 部署 | GitHub Secrets |

## 修改与验证

- 不手动编辑 `scripts/data/github-stats.json` 或 `src/data/projects.json`；通过对应脚本重新生成。
- 修改文章 schema 时同步检查 `src/content.config.ts`、文章 frontmatter 和路由读取逻辑。
- 修改 React 组件时保持其位于 `src/components/`，并在 Astro 页面中明确指定客户端指令。
- 完成功能或数据更新后，至少运行 `pnpm build` 和 `git diff --check`。
- 构建必须使用 Node.js `>=22.12.0`。
- 未经用户确认，不提交或推送改动。

## 常见问题

1. **`post.render is not a function`** — Astro 7 使用 `render(post)` from `astro:content`，非 `post.render()`
2. **`post.slug is undefined`** — Astro 7 使用 `post.id`，需 `.replace(/\.md$/, '')`
3. **`content/config.ts` 不生效** — Astro 7 需要 `src/content.config.ts`（项目根级别）
4. **Pinned 检测失败** — 检查 HTML 结构是否有变化，或 GITHUB_TOKEN 是否过期

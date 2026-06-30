# AGENTS — 项目指南

本文件面向在 `github-blog` 项目中协作的 AI Agent，描述项目架构、关键决策和约定。

## 项目概览

GitHub 自动博客 — 从 GitHub 个人数据（仓库、Pinned、事件）通过 Claude API 自动生成博客文章，部署到 Cloudflare Pages。

### 架构

```
GitHub API → fetch-github.js → github-stats.json
                                      ↓
Claude API → generate-posts.js → src/content/blog/*.md
                                      ↓
                      generate-projects.js → src/data/projects.json
                                      ↓
                    Astro 7 build → static HTML → Cloudflare Pages
```

### 关键决策

1. **Astro 7 + static mode**：纯静态生成，无需 Server Adapter
2. **shadcn/ui v4**：基于 @base-ui/react 作为底层无头组件
3. **Tailwind CSS 4**：通过 @tailwindcss/vite 插件集成，无 tailwind.config.js
4. **GraphQL 优先 + HTML 降级**：获取 Pinned 仓库的双通道策略
5. **客户端排序**：SortableProjectList 使用 React Island，纯前端排序
6. **GitHub Actions**：workflow_dispatch 手动触发，commit + push 触发 Cloudflare 部署

## 数据流

### 脚本链

| 脚本 | 输入 | 输出 | 依赖 |
|------|------|------|------|
| `fetch-github.js` | GitHub API | `scripts/data/github-stats.json` | GITHUB_TOKEN（可选） |
| `generate-posts.js` | github-stats.json + Claude API | `src/content/blog/*.md` | ANTHROPIC_API_KEY |
| `generate-projects.js` | github-stats.json | `src/data/projects.json` | — |

### 数据格式

`github-stats.json`:
```jsonc
{
  "fetchedAt": "ISO timestamp",
  "pinnedRepos": ["repo-a", "repo-b"],  // 来自 GraphQL / HTML 降级
  "user": { /* login, name, avatarUrl etc */ },
  "repos": [ /* { name, fullName, description, language, stars, forks, ... } */ ],
  "languages": [ /* { name, count } sorted desc */ ],
  "totalStars": 24,
  "totalForks": 4,
  "events": [ /* { type, repo, createdAt } */ ]
}
```

`projects.json`:
```jsonc
{
  "fetchedAt": "ISO timestamp",
  "totalProjects": 54,
  "totalStars": 24,
  "totalForks": 4,
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

- **Cloudflare Pages** 自动从 Git 构建
- 使用 `cloudflare/wrangler-action@v3` Actions 部署
- 无 `wrangler.toml`，配置在 Cloudflare Dashboard 中
- 框架预设选择 **Astro**，构建命令 `pnpm build`，输出目录 `dist/`

## 环境变量

| 变量 | 用途 | 在何处设置 |
|------|------|-----------|
| `GITHUB_TOKEN` | GitHub API 认证（GraphQL 获取 Pinned） | GitHub Actions 自动注入 |
| `ANTHROPIC_API_KEY` | Claude API 调用生成文章 | GitHub Secrets |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages 部署 | GitHub Secrets |

## 常见问题

1. **`post.render is not a function`** — Astro 7 使用 `render(post)` from `astro:content`，非 `post.render()`
2. **`post.slug is undefined`** — Astro 7 使用 `post.id`，需 `.replace(/\.md$/, '')`
3. **`content/config.ts` 不生效** — Astro 7 需要 `src/content.config.ts`（项目根级别）
4. **Pinned 检测失败** — 检查 HTML 结构是否有变化，或 GITHUB_TOKEN 是否过期

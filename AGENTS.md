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

浏览器 → Pages Functions `/api/analytics` → D1 `DB`
       → Pages Functions `/api/admin/*`   → HMAC 认证 → D1 `DB`
```

### 关键决策

1. **Astro 7 + static mode**：纯静态生成，无需 Server Adapter
2. **shadcn/ui v4**：基于 @base-ui/react 作为底层无头组件
3. **Tailwind CSS 4**：通过 @tailwindcss/vite 插件集成，无 tailwind.config.js
4. **GraphQL 优先 + HTML 降级**：获取 Pinned 仓库的双通道策略
5. **客户端排序**：SortableProjectList 使用 React Island，纯前端排序
6. **GitHub Actions**：`workflow_dispatch` 手动同步项目数据并部署
7. **Agent 中立创作**：任何协作 Agent 都必须遵守同一套 Markdown 文章规则
8. **静态站点 + 动态边缘接口**：Astro 继续静态构建，访问统计仅由根目录
   `functions/` 中的 Pages Functions 处理
9. **Dashboard 是生产配置源**：不提交 `wrangler.toml`；D1 binding 和后台
   secrets 在 Cloudflare Pages Dashboard 配置。生产 migration 由 GitHub
   Actions 根据 D1 database ID 生成临时 Wrangler 配置执行
10. **最小化统计数据**：不保存 IP、User-Agent 或完整 referrer；服务端按
    pathname、匿名 UUID 和 Unix 分钟唯一去重

## 运行环境与常用命令

- Node.js `>=22.12.0`
- pnpm 10

| 命令 | 作用 | 依赖 | 主要输出 |
|------|------|------|----------|
| `pnpm dev` | 启动 Astro 本地开发服务器 | — | 默认访问 `http://localhost:4321` |
| `pnpm dev:analytics` | 构建并启动 Pages Functions + 持久化本地 D1 | Wrangler | `http://localhost:8788` |
| `pnpm build` | 执行 Astro 静态生产构建 | — | `dist/` |
| `pnpm test` | 运行统计 API、认证和共享逻辑测试 | — | Node test 结果 |
| `pnpm test:analytics:e2e` | 构建并运行隔离的 Pages Functions + D1 端到端测试 | Wrangler | 自动清理临时 D1 |
| `pnpm check` | 依次运行测试和生产构建 | — | 测试与 `dist/` |
| `pnpm verify` | 单元测试、构建和真实本地 D1 端到端验证 | Wrangler | 完整验证结果 |
| `pnpm fetch-data` | 从 GitHub 抓取用户、仓库、Pinned 和事件数据 | GitHub API；`GITHUB_TOKEN` 可选 | `scripts/data/github-stats.json` |
| `pnpm generate-projects` | 根据已有 GitHub 数据生成项目页数据 | 需先存在 `github-stats.json` | `src/data/projects.json` |
| `pnpm sync-projects` | 依次执行 `fetch-data` 和 `generate-projects` | GitHub API | 上述两个 JSON 文件 |

使用约定：

- 新增仓库或修改 Pinned 时执行 `pnpm sync-projects`。
- `scripts/data/` 是被 Git 忽略的中间数据；`src/data/projects.json` 是需要审查和提交的生成结果。
- 文章由人类或协作 Agent 按需创建，不属于项目数据同步流程。
- 本地查看已有内容不需要重新生成数据，直接执行 `pnpm dev`。
- `pnpm dev` 只验证 Astro 静态页面；完整自动验证使用 `pnpm verify`，浏览器
  手动联调使用 `pnpm dev:analytics`。
- Wrangler 使用 `pnpm dlx wrangler@4.114.0`，不重复安装全局依赖。

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
- `src/` 下可复用的业务逻辑和浏览器辅助模块优先使用 `.ts`；只有框架入口、
  内联脚本或既有工具链明确要求时才保留 `.js`
- Dashboard 图表结构放在 Astro 组件中，DOM 交互放在独立 `.ts` 控制器中，
  坐标和路径算法保持为不访问 DOM 的纯函数
- `scripts/*.js`：数据生成脚本，Node.js ESM

### Pages Functions

- 根目录 `functions/` 是 Cloudflare Pages 的文件路由目录，不属于 Astro
  `src/pages/`。
- `functions/api/analytics.js` 映射 `/api/analytics`，目录中的
  `_middleware.js` 保护其所有后代路由。
- 生产执行环境是 Cloudflare Workers runtime，不是 Node.js 常驻进程。
- Function 应使用 Request、Response、Fetch、Web Crypto 等 Web API；不要依赖
  本地文件系统、Node.js 进程状态或跨请求内存。
- D1 通过 `context.env.DB` binding 注入，后台 secrets 通过 `context.env` 读取。
- 本地只能通过 `wrangler pages dev` 验证 Functions；`astro dev` 不会运行它们。

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
- GitHub Actions + Wrangler 是唯一生产发布入口；Cloudflare Pages 的 Git
  自动生产和 preview 部署必须关闭，避免 push 绕过 migration 与 smoke 门禁
- 生产 Pages 项目必须绑定名为 `DB` 的 D1 数据库
- 发布 job 使用 GitHub `production` Environment；审批规则在 GitHub 设置
- 部署前运行 `pnpm verify`，再使用独立 D1 Token 和由 D1 database ID
  生成的临时 Wrangler 配置自动执行远端 migration
- 部署后必须对实际 deployment URL 执行 smoke test
- `ADMIN_PASSWORD` 和 `ADMIN_SESSION_SECRET` 必须作为 Pages 加密变量配置
- `POST /api/analytics` 和 `POST /api/admin/login` 必须配置独立的 Cloudflare
  Rate Limiting 规则，后者更严格
- 框架预设选择 **Astro**，构建命令 `pnpm build`，输出目录 `dist/`

## 环境变量

| 变量 | 用途 | 在何处设置 |
|------|------|-----------|
| `GITHUB_TOKEN` | GitHub API 认证（GraphQL 获取 Pinned） | GitHub Actions 自动注入 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages 部署 | GitHub Secrets |
| `CLOUDFLARE_D1_API_TOKEN` | 生产 D1 migration，独立 D1 Edit 权限 | GitHub Secrets |
| `CLOUDFLARE_D1_DATABASE_ID` | 生产 D1 UUID，用于临时 migration 配置 | GitHub Secrets |
| `CLOUDFLARE_ACCOUNT_ID` | Wrangler Action 账号定位 | GitHub Secrets |
| `DB` | D1 访问统计 binding | Cloudflare Pages Dashboard |
| `ADMIN_PASSWORD` | 统计后台登录密码 | Pages 加密变量 / 本地环境变量 |
| `ADMIN_SESSION_SECRET` | HMAC 会话签名密钥，至少 32 个随机字符 | Pages 加密变量 / 本地环境变量 |

## 访问统计约定

- 数据库结构只通过 `migrations/*.sql` 变更，不在 Function 中临时建表。
- `page` 只接受 `/`、`/blog`、`/blog/<kebab-case-slug>` 和 `/projects`。
- 浏览器产生的单个尾斜杠必须规范化后再校验和入库，不能把同一页面拆成两份统计。
- `visitor_id` 必须是 UUID v4；浏览器生成后保存到 `localStorage`。
- 客户端节流仅减少请求，数据去重由 D1 唯一索引保证。
- 数据库存储 UTC；“今日”和按日趋势按 `Asia/Shanghai` 计算。
- 后台页面只能使用安全 DOM API / `textContent` 渲染数据库内容。
- 后台热门页面的 Path 过滤是服务端字面量包含查询：最多 200 字符，只接受
  字母、数字、`/` 和 `-`，必须使用绑定参数并在 `LIMIT` 前过滤。
- 后台热门页面只接受 `sort=pv|uv` 和 `order=asc|desc`；动态 SQL 排序片段
  必须来自固定白名单。
- 后台热门页面时间只接受 `range=today|7d|month|all`，按北京时间日历边界
  计算，并作为概要、趋势、占比和列表的全局筛选。Path 只允许传给列表接口，
  不得影响占比；占比只接受 `dimension=section|article` 和 `metric=pv|uv`。
  `/blog` 作为“博客列表”独立大类，`/blog/*` 作为“博客”文章大类；大类
  全部展示，博客文章前 8 篇之外合并为带剩余篇数的“其他文章”。
- Dashboard 图标使用现有 Lucide 静态渲染；简单趋势图优先使用原生 SVG，
  不为图标或图表新增 React hydration。
- Analytics 后台的 Astro 页面只负责编排；页面私有组件和逻辑放在路由目录的
  `_components`、`_lib` 中，公共 `src/components` 只放跨页面组件。认证、
  全局时间、刷新和分区加载集中在 `analytics-admin.ts`。
- 管理会话使用 HttpOnly、SameSite=Lax 的 HMAC Cookie；生产 HTTPS 增加
  `Secure`，有效期 24 小时。
- `wrangler.local.example.toml` 只包含合成的本地 ID，用于
  `pnpm dev:analytics`，不得当作生产配置。
- 本地管理员凭据通过权限为 `0600` 的临时 env 文件传给 Wrangler，退出时
  删除；不得把密码或会话密钥拼入命令行参数，也不得复用生产凭据。
- Wrangler Pages 不支持自定义路径的 `--config`；本地 `pages dev` 必须通过
  `--d1 DB=<database_id>` 注入 D1 binding。

## 修改与验证

- 不手动编辑 `scripts/data/github-stats.json` 或 `src/data/projects.json`；通过对应脚本重新生成。
- 修改文章 schema 时同步检查 `src/content.config.ts`、文章 frontmatter 和路由读取逻辑。
- 修改 React 组件时保持其位于 `src/components/`，并在 Astro 页面中明确指定客户端指令。
- 完成功能或数据更新后运行 `pnpm verify` 和 `git diff --check`。
- `pnpm verify` 必须验证真实 Pages Functions 请求和本地 D1 行为，而不只验证
  Wrangler 进程已启动。
- 构建必须使用 Node.js `>=22.12.0`。
- 未经用户确认，不提交或推送改动。

## 常见问题

1. **`post.render is not a function`** — Astro 7 使用 `render(post)` from `astro:content`，非 `post.render()`
2. **`post.slug is undefined`** — Astro 7 使用 `post.id`，需 `.replace(/\.md$/, '')`
3. **`content/config.ts` 不生效** — Astro 7 需要 `src/content.config.ts`（项目根级别）
4. **Pinned 检测失败** — 检查 HTML 结构是否有变化，或 GITHUB_TOKEN 是否过期

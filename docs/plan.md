# GitHub Blog — 当前架构与路线图

## 项目目标

构建一个由 GitHub 数据驱动的个人技术博客：

- 自动同步公开仓库、Pinned、语言、Star 和 Fork 数据
- 使用 Markdown 维护博客文章
- 使用 Astro 生成静态站点
- 通过 Cloudflare Pages 部署
- 允许人类或任意协作 Agent 按统一规则维护文章

当前项目事实和协作约定以 `AGENTS.md` 为准，用户操作方式以 `README.md` 为准。

## 当前架构

```text
GitHub API
  → scripts/fetch-github.js
  → scripts/data/github-stats.json
  → scripts/generate-projects.js
  → src/data/projects.json

人类 / 协作 Agent
  → src/content/blog/*.md

projects.json + Markdown
  → Astro 7 static build
  → dist/
  → Cloudflare Pages
```

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Astro 7，static mode |
| 内容 | Astro Content Collections + Markdown |
| UI | shadcn/ui v4 + React Islands |
| 样式 | Tailwind CSS 4 |
| 交互 | React 19 |
| 数据源 | GitHub REST API + GraphQL API |
| 自动化 | GitHub Actions |
| 部署 | Cloudflare Pages |

## 数据同步

### 输入与输出

| 阶段 | 输入 | 输出 |
|---|---|---|
| `pnpm fetch-data` | GitHub API | `scripts/data/github-stats.json` |
| `pnpm generate-projects` | `github-stats.json` | `src/data/projects.json` |
| `pnpm sync-projects` | GitHub API | 上述两个 JSON 文件 |

`scripts/data/` 是被 Git 忽略的中间数据。`src/data/projects.json` 是构建时使用并需要提交的项目数据。

### Pinned 获取策略

1. 有 `GITHUB_TOKEN` 时优先使用 GraphQL `pinnedItems`
2. GraphQL 失败或无 Token 时解析 GitHub 个人主页 HTML
3. 两种方式都失败时返回空数组，页面按 Star 排序降级

## 内容维护

文章放在 `src/content/blog/*.md`，通过 `src/content.config.ts` 校验 frontmatter。

文章可以由人类或任意协作 Agent 创建，但必须遵守 `AGENTS.md` 中的博客文章创作约定，包括：

- 只有用户明确要求时才新增文章
- 不擅自覆盖已有文章
- 使用有效 frontmatter
- 以真实代码、项目状态和可靠资料为依据
- 修改后运行构建和 diff 检查

## 页面

| 路由 | 内容 |
|---|---|
| `/` | 个人介绍、技术栈、最近文章、精选项目 |
| `/blog` | 博客文章列表 |
| `/blog/[slug]` | Markdown 文章详情 |
| `/projects` | GitHub 项目列表与客户端排序 |
| `/rss.xml` | RSS Feed |

## 自动化与部署

`.github/workflows/sync-projects-and-deploy.yml` 通过 `workflow_dispatch` 手动触发：

1. 安装 Node.js 22 和 pnpm 10
2. 抓取最新 GitHub 数据
3. 生成 `src/data/projects.json`
4. 有变化时提交并推送
5. 执行 Astro 静态构建
6. 部署 `dist/` 到 Cloudflare Pages

需要的环境变量：

| 变量 | 用途 |
|---|---|
| `GITHUB_TOKEN` | GitHub Actions 自动注入，用于 API 和 Pinned 查询 |
| `CLOUDFLARE_API_TOKEN` | 部署 Cloudflare Pages |

## 验证

本地最低验证流程：

```bash
nvm use 22
pnpm install
pnpm build
git diff --check
```

项目数据更新后还需要确认：

- `src/data/projects.json` 可以正常解析
- 新增仓库符合 fork 和 description 过滤规则
- `/projects` 构建产物包含预期项目
- Pinned 标记与 GitHub 当前设置一致

## 后续路线

1. 为数据同步脚本增加单元测试和 fixture
2. 减少项目列表客户端 bundle 体积
3. 增加文章草稿和发布检查
4. 改善 RSS、SEO 和结构化数据
5. 按需增加访问统计与管理能力

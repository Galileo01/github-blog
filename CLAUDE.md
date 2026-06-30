# CLAUDE — 项目工作指南

## 运行命令

```bash
# 开发服务器（背景运行）
pnpm dev
# 或: npx astro dev --background

# 构建
pnpm build

# 拉取 GitHub 数据
pnpm fetch-data

# 生成博客文章（需要 ANTHROPIC_API_KEY）
ANTHROPIC_API_KEY=sk-ant-xxx pnpm generate-posts

# 生成项目数据
pnpm generate-projects

# 一键生成
ANTHROPIC_API_KEY=sk-ant-xxx pnpm generate
```

> ⚠️ Node.js 版本需要 >= 22.12.0。本地开发用 nvm：
> `nvm use 22`

## 项目结构要点

| 路径 | 说明 |
|------|------|
| `src/content/blog/*.md` | 博客文章（AI 生成），通过 Content Collections 加载 |
| `src/content.config.ts` | Content Collections 配置（Astro 7 位置！非 `src/content/config.ts`） |
| `src/data/projects.json` | 项目数据（脚本生成，不手动编辑） |
| `scripts/data/github-stats.json` | GitHub 原始数据（脚本生成，不手动编辑） |
| `src/components/ui/` | shadcn 组件（由 CLI 安装，可手动修改样式） |
| `docs/plan.md` | 架构设计文档 |

## 构建常见问题

### Astro 7 特有 API

- ❌ `post.slug` → ✅ `post.id.replace(/\.md$/, '')`
- ❌ `post.render()` → ✅ `render(post)` 从 `astro:content` 导入
- ❌ `src/content/config.ts` → ✅ `src/content.config.ts`

### shadcn 相关

- shadcn v4 使用 `@base-ui/react` 作为底层，非 Radix UI
- `cn()` 工具函数在 `src/lib/utils.ts`
- 添加新组件：`npx shadcn add button`（选择 v4 版本）

### Tailwind CSS 4

- 通过 `@tailwindcss/vite` 插件配置在 `astro.config.mjs` 中
- 无 `tailwind.config.js`，直接使用 CSS 语法
- 全局样式在 `src/styles/global.css`，包含 shadcn CSS 变量

## 数据流

1. `pnpm fetch-data` → 调用 GitHub API → 写入 `scripts/data/github-stats.json`
2. `pnpm generate-projects` → 读取 github-stats.json → 写入 `src/data/projects.json`
3. `pnpm build` → Astro 读取 projects.json + content/blog → 生成静态页面

## 修改指南

### 增加新的 shadcn 组件

```bash
npx shadcn add card button
```

### 修改项目展示逻辑

- 静态卡片（首页精选区）：修改 `src/components/ProjectsSection.astro`
- 客户端排序（项目页）：修改 `src/components/SortableProjectList.tsx`

### 修改博客文章 schema

修改 `src/content.config.ts` 中的 `z.object()` 定义

## Pinned 仓库检测

双通道策略（`scripts/fetch-github.js`）：

```
有 GITHUB_TOKEN → GraphQL API 查询 pinnedItems
无 Token        → 解析 HTML github.com/{username}
```

修改 Pinned 后更新流程：

```bash
pnpm fetch-data && pnpm generate-projects
```

## 部署

1. GitHub Actions 手动触发（推荐）
2. Cloudflare Pages 自动从 Git 构建
3. 无需 `wrangler.toml`

### GitHub Secrets 配置

| Secret | 来源 |
|--------|------|
| `ANTHROPIC_API_KEY` | Claude Console |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Dashboard → API 令牌 → Cloudflare Pages:Edit |

## 用户偏好

- **用户名**：Galileo01
- **展示名称**：Mark
- **站点地址**：`https://github-blog.pages.dev`
- **包管理器**：pnpm（registry 使用内部 bnpm.byted.org）
- **VSCode 认证**：关闭 VSCode 的 github.gitAuthentication，手动 token 推送

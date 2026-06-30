# GitHub Blog

一个由 **GitHub 数据 + AI** 自动驱动的个人博客网站。

## 技术栈

- **框架**: [Astro](https://astro.build) 7
- **UI**: [shadcn/ui](https://ui.shadcn.com) + Tailwind CSS 4
- **部署**: Cloudflare Pages
- **内容生成**: Claude API + GitHub API

## 快速开始

```bash
# 安装依赖
pnpm install

# 开发
pnpm dev

# 构建
pnpm build
```

## 内容生成

```bash
# 1. 拉取 GitHub 数据
pnpm fetch-data

# 2. 生成博客文章（需要 ANTHROPIC_API_KEY）
ANTHROPIC_API_KEY=sk-xxx pnpm generate-posts

# 3. 生成项目数据
pnpm generate-projects

# 或者一键生成：
ANTHROPIC_API_KEY=sk-xxx pnpm generate
```

## 部署到 Cloudflare Pages

### 通过 GitHub Actions（推荐）

1. 将代码推送到 GitHub 仓库
2. 在 Cloudflare Dashboard 创建 Pages 项目，连接该仓库
3. 在 GitHub 仓库设置中添加 Secrets：
   - `ANTHROPIC_API_KEY`: 你的 Claude API 密钥
4. 手动触发 Workflow：GitHub → Actions → "Generate Blog Content & Deploy" → Run workflow

### 手动部署

```bash
pnpm build
npx wrangler pages deploy dist/ --project-name=github-blog
```

## 项目结构

```
github-blog/
├── .github/workflows/      # GitHub Actions
├── scripts/                # 数据生成脚本
│   ├── fetch-github.js     # 拉取 GitHub 数据
│   ├── generate-posts.js   # Claude API → 博客文章
│   └── generate-projects.js # 项目数据
├── src/
│   ├── components/         # UI 组件
│   │   ├── ui/             # shadcn 组件
│   │   ├── Header.astro
│   │   ├── Footer.astro
│   │   ├── ThemeToggle.tsx
│   │   ├── BlogCard.astro
│   │   └── ProjectsSection.astro
│   ├── content/blog/       # 博客文章 (Markdown)
│   ├── content.config.ts   # 内容集合配置
│   ├── layouts/            # 页面布局
│   ├── pages/              # 路由页面
│   └── styles/             # 全局样式
├── docs/plan.md            # 项目架构文档
└── README.md
```

## 许可证

MIT

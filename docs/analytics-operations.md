# 访问统计测试与发布手册

本文档是 D1 访问统计的操作入口。设计和 API 合约见
[`analytics-plan.md`](./analytics-plan.md)。

## 1. 命令分层

所有命令使用 Node.js `>=22.12.0` 和 pnpm 10。已有依赖时只需通过 NVM
切换 Node，不需要重复安装：

```bash
nvm use 22
```

| 命令 | 用途 | 是否启动真实本地 D1 |
|---|---|:---:|
| `pnpm test` | 快速运行 Node 单元和接口测试 | 否 |
| `pnpm check` | 单元测试 + Astro 生产构建 | 否 |
| `pnpm verify` | 单元测试 + 构建 + Pages Functions/D1 端到端测试 | 是，临时且自动清理 |
| `pnpm dev` | 只启动 Astro 静态开发服务器 | 否 |
| `pnpm dev:analytics` | 构建、迁移并启动可手动操作的完整本地站点 | 是，持久化到 `.wrangler/` |

日常提交前运行：

```bash
pnpm verify
git diff --check
```

## 2. 开发与调试流程

根据修改范围选择入口：

### 只修改文章、Astro 页面或样式

```bash
pnpm dev
```

- 地址为 `http://localhost:4321`。
- Astro 提供页面热更新。
- 该模式没有 Pages Functions 和 D1，统计请求失败属于预期行为。

### 修改统计 API、后台认证或需要观察 D1

```bash
pnpm dev:analytics
```

- 地址为 `http://localhost:8788`。
- 启动前自动构建当前 Astro 页面并应用本地 migration。
- 使用持久化的 `.wrangler/state`，适合重复调试统计数据。
- 它服务的是启动时生成的 `dist` 快照；修改 Astro 页面、Tracker 或样式后需要
  停止并重新运行该命令。

### 完成一轮修改后

```bash
pnpm verify
git diff --check
```

`pnpm verify` 使用全新的临时 D1，因此不会被手动调试期间积累的数据影响。

## 3. 一键端到端测试做了什么

`pnpm verify` 调用 `scripts/test-analytics-e2e.js`，自动完成：

1. 在系统临时目录创建隔离的 Wrangler 配置和 D1 状态目录。
2. 使用 Wrangler `4.114.0` 应用 migration。
3. 再次应用 migration，确认没有待执行迁移。
4. 选择空闲端口并启动 `wrangler pages dev`。
5. 验证公开统计 API 的首次记录、一分钟去重、PV/UV 和非法输入。
6. 写入当日和历史确定性页面数据，验证后台汇总、趋势、四种热门页面时间范围、
   Path 过滤、PV / UV 排序、完整总量和过滤先于 `LIMIT`。
7. 验证后台 401、错误密码、HttpOnly Cookie 和 logout。
8. 关闭 Wrangler 并删除临时目录。

该流程不需要 Cloudflare 账号、远端数据库、真实 database ID 或本地
`.dev.vars`，也不会污染日常开发数据。

## 4. 浏览器手动验收

需要观察 Tracker 和后台页面交互时运行：

```bash
pnpm dev:analytics
```

默认地址和凭据：

- 站点：`http://localhost:8788`
- 后台：`http://localhost:8788/admin/analytics`
- 本地后台密码：`test-password`
- D1 状态目录：`.wrangler/state`

如需覆盖本地密码和签名密钥，在启动命令前设置：

```bash
export ADMIN_PASSWORD="another-local-password"
export ADMIN_SESSION_SECRET="another-local-secret-with-at-least-32-characters"
pnpm dev:analytics
```

脚本会将这两个值写入权限为 `0600` 的临时 Wrangler env 文件，而不是拼进
进程命令行；Wrangler 退出后文件会自动删除。这里只应使用本地开发凭据，不要
复用生产密码或生产会话密钥。

浏览器验收清单：

- 打开文章后出现 `POST /api/analytics`。
- `localStorage.visitor_id` 是 UUID v4。
- 文章的 `-- PV / -- UV` 更新为数字。
- 同一标签页一分钟内刷新不会再次发出 POST 统计上报请求。
- 一分钟内刷新文章页虽然不会重复上报，但文章头部仍能通过只读查询恢复
  PV / UV，不得停留在 `-- PV / -- UV`。
- 错误密码不能登录后台。
- 正确登录后区间概要、双色趋势折线图、页面占比和热门列表可见。
- 趋势图组件仍以原生 SVG 运行，不应出现 React hydration 或第三方图表运行时。
- 点击顶部“刷新数据”后页面不重新载入，当前 Path、排序和已有内容在请求期间
  保持可见，刷新完成后按钮恢复可用。
- 模拟会话过期后刷新，页面进入登录状态；重新登录后刷新按钮必须恢复可用，
  不能继续显示“刷新中…”。
- 折线图悬停会显示日期、PV、UV；Tab 聚焦数据点时也能显示同样信息。
- Tab 聚焦折线图数据点时只显示数据点高亮环和辅助线，不出现覆盖整列的大矩形
  浏览器焦点框。
- 切换顶部“今日 / 7 天 / 当月 / 所有”后，概要、趋势、占比和列表同步更新，
  URL 中的 `range` 同步变化。
- 滚动 Dashboard 时统计时间栏吸附在站点导航下方，桌面和移动端均不得遮挡。
- 今日趋势按小时、本月按日；所有时间根据跨度按日、周或月显示。
- 环形图默认展示全部页面大类；可切换到博客文章视图以及独立的 PV / UV 指标。
- 博客文章超过 8 篇时，其余切片聚合为“其他文章（N 篇）”。
- UV 环形图的分母是各页面 UV 之和；顶部总 UV 仍是跨页面去重访客数，两者
  口径不同，环形图各项占比应合计为 100%。
- 环形图每个切片可通过 Tab 聚焦，图例、百分比和中心总量与全局时间一致。
- 在 Path 中输入 `blog` 或文章 slug 后，列表只显示包含该字符串的页面。
- Path 过滤、清除和表格排序均不得改变环形图的数据、指标和图例。
- 快速连续输入不会让旧请求覆盖新结果；Enter 立即查询，Escape 和清除按钮
  恢复全部页面。
- Path 有内容时只显示一个自定义清除按钮，点击后输入值和筛选结果都恢复。
- 点击 PV / UV 表头会切换排序指标和升降序，当前状态有箭头提示。
- 页面路径默认呈现为链接，鼠标和键盘焦点状态清晰，点击可进入对应站内页面。
- 缩窄浏览器并切换深色模式后，图表、筛选栏和表格仍然可读。
- logout 后后台 API 恢复为 `401`。

`pnpm dev` 只运行 Astro，不能验证 Pages Functions 或 D1。

## 5. Pull Request 与主分支验证

`.github/workflows/ci.yml` 在以下场景执行 `pnpm verify`：

- Pull Request。
- 推送到 `master`。

因此合并门禁应要求 `Validate / verify` 成功。该任务不访问生产 D1，也不需要
Cloudflare secrets。

## 6. 生产环境前置配置

Cloudflare Pages Dashboard 是生产配置唯一来源。项目必须配置：

| 名称 | 类型 | 用途 |
|---|---|---|
| `DB` | D1 binding | 生产访问统计数据库 |
| `ADMIN_PASSWORD` | 加密变量 | 统计后台密码 |
| `ADMIN_SESSION_SECRET` | 加密变量 | 至少 32 个随机字符的 HMAC 密钥 |

GitHub Actions 需要：

| Secret | 最小用途 |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | 指定 Cloudflare 账号 |
| `CLOUDFLARE_API_TOKEN` | Cloudflare Pages 部署权限 |
| `CLOUDFLARE_D1_API_TOKEN` | 独立的 D1 Edit 权限，仅用于 migration |
| `CLOUDFLARE_D1_DATABASE_ID` | 生产 D1 UUID，用于生成临时 Wrangler migration 配置 |

GitHub 仓库还应创建名为 `production` 的 Environment，并按需要配置人工审批。
没有配置 reviewer 时，`environment: production` 只提供隔离，不会自动产生审批。

仓库不提交生产 Wrangler 配置。部署任务会校验
`CLOUDFLARE_D1_DATABASE_ID` 是 UUID，并生成被 Git 忽略的
`wrangler.d1.ci.json`；`d1 migrations apply` 必须显式传入该临时配置。
该 UUID 从 Cloudflare Dashboard 的生产 `github-blog` D1 详情页复制，不要填写
数据库名称或 `DB` binding 名称。

GitHub Actions + Wrangler 是本项目唯一发布入口。如果 Pages 项目已经连接 Git，
在 Cloudflare Dashboard 的 **Settings → Builds → Branch control** 中：

- 关闭自动生产分支部署。
- 将 Preview branch 设置为 `None`。

否则同步项目数据产生的 push 会触发一条绕过测试、migration 和 smoke test 的
并行部署。

Cloudflare 还必须配置：

- `POST /api/analytics` 的 Rate Limiting 规则。
- 更严格的 `POST /api/admin/login` Rate Limiting 规则。

## 7. 自动发布顺序

手动运行 `Sync GitHub Projects & Deploy` 后：

- Branch 必须选择 `master`；其他 ref 会在任何同步或生产操作前明确失败。
- Pages 部署显式传入 `--branch=master`，确保 smoke test 命中 Production binding，
  而不是缺少生产 D1 binding 的 Preview 环境。

```text
同步 GitHub 数据
  → pnpm check
  → 提交生成后的 projects.json
  → production environment 审批
  → pnpm verify
  → 应用远端 D1 migrations
  → 部署 Cloudflare Pages
  → 对部署 URL 执行 smoke test
```

部署后的 smoke test 会检查：

- 首页返回 `200`。
- `/admin/analytics` 返回 `200`。
- `GET /api/analytics?page=/` 返回合法 PV/UV。
- 未登录访问后台统计 API 返回 `401`。
- 使用错误密码登录返回 `401`，从而确认后台 secrets 已配置。

如果 migration、D1 binding、Functions 或部署失败，工作流会停止，不继续把该次
发布报告为成功。

## 8. Migration 与回滚边界

- 数据库变更只能新增到 `migrations/`，不能修改已经在生产执行过的 migration。
- 当前流程先 migration、后部署，适用于向后兼容的新增表或新增字段。
- 破坏性结构调整应使用 expand → migrate → contract，多次发布完成。
- Pages 代码可以回滚到旧 deployment；D1 migration 不随代码自动回滚。
- migration 失败时 Wrangler 会回滚该 migration；远端执行前仍应确认备份和
  恢复策略。

相关官方资料：

- [Cloudflare Pages Functions](https://developers.cloudflare.com/pages/functions/)
- [Cloudflare Pages Git integration](https://developers.cloudflare.com/pages/configuration/git-integration/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
- [Cloudflare D1 local development](https://developers.cloudflare.com/d1/best-practices/local-development/)

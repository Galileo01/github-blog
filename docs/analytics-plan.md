# D1 页面访问统计与基础后台实施方案

## 1. 目标与范围

在现有 Astro 静态博客上增加一个最小、可验证的动态统计层：

- 使用 Cloudflare Pages Functions 接收和查询访问数据。
- 使用 Cloudflare D1 保存去重后的页面访问事件。
- 在文章页展示当前文章的 PV / UV。
- 提供仅站长可访问的 `/admin/analytics` 数据后台。
- 后台按全局时间范围展示区间概要、自适应趋势、页面占比和热门页面列表。

本版本不实现评论、用户注册、实时在线人数、访客画像或第三方分析平台。

## 2. 关键决策

### 2.1 保持 Astro 静态构建

文章、项目和页面继续由 Astro 在构建时生成。动态能力只放在根目录
`functions/` 下，由 Cloudflare Pages Functions 在运行时处理。

```text
浏览器
  ├─ 静态页面 ───────────────→ Cloudflare Pages
  ├─ POST /api/analytics ───→ Pages Function ─→ D1
  └─ /api/admin/* ──────────→ 认证中间件 ─────→ D1
```

### 2.2 Dashboard 是生产配置唯一来源

项目继续遵守现有约定：不提交 `wrangler.toml`。

生产环境在 Cloudflare Pages Dashboard 配置：

| Binding / Secret | 用途 |
|---|---|
| D1 binding `DB` | 访问统计数据库 |
| `ADMIN_PASSWORD` | 后台登录密码 |
| `ADMIN_SESSION_SECRET` | HMAC 会话签名密钥 |

这样不会让不完整的本地 Wrangler 配置覆盖 Dashboard 中的生产 binding。

### 2.3 只保存统计所需的最小数据

v1 不保存 IP、User-Agent、完整 referrer、邮箱或登录身份。

浏览器使用 `crypto.randomUUID()` 生成匿名 UUID，保存在
`localStorage.visitor_id`。它只用于 UV 去重，不用于跨站追踪。

## 3. 数据模型

迁移文件：`migrations/0001_create_pageviews.sql`

```sql
CREATE TABLE IF NOT EXISTS pageviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page TEXT NOT NULL,
  visitor_id TEXT NOT NULL,
  minute_bucket INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pageviews_unique_minute
  ON pageviews(page, visitor_id, minute_bucket);

CREATE INDEX IF NOT EXISTS idx_pageviews_created_at_page
  ON pageviews(created_at, page);
```

字段语义：

| 字段 | 语义 |
|---|---|
| `page` | 规范化后的站内 pathname |
| `visitor_id` | 浏览器生成的 UUID v4 |
| `minute_bucket` | 服务端计算的 Unix 分钟，用于一分钟去重 |
| `created_at` | D1 写入时生成的 UTC 时间 |

服务端使用 `INSERT OR IGNORE`。同一 UUID 在同一页面、同一分钟内重复请求
不会增加 PV。客户端节流只用于减少请求，不承担数据完整性或安全职责。

## 4. 统计语义

- **PV**：通过服务端一分钟去重后保留下来的访问事件数量。
- **UV**：合法 UUID v4 的去重数量。
- 非法或缺失 `visitorId` 返回 `400`，不写入 `unknown`。
- 数据库存储 UTC 时间。
- “今日”和按日趋势统一按 `Asia/Shanghai`（UTC+8）计算。
- 热门页面的“今日”“最近 7 天”和“本月”均使用北京时间日历边界；
  “最近 7 天”包含今天和此前 6 个完整日期，“所有时间”不设置起始边界。

允许记录的路径：

- `/`
- `/blog`
- `/blog/<kebab-case-slug>`
- `/projects`

不接受 query、hash、协议相对路径、控制字符或任意伪造路径。
浏览器目录路由可能携带一个尾斜杠；服务端接受后必须先规范化为上述无尾斜杠
形式，确保 `/blog/example/` 和 `/blog/example` 计入同一页面。

## 5. API 合约

所有 JSON 响应都显式设置 `Content-Type` 和合理的 `Cache-Control`。
不支持的方法返回 `405` 和 `Allow`。

### 5.1 `POST /api/analytics`

请求：

```json
{
  "page": "/blog/example",
  "visitorId": "550e8400-e29b-41d4-a716-446655440000"
}
```

成功响应：

```json
{
  "recorded": true,
  "page": "/blog/example",
  "pv": 12,
  "uv": 8
}
```

一分钟内重复访问时 `recorded` 为 `false`，PV / UV 返回当前值。

错误：

- 非对象 JSON、无效页面或 UUID：`400`
- body 过大：`413`
- 未配置 D1：`500`
- 不支持的方法：`405`

### 5.2 `GET /api/analytics?page=...`

返回指定页面当前 PV / UV。`page` 必填并执行与 POST 相同的规范化校验。

### 5.3 后台认证

`POST /api/admin/login`

- 校验 `ADMIN_PASSWORD`。
- 成功后设置 `admin_session` Cookie。
- Cookie 使用 `HttpOnly; SameSite=Lax; Path=/`。
- HTTPS 环境增加 `Secure`。
- token 为严格的 `payload.signature` 两段结构。
- payload 包含 `role`、`iat` 和 `exp`，有效期 24 小时。
- signature 使用 `ADMIN_SESSION_SECRET` 和 HMAC-SHA-256。

`POST /api/admin/logout`

- 清除 `admin_session` Cookie。

除 login / logout 外，`/api/admin/*` 全部经过认证中间件。生产环境还必须
为 `/api/admin/login` 配置独立、严格的 Cloudflare Rate Limiting 规则。

### 5.4 后台数据 API

| 端点 | 参数 | 返回 |
|---|---|---|
| `GET /api/admin/analytics/summary` | `range=today\|7d\|month\|all` | 区间 PV / UV、活跃页面和人均浏览 |
| `GET /api/admin/analytics/trends` | `range=today\|7d\|month\|all` | 时间粒度及补齐后的 PV / UV 序列 |
| `GET /api/admin/analytics/distribution` | `range=today\|7d\|month\|all`, `dimension=section\|article`, `metric=pv\|uv` | 不受 Path 影响的页面大类或博客文章占比 |
| `GET /api/admin/analytics/popular` | `range=today\|7d\|month\|all`, `limit=1..50`, `path`, `sort=pv\|uv`, `order=asc\|desc` | 独立的页面列表 |

参数必须是范围内的有限整数；非法值返回 `400`，不能把 `NaN` 传给 D1。

`popular` 的 `path` 是可选的字面量包含过滤：先 trim、转小写，最多 200
字符，只接受字母、数字、`/` 和 `-`。过滤必须在聚合排序和 `LIMIT` 前完成。
`sort` 默认 `pv`，`order` 默认 `desc`；排序字段与方向只能从服务端白名单映射
为 SQL 片段，path 始终使用绑定参数。`range` 默认 `7d`，四个数据接口共用
同一套服务端时间白名单。`distribution` 不接受 Path，使用各页面指标之和
作为分母。`section` 把 `/`、`/blog`、`/blog/*`、`/projects` 和其他路由
聚合为有限大类并全部返回；`article` 只统计 `/blog/*`，返回前 8 篇并提供
完整文章数和指标总量，客户端将剩余文章合并为“其他文章（N 篇）”。
列表 Path 和排序不会改变占比数据。

大类图例必须同时显示名称和匹配规则：`首页（/）`、
`博客列表（/blog）`、`博客（/blog/*）`、`项目（/projects）` 和
`其他（未归类）`。

趋势粒度为：今日按小时、7 天和本月按日；所有时间按照首次访问到北京时间
今天的完整展示跨度自适应，不超过 31 天按日、不超过 180 天按周、更长按月。
不能使用首次访问到最后访问的活跃跨度，否则长期没有新访问时会生成过长的
每日序列。响应必须显式返回 `granularity`，数据库日期必须通过绑定参数进入
查询。

## 6. 前端行为

`AnalyticsTracker.astro` 全站引入，但跳过 `/admin`：

1. 安全地读取或创建 `localStorage.visitor_id`。
2. 使用 `sessionStorage` 防止同一标签页一分钟内重复请求。
3. POST 成功后才确认节流状态；网络错误或非 2xx 响应会清除 pending 状态。
4. 命中节流时不再重复 POST，但会通过只读 GET 恢复刷新后页面上的 PV / UV。
5. 使用 POST 或 GET 返回的 PV / UV 更新页面中带
   `data-analytics-page-stats` 的元素。

后台页面使用 DOM API 和 `textContent` 渲染服务端数据，不把数据库内容直接
拼接到 `innerHTML`。

后台页面本身只负责组合组件。页面私有文件全部就近放在
`src/pages/admin/analytics/_components` 和 `_lib`；下划线目录不会生成路由。
公共 `src/components` 只保留 Tracker 等跨页面组件。认证、全局时间、刷新和
分区数据加载统一由 `analytics-admin.ts` 控制。

后台 Dashboard 趋势使用原生响应式 SVG：

- PV 为蓝色实线和圆点，UV 为橙色虚线和菱形点。
- 容器尺寸变化时通过 `ResizeObserver` 重算坐标。
- 数据点支持鼠标悬停和键盘聚焦，显示日期、PV 和 UV。
- 透明交互热区不显示浏览器的大型默认矩形 outline；键盘焦点改为垂直辅助线、
  tooltip 和对应数据点的小型高亮环。
- 图表提供可访问名称、数据点 `aria-label` 和屏幕阅读器摘要。
- Lucide 图标只在 Astro 构建阶段静态渲染，不增加新的客户端 hydration。
- `AnalyticsTrendChart.astro` 封装结构和主题变量，
  `analytics-trend-chart.ts` 封装 SVG DOM、tooltip、响应式监听和错误状态，
  `analytics-dashboard.ts` 只保留坐标、刻度和路径纯函数。

登录后的 Dashboard 顶部提供“今日 / 7 天 / 当月 / 所有”全局北京时间范围，
同步影响概要、趋势、占比和列表，并写入 URL `range` 查询参数。概要显示区间
PV、区间 UV、活跃页面和人均浏览。

页面占比和热门列表分别封装、分别请求。占比图有自己的“页面大类 / 博客文章”
维度和 PV / UV 指标切换，不接受 Path，也不跟随表格排序。页面大类展示全部
分类；博客文章展示前 8 篇和带剩余篇数的“其他文章”。列表默认 20 条、PV
降序；Path 输入框使用
300ms 防抖的包含过滤，Enter 立即查询，Escape 或清除按钮恢复全部数据。
页面路径始终渲染为具有默认下划线和焦点样式的站内链接。

后台顶部提供“刷新数据”按钮，不需要重新载入整个页面。手动刷新保留当前
Path 和排序条件；刷新期间继续展示已有数据，并将局部失败限制在对应区域。
保留旧数据时必须保留其已经成功加载的时间、维度和指标标签，只有新请求成功
后才能提交新标签；会话过期进入登录页时必须复位刷新按钮状态。
Path 输入框隐藏浏览器原生搜索清除控件，只保留一个带明确可访问名称的
Lucide 清除按钮。

## 7. 滥用防护

代码内防护：

- 服务器端一分钟唯一约束。
- 严格限制 page 和 visitor ID。
- 限制 JSON body 大小。
- 后台 HMAC Cookie 鉴权。

Cloudflare 外部配置：

- 对 `POST /api/analytics` 配置速率限制。
- 对 `POST /api/admin/login` 配置更严格的速率限制。
- 监控 D1 rows written、rows read 和异常页面数量。

服务端去重不能替代 Rate Limiting，因为攻击者仍可轮换 UUID。

## 8. 本地开发

前置条件：

- Node.js `>=22.12.0`
- pnpm 10
- Wrangler `4.114.0`（通过 `pnpm dlx` 固定版本运行）

完整自动验证只需要：

```bash
nvm use 22
pnpm verify
```

该命令自动创建隔离的临时 D1、执行 migration、启动 Pages Functions、验证
公开和后台 API，并在结束后清理；不需要 Cloudflare 账号或远端 database ID。

需要浏览器手动验收 Tracker 和后台页面时：

```bash
pnpm dev:analytics
```

该命令使用 `wrangler.local.example.toml` 中的合成本地 database ID，将状态
持久化到 `.wrangler/state`，默认后台密码为 `test-password`。详细操作和环境
变量覆盖方式见 [`analytics-operations.md`](./analytics-operations.md)。

生产 migration 由发布工作流在代码部署前显式执行：

```bash
pnpm dlx wrangler@4.114.0 d1 migrations apply github-blog --remote
```

## 9. 测试与验收

自动化测试至少覆盖：

- 页面和 UUID 校验。
- 非对象 JSON、超大 body 和非法数字参数。
- Unix 分钟计算。
- Cookie token 正常、过期、篡改和多余分段。
- Cookie 解析遇到非法编码时不抛出未处理异常。
- 一分钟唯一约束的 SQL 行为。
- 北京时间今日和趋势聚合。
- Path 过滤的规范化、长度、字符白名单和 LIKE 字面量转义。
- 热门页面 PV / UV 升降序以及过滤先于 `LIMIT`。
- 四种全局时间范围同时作用于概要、趋势、占比和列表。
- Path 过滤只改变列表，前后占比响应必须一致。
- 独立的大类 / 博客文章、PV / UV 占比；大类完整展示，文章前 8 篇之外
  聚合为带篇数的“其他文章”。
- SVG 全零、单峰、相同序列、大数值和响应式坐标计算。
- 环形图切片排序、百分比和剩余页面合并。

端到端验收：

- `pnpm verify` 在 Node.js 22 通过。
- 本地 D1 migration 可重复执行。
- 合法 POST 首次 `recorded=true`，一分钟内重复请求为 `false`。
- 非法 page / UUID / query 参数返回 `400`。
- 未登录后台 API 返回 `401`。
- 错误密码返回 `401`。
- 正确密码设置 HttpOnly Cookie。
- logout 清除 Cookie。
- API 能返回按全局时间筛选的 summary、自适应粒度趋势、独立占比和热门列表。
- 同一时间范围内，带 Path 和不带 Path 的列表请求不得改变占比接口结果。
- Dashboard 折线图在浅色、暗色和窄屏下可读，tooltip 可由鼠标和键盘触发。
- 热门页面时间选择、原生 SVG 环形图、图例、空状态和键盘焦点均可操作。
- Path 输入防抖、Enter、Escape、清除、错误重试和页面链接均可正常操作。
- 使用 `pnpm dev:analytics` 完成人工浏览器交互验收。
- `git diff --check` 无错误。

生产发布门禁：

- Pages 项目存在 `DB` D1 binding。
- Cloudflare Pages Git 自动部署已关闭，GitHub Actions 是唯一发布入口。
- `ADMIN_PASSWORD` 与 `ADMIN_SESSION_SECRET` 已设置为加密变量。
- PR CI 的 `pnpm verify` 已通过。
- production Environment 已审批。
- 生产 migration 在部署前成功执行。
- 部署后 smoke test 已通过。
- 两条 Rate Limiting 规则已配置。

## 10. 实施顺序

1. 数据库 migration 和可测试的共享校验函数。
2. 公开 analytics API。
3. 后台认证、logout 和中间件。
4. summary / trends / popular API。
5. 前端 Tracker、文章 PV / UV 和后台页面。
6. 单元测试与本地 D1 联调。
7. README、AGENTS 和部署说明同步。

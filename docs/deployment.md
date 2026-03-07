# Cloudflare Pages 自动部署配置指南

## 前置条件

- GitHub repo: https://github.com/Decolo/resume-web
- Cloudflare 账号

## 配置步骤

### 1. 在 Cloudflare Dashboard 创建 Pages 项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)
2. 进入 **Workers & Pages** > **Create application** > **Pages** > **Connect to Git**
3. 授权 Cloudflare 访问你的 GitHub 账号
4. 选择 `Decolo/resume-web` 仓库

### 2. 配置构建设置

在 "Set up builds and deployments" 页面填写：

- **Project name**: `resume-web` (或自定义)
- **Production branch**: `main`
- **Framework preset**: `Next.js`
- **Build command**:
  ```bash
  pnpm build && npx @cloudflare/next-on-pages
  ```
- **Build output directory**:
  ```
  .vercel/output/static
  ```
- **Root directory**: `/` (留空)

### 3. 环境变量（可选）

如果需要构建时的环境变量，在 "Environment variables" 部分添加。

当前项目不需要构建时环境变量（API keys 存在客户端 localStorage）。

### 4. 配置 D1 和 R2 绑定

部署完成后，需要绑定数据库和存储：

1. 在 Cloudflare Dashboard 创建 D1 数据库：
   - 进入 **Workers & Pages** > **D1**
   - 创建数据库，名称如 `resume-web-db`
   - 首次请求会由应用自动确保基础表结构（见 `src/lib/db/index.ts`）

2. 在 Cloudflare Dashboard 创建 R2 bucket：
   - 进入 **R2**
   - 创建 bucket，名称如 `resume-web-files`

3. 回到 Pages 项目设置：
   - **Settings** > **Functions** > **Bindings**
   - 添加 D1 binding:
     - Variable name: `DB`
     - D1 database: 选择刚创建的数据库
   - 添加 R2 binding:
     - Variable name: `R2`
     - R2 bucket: 选择刚创建的 bucket

这些 binding 名称需要与 `wrangler.toml` 中的配置一致。

### 5. 验证部署

- 每次 push 到 `main` 分支会自动触发部署
- 每个 PR 会创建预览部署
- 在 Cloudflare Dashboard 可以看到部署历史和日志

## 当前 wrangler.toml 配置

项目已有 `wrangler.toml`，确保 Cloudflare Pages 的 binding 名称与配置文件一致：

```toml
[[d1_databases]]
binding = "DB"
database_name = "resume-web-db"
database_id = "your-database-id"

[[r2_buckets]]
binding = "R2"
bucket_name = "resume-web-files"
```

## 注意事项

- 首次部署可能需要 5-10 分钟
- 部署失败时检查 Cloudflare Pages 的构建日志
- D1 和 R2 需要在 Cloudflare Dashboard 手动创建和绑定
- 生产环境的 database_id 需要在创建 D1 后更新到 wrangler.toml
- 所有非静态 API route 需要显式声明 `export const runtime = "edge"`，否则 `next-on-pages` 构建会报错

## Preview 回归建议

- 优先使用 Pages Preview URL（`*.pages.dev`）做回归，避免生产域名上的挑战验证影响自动化
- Playwright 可用独立配置覆盖 `baseURL` 到 preview 域名，并关闭本地 `webServer`

## 后续优化

可以在 GitHub Actions CI 中添加部署前的检查：
- 只有 CI 测试通过才允许部署
- 使用 Cloudflare API 触发部署而不是自动部署

但对于大多数场景，Cloudflare Pages 的自动部署已经足够。

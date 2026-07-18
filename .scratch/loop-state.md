# Loop State — LLM Aggregator

## Current State

- **Active Issue**: 无
- **Last Action**: Prisma 5 client 修复完成，API 端到端验证通过
- **Deploy**: VPS 47.242.83.10, pm2 `next dev` 模式, Nginx HTTPS 反向代理
- **Domain**: saylulu.com (Cloudflare DNS, Let's Encrypt SSL)

## 2025-07-15 Dashboard API Keys + Cookie 修复

- Cookie 在 dev 模式下取消 Secure（之前浏览器拒绝存储 → 登入即丢失）
- 首页根据登录状态显示不同内容（未登录=landing，已登录=欢迎+控制台入口）
- Dashboard 新增 API Keys 管理区域（列表+生成）

## 2025-07-14 Prisma 5 修复

- 做了: 
  1. schema.prisma 添加 `url = env("DATABASE_URL")`（Prisma 5 必需）
  2. generator 从 `prisma-client` 改为 `prisma-client-js`（Prisma 5 不支持自定义 generator）
  3. 启用 `driverAdapters` preview feature（Prisma 5 需要此特性才能使用 `adapter` 参数）
  4. `npx prisma generate` → 成功生成 Prisma Client v5.22.0
  5. pm2 restart → chat completions API 返回正常响应（deepseek-v4-flash）
- 结果: ✅ 注册、API Key 生成、Chat Completions 端到端通过
- 遗留: `next start` 生产模式仍有 Prisma 初始化问题，当前用 `next dev` 稳定运行
- 下一步: 确认平台核心功能完整可用，准备推广

## Known Issues

1. **`next start` 不可用**: Prisma 5 adapter 在 standalone 模式下初始化失败。Dev 模式稳定。
2. **VPS DNS 不解析 saylulu.com**: VPS 本地 DNS 无法解析自身域名，不影响外部用户访问（待验证）
3. **Git push from VPS 需 token**: VPS 上 git push 缺少 GitHub 认证，暂从本地推送
4. **billing.prod.ts 未部署**: 生产计费逻辑不在 git 中，VPS 每次 git pull 后需手动覆盖

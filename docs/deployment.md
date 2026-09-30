# 部署说明

目标架构无需传统后端服务器：

- GitHub Pages：静态前端 + 浏览器端 DOCX/OOXML 处理
- Cloudflare Worker：DeepSeek API Key 安全代理 + 两阶段语义结构恢复

## 1. 部署 Worker

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put DEEPSEEK_API_KEY
npm run deploy
```

记录最终 URL，例如：

```text
https://official-doc-ai-proxy.<account>.workers.dev
```

检查：

```text
GET /health
```

应返回 `{"ok":true,...}`。

## 2. 配置 GitHub Pages 前端

在 GitHub 仓库：

1. Settings → Secrets and variables → Actions → Variables
2. 新增 Repository variable：
   - Name: `VITE_AI_PROXY_URL`
   - Value: Worker URL
3. Settings → Pages → Build and deployment → Source 选择 `GitHub Actions`
4. Actions → `Deploy GitHub Pages` → Run workflow

前端最终访问地址通常为：

```text
https://neuromorphicscience-sys.github.io/officical-doc-ai/
```

如果暂时没有配置 Repository Variable，页面仍可打开，并可在右上角“AI 服务设置”中本地填写 Worker URL。

## 3. Worker Origin 白名单

`worker/wrangler.toml` 默认包含：

```text
http://localhost:5173
https://neuromorphicscience-sys.github.io
```

如果未来使用自定义域名，需要同步修改 `ALLOWED_ORIGINS` 并重新部署 Worker。

## 4. 生产演示建议

- 在 Cloudflare 对 `/v1/structure` 增加 Rate Limiting。
- 演示前访问一次 `/health` 检查 Worker 可用性。
- 不要把 DeepSeek Key 写进 GitHub Secret 后再注入 Vite；任何 `VITE_*` 变量最终都会进入浏览器 bundle，因此不能用于 API Key。

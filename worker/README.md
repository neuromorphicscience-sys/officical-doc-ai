# Cloudflare Worker — DeepSeek 安全代理

Worker 只承担两件事：

1. 隐藏 `DEEPSEEK_API_KEY`，避免 Key 出现在 GitHub Pages 前端。
2. 对浏览器提取出的段落文本做两阶段语义结构恢复：宏观公文结构 → 正文层级结构。

原始 DOCX 二进制文件不会上传给 Worker。

## 部署

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put DEEPSEEK_API_KEY
npm run deploy
```

可按需设置模型：

```toml
[vars]
DEEPSEEK_MODEL = "deepseek-chat"
```

把 `ALLOWED_ORIGINS` 改成真实 GitHub Pages Origin。仓库路径不是 Origin 的一部分，例如：

```text
https://neuromorphicscience-sys.github.io
```

本地测试时默认允许 `http://localhost:5173`。

部署完成后，将 Worker URL 写入 GitHub Repository Variable：

```text
VITE_AI_PROXY_URL=https://official-doc-ai-proxy.<your-subdomain>.workers.dev
```

然后重新运行 Pages workflow。

## 安全建议

- 不要把 DeepSeek Key 写入 `wrangler.toml`、`.env.example` 或前端代码。
- 生产演示前在 Cloudflare 控制台给 `/v1/structure` 配置 Rate Limiting。
- Worker 已限制 Origin、段落数、文本总长度，并设置 `Cache-Control: no-store`。

# 办公文档智能整理工具：项目状态

更新时间：2026-09-30

## 架构

- React、TypeScript、Vite 前端部署目标为 GitHub Pages，Vite 资源路径固定为仓库子路径 `/officical-doc-ai/`。
- 浏览器使用 JSZip 与 OOXML XML 处理 DOCX；原始 DOCX 不发送到业务服务。
- 真实语义识别通过 Cloudflare Worker 调用 DeepSeek，按“宏观角色识别 → 正文层级识别”两阶段返回受校验的 JSON。
- 无 Worker 时使用清楚标记的本地规则演示模式，不伪装成 DeepSeek 调用。格式标准由本地规则和 OOXML formatter 决定。

## 已完成

- 补全 `.docx` 上传、段落提取、类型/角色/标题层级识别、用户手动修正、格式校验和格式化下载流程；明确不支持旧版 `.doc`。
- 增加页面尺寸、页边距、标题/正文/附件/署名/日期等格式映射；缺失编号只给建议，不自动改写正文。
- 加入段落完整性、SHA-256 和字符数验证；段落或文字在分析后发生变化时阻止格式化。
- 尽可能在原始 OOXML 包上做最小修改，并用 fixture 验证表格、图片和自定义页脚保留；单双页页码克隆会去除旧页码域以避免重复，函首页留空。
- 增加 Worker 的 CORS 白名单、请求大小与字段校验、限时 DeepSeek 请求、严格 JSON 校验和不记录正文的错误路径；仓库忽略 Worker 本地密钥文件。
- 补充锁文件、CI 和 Pages workflow、架构/部署说明；秘密扫描没有发现未忽略文件中的 DeepSeek Key 或 `.env` / `.dev.vars`。

## 本地验证

在 `D:\Research\office\official-doc-ai` 执行：

| 验证 | 结果 |
| --- | --- |
| 根目录 `npm ci --no-audit --no-fund` | 通过，干净安装 175 个包 |
| `npm run typecheck` | 通过 |
| `npm test` | 通过，5 个测试文件、31 项测试 |
| `npm run build` | 通过；产物引用 `/officical-doc-ai/assets/...` |
| `worker/npm ci --no-audit --no-fund` | 通过，干净安装 92 个包 |
| `worker/npm run typecheck` | 通过 |
| `git diff --check` | 通过 |

## GitHub 与部署

- 仓库：[neuromorphicscience-sys/officical-doc-ai](https://github.com/neuromorphicscience-sys/officical-doc-ai)，保留仓库现有拼写。
- 通过 GitHub 插件以普通快进方式推送到远端，没有强推或改写远端历史。Worker 与 Pages endpoint 回退配置提交为 `5aca805c824e5bb21f01125aa5a1c037a31ec251`；CI run [`36705926747`](https://github.com/neuromorphicscience-sys/officical-doc-ai/actions/runs/36705926747) 与 Pages run [`36705926454`](https://github.com/neuromorphicscience-sys/officical-doc-ai/actions/runs/36705926454) 均成功。
- GitHub Pages 已部署：[https://neuromorphicscience-sys.github.io/officical-doc-ai/](https://neuromorphicscience-sys.github.io/officical-doc-ai/)。Pages 构建优先读取 Actions Repository variable `VITE_AI_ENDPOINT`，其次读 `VITE_AI_PROXY_URL`，未设置时回退到下方 Worker URL；因此插件未提供变量写入接口时，生产站点仍可直接连接 Worker。
- Cloudflare Worker 已部署：[https://official-doc-ai-proxy.neuromorphicscience.workers.dev](https://official-doc-ai-proxy.neuromorphicscience.workers.dev)。`/health` 返回 HTTP 200。`DEEPSEEK_API_KEY` 已作为 Cloudflare Worker Secret 配置；密钥文件留在仓库外，精确值扫描未在仓库文件中发现该密钥。
- Worker 的 `AI_RATE_LIMITER` 已配置为每个客户端 IP、每个 Cloudflare 位置每 60 秒 10 次。实现与部署配置均通过 CI；但突发行为测试没有观察到 429，故不应把它视为严格的全局限额。
- Playwright 在生产 Pages 上使用合成 DOCX 完成了 DeepSeek 结构识别、规范化、下载和重新载入。识别结果来自 `deepseek`；输出 226 个字符与输入一致，SHA-256 一致，新增/删除/修改字符均为 0，共执行 14 项格式操作。

## 未完成事项与下一步

1. 在真实 Word 与目标办公环境中验收排版；目前测试覆盖 OOXML 结构，不等同于 Microsoft Word 的分页/视觉回归测试。
2. 如需在 GitHub 仓库集中管理 endpoint，可添加 Actions Repository variable `VITE_AI_ENDPOINT`，值为上方 Worker URL；当前 Pages workflow 已有同值回退配置。

## 技术风险与限制

- 是否添加页码依据本地估算页数，不是 Word 的真实分页结果；不同字体、Word 版本、打印机和内容布局可能改变页数。
- 规范字体名称写入 DOCX，但字体文件未打包；缺少对应字体时办公软件可能替换字体。没有提供的专属模板规则不会被臆造。
- OOXML 表格与图片通过 fixture 验证；复杂文本框、嵌入对象、修订、脚注/尾注等复杂文档元素仍需用真实样本验收。
- 未配置 Worker 时 heuristic 只用于演示，不等于真实语义分析；低置信度识别需要用户检查并修正。
- Cloudflare Rate Limiting 是按边缘位置工作的宽松限制，突发请求可能超过配置值；如需严格配额，应在业务层加入稳定用户身份和配额存储。

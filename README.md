# 办公文档智能整理工具

用 AI 理解文档结构，用确定性规则规范排版，在浏览器中保护原文并生成新的 DOCX。

[在线体验](https://neuromorphicscience-sys.github.io/officical-doc-ai/) · [提交说明](submission/SUBMISSION.md) · [验收报告](submission/FINAL_ACCEPTANCE_REPORT.md)

## 演示视频

最终提交包的 `submission/office-doc-ai-demo.mp4` 为带中文字幕的静音演示视频；视频不纳入 Git 历史。字幕与实际分镜见 `submission/office-doc-ai-demo.srt` 和 `submission/VIDEO_SCRIPT.md`。

## 核心能力

- 即使全文使用同一字体字号、没有 Word 标题样式，也可通过全文语义恢复结构。
- 自动判断文种，识别标题、主送机关、四级标题、正文、附件、署名和日期；人工类型选择仅为语义提示。
- AI 只判断段落角色；规则引擎决定 A4、页边距、字体、字号、行距、缩进和页码。
- 逐段核对字符与 SHA-256。默认不增加编号，不改写正文。低置信度、角色不明、显式编号冲突均可见并支持人工校正。
- 支持拖拽、键盘选择、移除或替换文件、真实处理阶段、下载与错误重试。

## 技术架构与处理流程

React + TypeScript + Vite → GitHub Pages；Cloudflare Worker → DeepSeek 两阶段 JSON 结构识别。

```text
DOCX → 浏览器解析 → 必要文本与弱格式特征 → Worker → DeepSeek
     ← Document AST ← 结构校验 ← 确定性 OOXML 格式化
     → 字符与 SHA-256 校验 → 本地生成并下载 DOCX
```

架构说明见 [docs/architecture.md](docs/architecture.md)。Worker 健康检查：[服务状态](https://official-doc-ai-proxy.neuromorphicscience.workers.dev/health)。连接标记仅表示代理健康可达，实际 AI 结果以请求成功且 `source=deepseek` 为准。离线或地址无效时明确标注本地规则演示模式。

## 隐私设计

文档解析、格式修改和重新生成均在当前浏览器完成；AI 服务仅接收结构识别所需的文本内容及弱格式特征。原始 DOCX 二进制不上传业务服务器。并非完全离线：必要文本会发送给 DeepSeek。密钥只配置在 Cloudflare Secret，前端不存储密钥；Worker 不记录正文，响应使用 `no-store`。

## 支持范围与规则依据

仅支持 `.docx`，最大 50 MB；最多 1,200 段、120,000 字符，每段最多 8,000 字符，Worker 请求体上限 2 MB。复杂长文档可能触及 AI 服务超时，建议拆分。支持通知、请示、报告、函、会议纪要、工作总结、规章制度和其他。

现有《公文格式要求》的映射见 [docs/rule-mapping.md](docs/rule-mapping.md)，包括 A4、上37/下35/左右27 mm、28.8磅行距、二号标题和三号正文。没有添加材料中未给出的学校或分文种专属模板。

## 测试

```bash
npm ci
npm run typecheck
npm test
npm run build
cd worker && npm ci && npm run typecheck
```

自动测试包含 10 个对抗 DOCX 的包结构、图片、表格、页眉页脚、内容完整性与错误恢复。合成样本见 [demo/README.md](demo/README.md)。

生产浏览器验收（需要 Chrome，调用真实 DeepSeek）：

```bash
node scripts/release/production-e2e.cjs
```

检查生产页面、真实 AI、下载、重载、二次处理、四种视口、axe 无障碍、错误恢复。测试中的故障注入单独记录，不计作真实 AI 成功。Windows 安装 Word 时可运行 `scripts/release/word-check.ps1`，检查原始输出的打开、保存、关闭；`-ExportPdf` 可尝试导出 PDF；本机 Office 导出持续等待，故最终报告只认定打开/保存通过，视觉预览采用明确标注的 LibreOffice 补充渲染。

## 本地开发

```bash
npm ci
npm run dev
```

将 `.env.example` 复制到 `.env` 并配置 Worker URL，或在页面“AI 服务”中设置代理地址。不要把 API Key 写入任何 `VITE_*` 环境变量。

## Worker 部署

```bash
cd worker
npm ci
npx wrangler login
npx wrangler secret put DEEPSEEK_API_KEY
npm run deploy
```

部署前检查 `wrangler.toml` 的 CORS 精确来源白名单和限流绑定。Pages workflow 优先使用 Repository variable `VITE_AI_ENDPOINT`，否则使用已部署生产 Worker。详见 [部署说明](docs/deployment.md) 与 [Worker README](worker/README.md)。

## 已知限制

- 页数由浏览器估算，最终分页以 Word 为准；函首页不显示页码。规范字体由办公软件按本机安装情况解析，本项目不分发字体。
- 文本框、SmartArt、OLE、修订、脚注/尾注等复杂元素不承诺内部智能重排；印章位置与标题梯形排版需要人工检查。
- 模型结果存在不确定性；低置信度须核对。类型提示不等于独立模板，缺失编号不会自动写入。
- Cloudflare 限流为每 IP、每边缘位置每分钟10次，属于宽松防滥用措施，并非全局严格配额。

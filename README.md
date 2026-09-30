# 办公文档智能整理工具 / Official DOCX AI Formatter

面向格式混乱甚至“全文只有一个样式”的原始 DOCX：先利用 DeepSeek 从全文语义恢复公文逻辑结构，再依据命题方提供的公文格式规范，用确定性的 OOXML 规则完成 Word 排版。

> 核心设计：**AI 负责理解，规则负责排版。** 大模型不决定字体、字号、页边距等规范参数。

## 已实现

- 仅支持 `.docx`，避免 `.doc` 二进制转换依赖
- 浏览器本地 JSZip + OOXML 解析，原始 DOCX 不上传业务服务器
- DeepSeek 两阶段结构恢复
  - 宏观结构：公文类型、标题、主送机关、附件、落款、日期、附注
  - 正文结构：body / 1–4 级 heading
- 原始格式只作为弱证据；可处理全文同字号、同字体、无编号的输入
- 本地显式序号规则与 AI 结果冲突检测
- 公文规则确定性映射
  - A4 与页边距
  - 标题/正文/1–4 级标题字体字号
  - 28.8 磅行距、正文首行缩进 2 字符
  - 数字/拉丁字符 Times New Roman
  - 附件、落款、日期、附注
  - 奇偶页 `— 1 —` 页码；“函”首页不加页码
- 内容零侵入：默认不增删/改写正文字符
- 格式化前后正文 SHA-256 完整性校验，不一致则阻止输出
- GitHub Pages 自动部署 workflow
- Cloudflare Worker 隐藏 DeepSeek API Key
- 完整响应式产品 UI：上传工作区、实时处理链路、语义分析仪表盘、结构映射表、冲突校验、规范能力展示、隐私架构与结果下载

## 快速启动

```bash
npm install
npm run dev
```

前端默认从 `VITE_AI_PROXY_URL` 读取 Worker 地址；也可以直接在页面右上角“AI 服务设置”中填写。

## Worker

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put DEEPSEEK_API_KEY
npm run deploy
```

详见 [`docs/deployment.md`](docs/deployment.md)。

## 架构

```text
GitHub Pages / Browser
  DOCX
   ↓ JSZip + OOXML
  Paragraph Extractor
   ├── explicit rule features
   └── text → Cloudflare Worker → DeepSeek
                              ↓
                         Document AST
                              ↓
                    deterministic rules
                              ↓
                      OOXML Formatter
                              ↓
                    content hash check
                              ↓
                    normalized DOCX
```

详见 [`docs/architecture.md`](docs/architecture.md) 和 [`docs/rule-mapping.md`](docs/rule-mapping.md)。

## 安全

- `DEEPSEEK_API_KEY` 只放在 Cloudflare Worker Secret。
- **不要**把 API Key 放进 `VITE_*` 环境变量；Vite 会把这类变量编译到公开浏览器代码中。
- Worker 限制 Origin、最大段落数和最大文本量；建议生产演示再配置 Cloudflare Rate Limiting。
- Worker 返回 `Cache-Control: no-store`。

## 项目边界

V1 不自动改写正文内容。缺失的“一、”“（一）”等标题序号只作为建议展示，不直接写回；复杂文本框、SmartArt、OLE 对象尽量保留但不智能重排。浏览器无法获得 Word 的真实分页结果，因此页数采用规范行宽/行数启发式估算，最终分页以 Microsoft Word/WPS 实际渲染为准。

## License

MIT

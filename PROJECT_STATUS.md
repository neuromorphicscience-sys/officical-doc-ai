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
- 本轮工程代码提交：`fd04d30a2866fcccf7ac581f6286cd27f7350ea7`。该提交尚未推送；HTTPS 推送因当前环境没有 GitHub 登录凭据而被拒绝。远端 `main` 仍为 `9ee2e84`。
- 远端最近一次 CI（`9ee2e84`）成功；最近一次 Pages workflow 失败于 `configure-pages`，因为仓库尚未启用 Pages，`GITHUB_TOKEN` 无权创建 Pages site。远端 Pages API 返回 404，因此当前不能确认站点已发布。
- 预期站点 URL：[https://neuromorphicscience-sys.github.io/officical-doc-ai/](https://neuromorphicscience-sys.github.io/officical-doc-ai/)。需先推送本地提交，再到仓库 **Settings → Pages → Build and deployment → Source** 选择 **GitHub Actions**；之后重新运行 `Deploy GitHub Pages`。
- Cloudflare Worker 尚未部署；未配置 DeepSeek API Key，也未配置 Pages 的 `VITE_AI_ENDPOINT`。前端在这之前以明确标识的本地演示模式运行。

## 未完成事项与下一步

1. 在有 GitHub 凭据的环境中推送本地 `main`，让 CI 和 Pages workflow 对本次提交运行。
2. 在仓库设置中将 Pages Source 设为 **GitHub Actions**，然后检查部署运行和站点 URL。
3. 在 Cloudflare 登录后部署 Worker，通过 Wrangler Secret 配置 `DEEPSEEK_API_KEY`；再将 Worker URL 配为 GitHub Actions Repository variable `VITE_AI_ENDPOINT` 并重新部署 Pages。
4. 在真实 Word 与目标办公环境中验收排版；目前测试覆盖 OOXML 结构，不等同于 Microsoft Word 的分页/视觉回归测试。

## 技术风险与限制

- 是否添加页码依据本地估算页数，不是 Word 的真实分页结果；不同字体、Word 版本、打印机和内容布局可能改变页数。
- 规范字体名称写入 DOCX，但字体文件未打包；缺少对应字体时办公软件可能替换字体。没有提供的专属模板规则不会被臆造。
- OOXML 表格与图片通过 fixture 验证；复杂文本框、嵌入对象、修订、脚注/尾注等复杂文档元素仍需用真实样本验收。
- 未配置 Worker 时 heuristic 只用于演示，不等于真实语义分析；低置信度识别需要用户检查并修正。
- Pages 与 Worker 均未通过本次提交完成线上部署，线上可用性仍待凭据和仓库设置完成后确认。

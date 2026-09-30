# 办公文档智能整理工具

面向高校与政务办公，利用 AI 恢复文档逻辑结构，并以确定性规则完成格式规范化，保护正文文字完整。

- 在线网站：[打开生产版本](https://neuromorphicscience-sys.github.io/officical-doc-ai/)
- GitHub：[neuromorphicscience-sys/officical-doc-ai](https://github.com/neuromorphicscience-sys/officical-doc-ai)
- 正式演示视频：本目录 `office-doc-ai-demo.mp4`，静音、中文字幕已烧录；同时附 SRT。
- 主演示文件：`../demo/乱格式办公通知示例.docx`，全部内容为虚构示例。
- 验收详情：[FINAL_ACCEPTANCE_REPORT.md](FINAL_ACCEPTANCE_REPORT.md)。

## 可安装 Skill

下载 [official-docx-formatter-skill.zip](official-docx-formatter-skill.zip)，上传到支持 Skill ZIP 和 Python 执行的 Agent 宿主；也可解压，将唯一顶层目录 `official-docx-formatter/` 安装到宿主的 Skills 目录。需要 Python 3.9+，无需 pip 安装、API Key、GUI 或当前 Worker。

上传 DOCX 后输入“按照学校公文规范整理这个文件”或“把它整理成通知格式”。宿主通读全部段落、生成 Document AST，再调用包内 inspect → format → validate → reopen 脚本，返回新的 DOCX。置信度低或结构有歧义时先复核，默认不改写正文。

**Web 版使用 DeepSeek 完成语义理解；Skill 版由宿主 Agent 完成同样的结构判断，二者共用确定性公文规则与 DOCX 格式化逻辑。** Skill 为相同规则和 OOXML 操作的独立 Python 实现，共用核心 AST 协议；以 9 份文档的相同 AST 对照验证格式结果。没有把模型推理放进固定正则，也不让模型自行选择字体/字号。

ZIP 内仅 10 个必要文件、一个 SKILL.md；不包含测试文档、字体、凭据、依赖目录或临时文件。解压后的独立执行已验证，未代替用户上传到外部 Skill 库。完整性结果见 [skill-validation.json](evidence/skill-validation.json)，实际生成示例见 [Skill 规范版 DOCX](skill-demo/乱格式办公通知示例_规范版.docx)。

## 核心创新

1. **语义结构恢复**：即使全文完全相同格式、没有正确 Word 标题样式，也可结合全文语义判断标题层级、正文、附件与落款。
2. **AI 与规则解耦**：AI 判断“是什么”；规则引擎决定“应该怎么排版”，避免让大模型自由生成格式参数。
3. **内容保护**：默认不改写正文，不自动添加缺失编号。逐段文字、字符数量与 SHA-256 校验不一致时阻止输出。
4. **本地 DOCX 处理**：原始文件在浏览器中解析和重新生成；AI 仅接收结构识别所需的文本与弱格式特征。

## 建议评委演示步骤

1. 播放 MP4，快速了解完整流程与边界。
2. 打开在线网站，确认“AI 语义识别已连接”。
3. 选择主样本，保持“自动识别”，点击“AI 智能规范化”。
4. 检查文档理解、风险提示、实际格式处理与完整性区域：字符一致，新增/删除/修改均为0。
5. 下载规范 DOCX，在 Word 中打开；可与提交包中的真实规范化输出对照。
6. 若需补充验证，使用 `demo/cases/03-unnumbered.docx` 查看无编号标题语义识别；使用 CASE 10 查看损坏文件恢复提示。

## 使用边界

仅支持 DOCX。Web 版必要文本会发送至 DeepSeek；Skill 的确定性脚本离线运行，宿主模型如何处理文本取决于所用平台。置信度低或显式编号冲突时需人工核对。规范字体依赖使用环境，实际分页以 Word 为准；复杂文本框、SmartArt、OLE、修订等不承诺内部智能重排。视频的 DOCX 页面为 LibreOffice 补充渲染，不宣称等同 Word 分页。

# 演示与验收样本

所有文字、单位名称和图片均为合成测试内容，无真实业务或个人信息。

主样本：**乱格式办公通知示例.docx**。所有段落均使用 Normal 样式，刻意混用字号、颜色、对齐与间距；包含标题、主送机关、三处一级标题、四处二级标题、正文、附件说明、落款及日期。

在[生产网站](https://neuromorphicscience-sys.github.io/officical-doc-ai/)选择该文件，公文类型保持“自动识别”，点击“AI 智能规范化”。检查结构、风险提示和完整性报告，再下载规范文档。若有低置信度或编号冲突，按页面提示人工确认后应用格式。

| CASE | 文件 | 验证目标 |
|---|---|---|
| 01 | cases/01-uniform.docx | 完全同字体同字号、无 Heading，真实 AI 恢复通知结构 |
| 02 | cases/02-numbering.docx | 四级显式编号保留，错误格式规范化 |
| 03 | cases/03-unnumbered.docx | 真实 AI 识别无编号标题；只给编号建议、不新增文字 |
| 04 | cases/04-attachments.docx | 真实 AI 识别附件、署名、日期、附注 |
| 05 | cases/05-long.docx | 多页、页码、页眉页脚保留 |
| 06 | cases/06-letter.docx | 函首页不显示页码 |
| 07 | cases/07-table.docx | 表格及单元格文字保留 |
| 08 | cases/08-image.docx | 图片字节与关系保留 |
| 09 | cases/09-ambiguous.docx | 歧义短标题，低置信度和待确认角色提示 |
| 10 | cases/10-corrupt.docx | 故意损坏，预期拒绝并给出恢复提示 |

确定性格式测试与真实 AI 测试分开记录。CASE 09 的低置信度由受控契约测试验证，不宣称大模型每次都产生固定分值。生成脚本：`python scripts/release/create-fixtures.py`；需要 python-docx、Pillow。

## 已验收的真实输出

`乱格式办公通知示例_规范版.docx` 是正式视频中从生产网站实际下载的文件，未经 Word 另存修改。与主样本正文逐字一致，并通过独立 OOXML 和 Word 打开/保存检查。可将两份文档并排打开作现场对照。视觉分页及字体以目标 Word 环境为准。

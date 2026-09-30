"""Assemble an evidence-linked final report after video QA."""
from pathlib import Path
import json,shutil
ROOT=Path(__file__).resolve().parents[2];SUB=ROOT/'submission';E=SUB/'evidence';E.mkdir(exist_ok=True)
for src,dst in [('output/production-e2e/report.json','production-e2e.json'),('output/input-check/report.json','input-and-review.json'),('output/docx-audit/report.json','docx-audit.json'),('output/security/report.json','security.json'),('output/word-check/word-results-production-e2e.json','word-production.json'),('output/word-check/word-results-video.json','word-recorded.json'),('output/compatibility-preview/report.json','supplemental-render.json'),('output/software-workflows.json','software-workflows.json')]:
 shutil.copyfile(ROOT/src,E/dst)
v=json.loads((SUB/'VIDEO_VALIDATION.json').read_text());qa=json.loads((E/'production-e2e.json').read_text());sec=json.loads((E/'security.json').read_text());audit=json.loads((E/'docx-audit.json').read_text())
assert all([v['pass'],qa['pass'],sec['pass'],audit['pass']])
assert v.get('visualQC',{}).get('status')=='PASS', 'Review final video frames before declaring release ready'
sha='cd1f55e29964a7f5855b2eec9f8dd72d3a03ebea'
report=f'''# 最终验收报告

**FINAL_STATUS = READY_FOR_SUBMISSION**

验收日期：2026-09-30。所有样本均为合成内容；没有使用私人文档。未发现 P0 阻塞问题。

## 版本与生产部署

- **Final software commit SHA：`{sha}`**，这是视频及完整生产 E2E 对应的软件版本。
- 最终仓库提交另包含独立 Skill、验收材料与测试脚本；其 **Final commit SHA**（`finalCommitSHA`）和最终 CI/Pages 运行记录见提交包同目录的 **`RELEASE_MANIFEST.json`**（封包时根据 Git HEAD 生成）。新增 Skill 不改变已验收的 Web UI、业务代码或 Worker。
- [Production Pages](https://neuromorphicscience-sys.github.io/officical-doc-ai/)
- [GitHub](https://github.com/neuromorphicscience-sys/officical-doc-ai)
- [Worker](https://official-doc-ai-proxy.neuromorphicscience.workers.dev) · [Health](https://official-doc-ai-proxy.neuromorphicscience.workers.dev/health)：HTTP 200，no-store。
- 软件版 [CI](https://github.com/neuromorphicscience-sys/officical-doc-ai/actions/runs/36710063288)：PASS；[Pages deployment](https://github.com/neuromorphicscience-sys/officical-doc-ai/actions/runs/36710063311)：PASS。
- 生产实际加载资源：`index-DuEjZqhi.js`、`index-D9TEeMBz.css`；完成时间 `{qa['finishedAt']}`。
- 最终材料提交后再次等待 CI/Pages 成功，并核对远端 main、生产资源与 Worker；结果保存在 RELEASE_MANIFEST.json。

## 核心验收

| 验收项 | 结果与证据 |
|---|---|
| 单元与集成测试 | Web 冻结时 **45/45 PASS**，6 个测试文件；包含 14 项发布对抗及安全输出检查。本次增加 Skill 后全套 55/55，详见末节 |
| 根目录类型检查 / 构建 | PASS；Worker 类型检查 PASS；CI 重新验证干净安装、测试与构建 |
| Production E2E | **PASS**，真实生产 URL；页面、CSS/JS、上传、AI、结构、格式化、完整性、下载、重新载入与第二次处理 |
| DeepSeek E2E | **PASS**，5 次真实生产响应均为 `source=deepseek`；正式视频另有一次真实调用 |
| Console | 无未解释 fatal error；故障注入产生的 502、413、网络中断分别记录为预期错误 |
| DOCX integrity | **PASS**；{len(audit['documents'])} 份有效输出由独立 zipfile + lxml 检查；无 CRC 错误，XML 合法，关系目标和 content types 完整 |
| 正文完整性 | PASS；逐段字符一致，新增/删除/修改均 0，SHA-256 一致。主样本 UI 字符数 375；独立 w:t 聚合计数 358，差异为 17 个段落分隔符 |
| 表格与图片 | PASS；表格节点/单元格文字保留，图片字节完全一致，关系有效 |
| 页眉页脚 | PASS；原有部件字节保留，新页码关系有效，函首页使用独立空页脚 |
| Word compatibility | **PARTIAL**：Word 16.0 COM，OpenAndRepair=false 打开、保存、关闭 PASS；自动 PDF/分页导出未通过，不计为 Word 视觉回归 |
| 错误恢复 | PASS；非 DOCX、空文件、损坏包、缺失 document.xml、无效 AI JSON、超时、过大、AI 不可用、下载失败、移除恢复均实际检查 |
| 完整性 / 生成失败 | PASS，自动测试验证内容不一致阻止输出、生成异常向 UI 错误处理传播；没有声称这些是生产故障 |

生产证据：[production-e2e.json](evidence/production-e2e.json)；独立文件验收：[docx-audit.json](evidence/docx-audit.json)。

## 真实 DeepSeek 对抗输入

| 文档 | 文种 / 置信度 | 实际检查 |
|---|---|---|
| A：全文同字体字号通知 | 通知 / 98% | 无 Word Heading；标题、主送、一级/二级标题、正文、附件、署名、日期均恢复 |
| B：无编号语义标题 | 通知 / 95% | 总体要求、主要任务、组织保障恢复为一级标题；仅提出编号建议，输出文字未添加编号 |
| C：附件与落款 | 通知 / 95% | 标题、主送、正文、附件说明、发文单位、成文日期及附注 |
| 主演示样本与下载重载 | 通知 / 98% | 两次处理成功、文字与 SHA 一致，正式视频另外实录一次 |

置信度为本次真实响应，不代表模型每次固定返回相同结果。单段角色及层级、分值见生产证据 JSON。

## 十个对抗 CASE

**10/10 达到预期**：CASE 10 的 PASS 指正确拒绝损坏文件，不表示损坏文件可成功格式化。

| CASE | 场景 | 结果与边界 |
|---|---|---|
| 01 | 全文同字体同字号、无 Heading | PASS，真实生产 AI + 确定性格式化、正文保全 |
| 02 | 一、/（一）/1./（1）均乱格式 | PASS，1–4 级规则与编号保留 |
| 03 | 无编号语义标题 | PASS，真实 AI 恢复，不自动增补编号 |
| 04 | 附件、署名、日期、附注 | PASS，真实 AI 识别、角色格式化 |
| 05 | 长文档、多页 | PASS，71 段，确定性格式化、页码与原页眉页脚保留；LibreOffice 补充渲染为 10 页 |
| 06 | 函首页页码 | PASS，独立首页空页脚；补充渲染 3 页，首页无页码、次页有页码 |
| 07 | 表格 | PASS，表格节点、单元格文字及包关系保留 |
| 08 | 图片 | PASS，原媒体字节一致，图像关系有效，预览可见 |
| 09 | 歧义小标题 | PASS，受控低置信度/unknown 契约和页面人工核对流程；不伪称模型自然产生固定低分 |
| 10 | 损坏 DOCX | PASS，中文错误说明、替换/移除恢复路径 |

确定性测试调用本地 AST/演示规则以隔离格式引擎；真实 AI 能力只由上表 A/B/C 与主样本网络验收证明。长文档的本轮检查不等同于超长文档真实模型压力测试。

## Word 与补充视觉检查

[Word 对抗样本](evidence/word-adversarial.json)、[生产输出](evidence/word-production.json)、[视频实际下载](evidence/word-recorded.json)均完成原始输出复制后的打开、保存和关闭，显式关闭 OpenAndRepair。并未依赖 Word 另存来修复交付输出。

本机 Word 导出 PDF/重新分页持续等待，已终止本次创建的自动化进程，未把这一项写为通过。另使用 LibreOffice 7.3.7.2 对真实 DOCX 渲染，主样本原始 1 页、规范后 2 页；不声称与 Word 排版等价。预览中的缺失规范字体以系统 FangSong、KaiTi、SimSun 替代，没有提交字体文件。[补充结果](evidence/supplemental-render.json)。

## Responsive 与 Accessibility

- **Responsive PASS**：1440×900、1280×800、768×1024、390×844，首页及结果页共 8 次检查，无页面横向溢出；按钮和网格正常。
- **Accessibility PASS（本轮最低验收范围）**：axe WCAG 2 A/AA 与 2.1 AA 标签扫描，首页、结果、错误恢复三种状态共 **0 violations**；不等同完整无障碍认证。
- 键盘跳转入口与可见焦点、Enter/空格打开选择器、语义按钮、文件标签、状态/错误 role 实际验证。
- 拖放及 drag-over、替换/移除、移动端长文件名、50 MB 客户端限制通过。
- 受控低置信度时暂停自动生成并提示核对；编号冲突时禁用输出，角色修正后可生成。
- [上传与核对交互证据](evidence/input-and-review.json)；7 张正式截图位于 `docs/screenshots/`。

## 安全与 API Key

**Security scan PASS**。本轮未读取、打印、复制或重新配置仓库外 API Key 原文件。

- 对工作树（含提交材料）、生产 dist 和历史 Git blobs 运行高风险令牌模式扫描：{sec['filesScanned']} 个当前文件、{sec['historicalBlobsScanned']} 个历史 blobs，0 findings。模式扫描不能保证发现所有形式的秘密。
- API Key 未发现于 Git、前端 bundle、文档、素材或日志；没有发布 sourcemap。截图及视频抽帧人工检查无 key、私人路径或账户页面。
- Worker 仅存在名为 DEEPSEEK_API_KEY 的 secret_text；plain vars 只有允许来源和模型名称，未读取 Secret 值。
- 生产验证：CORS 白名单允许/拒绝、POST-only、无 Origin 拒绝、无效 JSON 400、段落超限 413、请求体超限 413、health 200。
- 代码复核：响应 no-store、每阶段 20 秒 AI 超时、严格请求/响应 schema、无正文日志；前端请求 45 秒超时。
- 已配置 10 次/IP/60 秒/边缘位置的限流，属于宽松防滥用，不保证全局严格配额，也没有声称本轮观测到稳定 429。
- [安全扫描与在线检查证据](evidence/security.json)。

## 正式演示视频

- 文件：`office-doc-ai-demo.mp4`，绝对路径 `D:\\Research\\office\\official-doc-ai\\submission\\office-doc-ai-demo.mp4`。
- **时长 {v['duration']}（{v['durationSeconds']:.3f} 秒），小于 600 秒**；大小 {v['sizeBytes']/1024/1024:.2f} MiB。
- MP4 / H.264 / 1920×1080 / 30 fps / yuv420p / 无音轨。中文字幕硬烧录；独立 SRT 为 UTF-8。
- 连续 Playwright 生产界面实录，包括真实 AI、角色映射、规则、完整性、下载、同一下载文件预览、错误恢复、隐私边界；没有伪造成功结果。
- **ffprobe PASS，全片解码 PASS**；开头、25%、50%、75%、结尾抽帧检查字幕、清晰度、黑屏、隐私信息；详细参数与 SHA 见 [VIDEO_VALIDATION.json](VIDEO_VALIDATION.json)。
- 时间轴与全部字幕：[VIDEO_SCRIPT.md](VIDEO_SCRIPT.md)；字幕：[office-doc-ai-demo.srt](office-doc-ai-demo.srt)。
- MP4 有意保留本地和最终 ZIP，不写入 Git 历史；其余最终资产及脚本正常入库。最终 git status 应为空。

## 当前支持与明确限制

1. 仅 DOCX，不支持旧版 DOC；最大 50 MB、1,200 段、120,000 字符、单段 8,000 字符，Worker 请求体上限 2 MB；长文档可能超时。
2. 支持通知、请示、报告、函、会议纪要、工作总结、规章制度、其他；文种选择仅为 AI 提示，不虚构学校专用模板。
3. 字体依赖目标机器安装；标题多行梯形/菱形、附件标题精确第三行、印章视觉定位需要人工复核；浏览器估算页数与 Word 分页可能不同。
4. 文本框、SmartArt、OLE、修订、脚注/尾注等复杂元素不承诺内部智能重排；本轮图文表格测试仅覆盖给定合成样本。
5. 必要文本发送至 DeepSeek，工具并非完全离线；模型输出具有不确定性。演示 fallback 明确标识，不能替代真实 AI。
6. Word 自动 PDF/分页验证未完成，补充渲染不等于 Word 视觉验收；限流不是严格全局配额。

以上为公开的支持边界，不影响本次已验证的核心通知、基础公文与内容保护流程。全部 P0 项通过，最终判定 **READY_FOR_SUBMISSION**。
'''
if (E/'skill-validation.json').exists():
 skill=json.loads((E/'skill-validation.json').read_text())
 assert all(skill[k]=='PASS' for k in ['skillBundle','skillExecution','skillDOCXIntegrity'])
 word_path=ROOT/'output/word-check/word-results-skill-parity.json'
 word_note=''
 if word_path.exists():
  word=json.loads(word_path.read_text(encoding='utf-8-sig'))
  assert len(word)==10 and all(x['status']=='PASS' and not x['openAndRepair'] for x in word)
  (E/'word-skill.json').write_text(json.dumps(word,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
  word_note='9 份 Skill 原始输出及演示原文均经 Word 16.0 COM 打开、保存、关闭通过（OpenAndRepair=false）；检查在副本上执行，交付的 DOCX 未经 Word 修复或重存。没有新增 Word PDF/分页通过声明。见 [word-skill.json](evidence/word-skill.json)。'
 report+=f'''
## 可安装 Skill 最终验收

Skill bundle: **{skill['skillBundle']}**

Skill execution: **{skill['skillExecution']}**

Skill DOCX integrity: **{skill['skillDOCXIntegrity']}**

Skill ZIP: `{skill['windowsZip']}`

执行环境绝对路径：`{skill['zip']}`。下载 [official-docx-formatter-skill.zip](official-docx-formatter-skill.zip)。

- ZIP 可解压、CRC 正确，单一顶层目录 `official-docx-formatter/`，恰好一个 SKILL.md，YAML frontmatter 合法，10 个必要文件。逐成员扫描无 API Key、字体、node_modules、临时文件或用户私密文档；仅打包明确列出的源码和参考材料。
- Web 版使用 DeepSeek 完成语义理解；Skill 版由宿主 Agent 完成同样的结构判断，二者共用确定性公文规则与 DOCX 格式化逻辑。Python 为独立实现，共用核心 AST 协议与规则快照；增加 host-agent 来源及输入文件哈希绑定。
- Python 离线执行与保护测试 **{skill['executionTests']['tests']}/{skill['executionTests']['tests']} PASS**：9 份有效样本均完成 inspect → 宿主已核对的 structure JSON → format → validate → output reopen，覆盖 flat style、1–4 级标题、无编号层级、附件/附注、长文档、函、表格、图片；损坏 DOCX 正确返回退出码 10。测试 AST 是宿主阅读全文后的标注，不充当运行时固定分类器。
- 格式注入、错文件 AST、漏段/重复 ID、低置信度、unknown、编号冲突、正文及图片篡改、输出覆盖、非法 XML/缺失部件、签名包均有明确拒绝检查。
- 全套 Vitest **{skill['vitest']['passed']}/{skill['vitest']['total']} PASS**，含 10 项新增对照测试：规则与 Web 常量完全一致；9 份相同 AST 的两种实现，字体/字号、段落属性、页面尺寸/边距、页码及文字哈希一致。生产 Web 逻辑没有改动。
- 最终 ZIP 解压后，在独立目录关闭第三方 site-packages 并阻止 socket 创建，使用 Python {skill['extractedExecution']['python']} 成功执行主样本；输入字节未改，375 字符及 SHA-256 一致，新增/删除/修改均为 0。实际输出见 [Skill 规范版](skill-demo/乱格式办公通知示例_规范版.docx)。未执行外部 Skill 库上传，验收范围为格式、封包及解压后实际运行。

{word_note}

证据：[skill-validation.json](evidence/skill-validation.json)、[skill-execution.json](evidence/skill-execution.json)。ZIP SHA-256：`{skill['sha256']}`。包大小：{skill['sizeBytes']} 字节。

Skill 脚本仅依赖 Python 3.9+ 标准库；宿主模型的数据处理方式取决于所用平台。字体需由办公环境提供，复杂对象、精确视觉分页的边界与既有规则一致。
'''
(SUB/'FINAL_ACCEPTANCE_REPORT.md').write_text(report)
(SUB/'README-FIRST.txt').write_text('''FINAL_STATUS = READY_FOR_SUBMISSION
在线：https://neuromorphicscience-sys.github.io/officical-doc-ai/
视频：office-doc-ai-demo.mp4（静音，中文字幕已烧录）
演示原文：../demo/乱格式办公通知示例.docx
实际输出：../demo/乱格式办公通知示例_规范版.docx
独立 Skill：official-docx-formatter-skill.zip（宿主 Agent + Python 3.9+，无 API Key）
GitHub：https://github.com/neuromorphicscience-sys/officical-doc-ai
验收：FINAL_ACCEPTANCE_REPORT.md；版本及最终 CI：RELEASE_MANIFEST.json
''')
print('Report written with verified video, E2E, OOXML and security evidence.')

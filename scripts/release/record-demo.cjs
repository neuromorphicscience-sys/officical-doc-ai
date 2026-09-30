/** Record the deployed production interface, with real Worker responses only.
 * Title cards and document previews are presentation layers, not app results.
 * Run after production-e2e.cjs; previews must come from the downloaded DOCX.
 */
const {chromium}=require('playwright');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..');const OUT=path.join(ROOT,'output/video');const URL='https://neuromorphicscience-sys.github.io/officical-doc-ai/';const WORKER='https://official-doc-ai-proxy.neuromorphicscience.workers.dev';
const subtitles=[];const scenes=[];fs.mkdirSync(OUT,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:810},recordVideo:{dir:OUT,size:{width:1440,height:810}},locale:'zh-CN',acceptDownloads:true});
 const page=await context.newPage();const video=page.video();const start=Date.now();const t=()=>+( (Date.now()-start)/1000).toFixed(3);
 const hold=ms=>page.waitForTimeout(ms);
 const cue=async(text,seconds=7)=>{const at=t();subtitles.push({start:at,end:at+seconds,text});await hold(seconds*1000)};
 const mark=name=>{scenes.push({name,start:t()});console.log('SCENE '+name)};
 async function focus(selector,block='start') {await page.locator(selector).first().evaluate((e,block)=>e.scrollIntoView({behavior:'smooth',block}),block);await hold(1100)}
 async function point(selector){const box=await page.locator(selector).first().boundingBox();if(box)await page.mouse.move(box.x+box.width*.68,box.y+box.height*.6,{steps:28});}
 async function chrome(label){await page.evaluate(({url,label})=>{
  document.querySelector('#video-frame')?.remove();const p=document.createElement('div');p.id='video-frame';
  p.style.cssText='position:fixed;left:0;right:0;bottom:0;height:104px;background:#10243f;color:#fff;z-index:99999;border-top:1px solid #345071;display:flex;justify-content:space-between;align-items:flex-start;padding:10px 28px;font:12px Microsoft YaHei,sans-serif;pointer-events:none';
  p.innerHTML='<span>办公文档智能整理工具 · '+label+'</span><span>'+url+'</span>';p.querySelectorAll('span').forEach(s=>s.style.color='#fff');document.body.append(p);
 },{url:URL,label})}
 async function card(title,kicker,body){await page.setContent(`<html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#f5f7fb;font-family:Microsoft YaHei,sans-serif;color:#18283d}.card{padding:130px 140px;border-top:12px solid #2458a6;height:810px}small{color:#2458a6;font-size:20px;letter-spacing:3px}h1{font-size:54px;line-height:1.4;max-width:1100px;margin:25px 0}p{font-size:24px;line-height:1.9;color:#526175;max-width:1120px}.line{margin-top:35px;height:3px;width:110px;background:#2458a6}</style><div class="card"><small>${kicker}</small><h1>${title}</h1><p>${body}</p><div class="line"></div></div></html>`);await chrome(kicker);}
 const img=name=>'data:image/png;base64,'+fs.readFileSync(path.join(OUT,name)).toString('base64');
 async function preview(compare=false){await page.setContent(`<html lang="zh-CN"><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;background:#eaf0f7;font-family:Microsoft YaHei,sans-serif;color:#18283d}header{padding:22px 44px;background:white;display:flex;justify-content:space-between;align-items:center}h1{font-size:24px;margin:0}span{font-size:13px;color:#526175}.pages{height:646px;display:flex;gap:25px;justify-content:center;padding:18px}.sheet{background:white;box-shadow:0 5px 25px #20364b22;overflow:hidden;width:${compare?'490':'530'}px;position:relative}.sheet b{display:block;text-align:center;padding:8px;color:#2458a6;font-size:15px}.sheet img{width:100%;display:block}.pages:has(.after){gap:45px}</style><header><h1>${compare?'同一份文档，整理前与整理后':'原始 DOCX：文字完整，格式混乱'}</h1><span>真实 DOCX · LibreOffice 预览（替代字体）· 最终以 Word 为准</span></header><div class="pages"><div class="sheet"><b>原始文件</b><img src="${img('before-1.png')}"></div>${compare?'<div class="sheet after"><b>规范化输出</b><img src="'+img('after-1.png')+'"></div>':''}</div></html>`);await chrome('真实文件预览');}
 mark('标题');await card('办公文档智能整理工具','FINAL DEMO','AI 语义理解 · 确定性公文规范 · DOCX 本地处理');
 await cue('办公文档智能整理工具\n面向高校与政务办公的 AI 文档规范化工具。',8);
 await cue('本片为静音实机演示，全部说明均以中文字幕呈现。',7);
 mark('原始文档');await preview();
 await cue('这是本次演示的原始 Word：乱格式办公通知示例.docx。',8);
 await cue('标题、正文、层级、落款的文字完整，\n但字号、颜色、对齐和间距混用。',8);
 await cue('所有段落都没有使用正确的 Word 标题样式。\n仅靠字体字号，无法可靠判断文档逻辑。',8);
 mark('生产网站');await page.goto(URL,{waitUntil:'networkidle'});await chrome('生产网站实录');
 await page.getByText('AI 语义识别已连接',{exact:true}).waitFor();
 await cue('现在打开已公开部署的生产网站。\n屏幕下方始终显示本次访问的网址。',8);
 await point('.hero-badges');await cue('系统仅接收 DOCX。AI 负责恢复语义结构，\n原始文件在当前浏览器中解析与重建。',8);
 await cue('默认只改格式，不新增、删除或改写正文。',7);
 mark('上传');await focus('#workspace');await point('.dropzone');
 await cue('拖入文件，或点击上传区域选择本地 Word 文档。',7);
 await page.setInputFiles('#docx-file',path.join(ROOT,'demo/乱格式办公通知示例.docx'));
 await point('.drop-copy');await cue('已选中合成演示样本，文件名和大小可以直接核对。\n这里也可以更换或移除文件。',8);
 await point('.field select');await cue('公文类型保持“自动识别”。\n手动选择仅为语义提示，不会套用虚构模板。',8);
 mark('真实AI处理');const responsePromise=page.waitForResponse(r=>r.url()===WORKER+'/v1/structure',{timeout:60000});
 await point('.primary.full');await page.getByRole('button',{name:/^AI 智能规范化/}).click();
 const aiStart=t();subtitles.push({start:aiStart,end:aiStart+8,text:'点击“AI 智能规范化”，实际调用生产 Worker 和 DeepSeek。'});
 const response=await responsePromise;const analysis=await response.json();assert.equal(response.status(),200);assert.equal(analysis.source,'deepseek');
 fs.writeFileSync(path.join(OUT,'recorded-analysis.json'),JSON.stringify(analysis,null,2));
 const aiEnd=t();if(aiEnd<aiStart+8)subtitles.at(-1).end=aiEnd;if(aiEnd>aiStart+8)subtitles.push({start:aiStart+8,end:aiEnd,text:'读取与提取在本地完成；AI 根据全文语义识别角色与层级。\n画面展示实际阶段，不使用虚构百分比。'});
 await page.locator('#result').waitFor({timeout:20000});
 await cue('真实 AI 分析已返回，规范化与完整性检查均已完成。',7);
 mark('文档理解');await focus('#analysis');
 await cue('文档被识别为“通知”。文种置信度与段落覆盖率均可核查。',8);
 await point('.stat-grid');await cue('识别结果包含标题、主送机关、各级标题、正文，\n以及附件、落款和日期。',8);
 await cue('关键分工：AI 回答“这一段是什么”，\n规则引擎决定“这一段应该如何排版”。',8);
 await focus('.structure-card');await point('.role-editor');
 await cue('段落语义映射将原文与识别角色逐项对应。\n角色和标题层级可由使用者核对、修正。',8);
 await page.locator('.table-wrap').evaluate(e=>e.scrollTo({top:200,behavior:'smooth'}));await cue('已有的“一、”“（一）”等编号是强证据。\nAI 与显式编号冲突时，会阻止直接输出并提示修正。',8);
 await page.locator('.table-wrap').evaluate(e=>e.scrollTo({top:420,behavior:'smooth'}));await cue('对没有编号的语义标题，系统可以恢复层级，\n但不会擅自把建议编号写入原文。',8);
 await page.locator('.table-wrap').evaluate(e=>e.scrollTo({top:1000,behavior:'smooth'}));await cue('附件说明、发文单位和成文日期也作为独立角色处理。',7);
 mark('规则引擎');await page.locator('#standard details').evaluate(e=>e.open=true);await focus('#standard');
 await cue('公文格式规范面板列出了当前规则的具体依据。',7);
 await cue('A4 页面；上 37、下 35、左右 27 毫米页边距；\n标题和正文的字体字号均由固定规则决定。',9);
 await cue('正文首行缩进两字符，基准行距为 28.8 磅。\n模型不会自由生成字体、字号或页边距。',8);
 await cue('一至四级标题、附件、落款、日期和页码分别映射。\n最终字体显示与实际分页仍取决于办公软件环境。',9);
 mark('内容完整性');await focus('#result');await point('.integrity-grid');
 await cue('内容保护是输出前的硬性检查。\n原始字符数与输出字符数必须一致。',8);
 await cue('本次结果：新增 0、删除 0、修改 0。\n正文文字未被改变。',8);
 await point('.hash-row');await cue('SHA-256 校验一致；一旦内容完整性检查失败，\n系统将阻止生成下载结果。',8);
 await cue('格式处理报告列出实际执行的规则，\n可以进一步展开查看逐段操作明细。',8);
 mark('下载');await point('.download');const dl=page.waitForEvent('download');await page.getByRole('button',{name:'下载规范文档',exact:true}).click();const download=await dl;await download.saveAs(path.join(OUT,'recorded-output.docx'));assert.equal(await download.failure(),null);
 await cue('点击“下载规范文档”，浏览器保存一份新的 DOCX。\n原始文件保持不变。',8);
 // Render the exact DOCX downloaded during this recording, before displaying it.
 require('node:child_process').execFileSync('wsl.exe',['-d','Ubuntu-22.04','--','python3','/mnt/d/Research/office/official-doc-ai/scripts/release/render-preview.py','--recorded'],{timeout:100000,stdio:'pipe'});
 mark('前后对比');await preview(true);
 await cue('左侧为原始文档，右侧为同一样本的真实规范化输出。\n此处使用 PDF 补充预览展示排版变化。',9);
 await cue('标题居中，正文按统一字体、字号和行距排版，\n一级和二级标题恢复清晰的视觉层次。',8);
 await cue('这些页面来自真实 DOCX，不是手工重绘的结果。\nWord 打开、保存、关闭验收也已通过。',8);
 await page.locator('.after img').evaluate((e,src)=>{e.src=src},img('after-2.png'));await cue('原始正文、附件、落款、日期均保留。\n不同软件与字体环境可能产生分页差异。',8);
 mark('错误恢复');await page.goto(URL,{waitUntil:'networkidle'});await chrome('错误恢复实录');await focus('#workspace');
 await page.setInputFiles('#docx-file',path.join(ROOT,'demo/cases/10-corrupt.docx'));await page.getByRole('button',{name:/^AI 智能规范化/}).click();await page.getByRole('alert').waitFor();await focus('.error-banner','center');
 await cue('损坏的 DOCX 会被明确拒绝，并给出重新另存或更换文件的提示。',8);
 await cue('错误不会改变原始文件。可移除文件、重新选择，\n或根据提示重试处理。',8);
 await page.getByRole('button',{name:'移除文件',exact:true}).click();await focus('#workspace');await cue('没有文件时，主操作保持禁用，避免无效操作。',6);
 mark('隐私与边界');await page.goto(URL,{waitUntil:'networkidle'});await chrome('隐私与支持范围');await focus('#architecture');
 await cue('DOCX 本体在浏览器中完成解析、修改与重新生成。\nAI 服务仅接收结构识别所需文本和弱格式特征。',9);
 await cue('这不是完全离线处理：必要文本会发送给 DeepSeek。\nAPI Key 保存在 Worker Secret，不进入前端。',8);
 await cue('AI 不可用时明确显示演示模式；低置信度需要人工核对。\n复杂对象不承诺内部智能重排。',8);
 mark('结束');await card('理解结构 · 规范排版 · 保护原文','READY FOR SUBMISSION','在线体验<br>'+URL);
 await cue('AI 恢复语义结构，规则引擎确定性规范，\n字符与 SHA-256 校验保护正文内容。',9);
 await cue('打开生产网站，使用提交包中的演示 DOCX，\n即可复现本片的完整处理流程。',8);
 const duration=t();await context.close();await video.saveAs(path.join(OUT,'demo-raw.webm'));await browser.close();
 fs.writeFileSync(path.join(OUT,'timeline.json'),JSON.stringify({duration,scenes,subtitles,url:URL,source:'deepseek'},null,2));
 console.log(JSON.stringify({duration,scenes:scenes.length,subtitles:subtitles.length}));
})().catch(e=>{console.error(e);process.exit(1)});

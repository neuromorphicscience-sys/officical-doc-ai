/** Release QA. Uses synthetic DOCX only. Real requests are never mocked in runDocument. */
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const JSZip = require('jszip');
const ROOT = path.resolve(__dirname,'../..');
const URL = process.argv[2] || process.env.QA_URL || 'https://neuromorphicscience-sys.github.io/officical-doc-ai/';
const WORKER = 'https://official-doc-ai-proxy.neuromorphicscience.workers.dev';
const OUT = path.join(ROOT,'output','production-e2e');
const SHOTS = path.join(ROOT,'docs','screenshots');
fs.mkdirSync(OUT,{recursive:true});fs.mkdirSync(SHOTS,{recursive:true});
const report={url:URL,startedAt:new Date().toISOString(),documents:[],responsive:[],accessibility:[],errors:[],fatalConsole:[],expectedFaultConsole:[]};
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:900},locale:'zh-CN',reducedMotion:'reduce',acceptDownloads:true});
 if (URL.includes('localhost')) await context.addInitScript(url=>localStorage.setItem('official-doc-ai-proxy-url',url),WORKER);
 const page=await context.newPage();let fault=false;
 page.on('pageerror',e=>report.fatalConsole.push(e.message));
 page.on('console',m=>{if(m.type()==='error')(fault?report.expectedFaultConsole:report.fatalConsole).push(m.text())});
 await page.goto(URL,{waitUntil:'networkidle'});
 assert.equal(await page.title(),'办公文档智能整理工具');
 await page.getByText('AI 语义识别已连接',{exact:true}).waitFor({timeout:15000});
 assert(await page.getByRole('button',{name:/^AI 智能规范化/}).isDisabled());
 const resources=await page.evaluate(()=>performance.getEntriesByType('resource').filter(r=>/\.(css|js)(\?|$)/.test(r.name)).map(r=>({name:new URL(r.name).pathname,duration:r.duration})));
 assert(resources.some(r=>r.name.endsWith('.css')));assert(resources.some(r=>r.name.endsWith('.js')||r.name.includes('main.tsx')));report.resources=resources;
 async function axe(label){const a=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa']).analyze();report.accessibility.push({label,violations:a.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});}
 async function responsive(state){
  for(const [width,height] of [[1440,900],[1280,800],[768,1024],[390,844]]){
   await page.setViewportSize({width,height});await page.waitForTimeout(150);
   const geometry=await page.evaluate(()=>({width:innerWidth,scroll:document.documentElement.scrollWidth}));
   assert(geometry.scroll<=geometry.width,`${state} overflow at ${width}: ${geometry.scroll}`);
   report.responsive.push({state,width,height,...geometry,pass:true});
   if(width===390){await page.evaluate(state=>document.querySelector(state==='landing'?'.hero':'#result').scrollIntoView({block:'start'}),state);await page.screenshot({path:path.join(SHOTS,state==='landing'?'06-mobile-landing.png':'07-mobile-result.png')});}
  }
  await page.setViewportSize({width:1440,height:900});
 }
 await page.screenshot({path:path.join(SHOTS,'01-landing-desktop.png')});await axe('landing');await responsive('landing');
 // Verify keyboard entry and a visible focus indicator.
 await page.goto(URL,{waitUntil:'networkidle'});await page.keyboard.press('Tab');
 report.keyboard={firstFocus:await page.locator(':focus').innerText(),outline:await page.locator(':focus').evaluate(e=>getComputedStyle(e).outlineStyle)};
 assert(report.keyboard.firstFocus.includes('跳转'));assert.notEqual(report.keyboard.outline,'none');
 async function runDocument(relative,label,requiredRoles,screenshot=false){
  await page.setInputFiles('#docx-file',path.resolve(ROOT,relative));
  await page.locator('#workspace').scrollIntoViewIfNeeded();
  if(screenshot) await page.screenshot({path:path.join(SHOTS,'02-file-selected.png')});
  const request=page.waitForResponse(r=>r.url()===WORKER+'/v1/structure',{timeout:60000});
  await page.getByRole('button',{name:/^AI 智能规范化/}).click();
  if(screenshot) {await page.getByText('AI 语义分析',{exact:true}).waitFor();await page.screenshot({path:path.join(SHOTS,'03-processing.png')});}
  const response=await request;const analysis=await response.json();
  fs.writeFileSync(path.join(OUT,label+'-analysis.json'),JSON.stringify(analysis,null,2));
  assert.equal(response.status(),200,JSON.stringify(analysis));assert.equal(analysis.source,'deepseek');
  for(const role of requiredRoles)assert(analysis.blocks.some(b=>b.role===role),label+' missing '+role);
  await page.waitForFunction(()=>document.querySelector('#result') || document.querySelector('.final-action-card') || document.querySelector('[role=alert]'),{},{timeout:15000});
  const errors=await page.locator('.issue.error').count();assert.equal(errors,0,label+' structure conflict');
  if(!await page.locator('#result').count()) await page.getByRole('button',{name:'一键规范化 DOCX'}).click();
  await page.locator('#result').waitFor();
  await page.locator('#result').scrollIntoViewIfNeeded();
  const integrity=await page.locator('.integrity-grid').innerText();assert(integrity.includes('一致'));
  const d=page.waitForEvent('download');await page.getByRole('button',{name:'下载规范文档',exact:true}).click();const download=await d;
  assert.equal(await download.failure(),null);const destination=path.join(OUT,label+'_规范版.docx');await download.saveAs(destination);
  const original=await JSZip.loadAsync(fs.readFileSync(path.resolve(ROOT,relative)));const output=await JSZip.loadAsync(fs.readFileSync(destination),{checkCRC32:true});
  const inputXml=await original.file('word/document.xml').async('string');const outputXml=await output.file('word/document.xml').async('string');
  const compare=await page.evaluate(({inputXml,outputXml})=>{
   const ns='http://schemas.openxmlformats.org/wordprocessingml/2006/main';const parse=x=>new DOMParser().parseFromString(x,'application/xml');
   const text=x=>Array.from(parse(x).getElementsByTagNameNS(ns,'t')).map(n=>n.textContent).join('');
   return {same:text(inputXml)===text(outputXml),characters:text(inputXml).length,valid:!parse(outputXml).getElementsByTagName('parsererror').length};
  },{inputXml,outputXml});assert(compare.same && compare.valid);
  report.documents.push({label,source:analysis.source,documentType:analysis.documentType,confidence:analysis.confidence,roles:analysis.blocks.map(b=>({id:b.id,role:b.role,level:b.level,confidence:b.confidence})),integrity,compare,download:path.basename(destination),pass:true});
  if(screenshot){await page.screenshot({path:path.join(SHOTS,'04-result-success.png')});await axe('result');await responsive('result');}
  return destination;
 }
 const output=await runDocument('demo/乱格式办公通知示例.docx','demo',['title','recipient','heading','body','attachment_note','issuer','date'],true);
 await runDocument(path.relative(ROOT,output),'reload',['title','recipient','heading','issuer','date']);
 await runDocument('demo/cases/01-uniform.docx','A-uniform',['title','recipient','heading','body','issuer','date']);
 await runDocument('demo/cases/03-unnumbered.docx','B-unnumbered',['title','recipient','heading','body','issuer','date']);
 const b=report.documents.at(-1);assert(b.roles.filter(x=>x.role==='heading').length>=3);
 await page.locator('#analysis').scrollIntoViewIfNeeded();await page.screenshot({path:path.join(SHOTS,'05-result-warning.png')});
 await runDocument('demo/cases/04-attachments.docx','C-attachments',['title','recipient','body','attachment_note','issuer','date','annotation']);
 // Below are explicitly fault-injected UI checks; never counted as real AI success.
 fault=true;
 await page.evaluate(()=>{window.__originalCreateObjectURL=URL.createObjectURL;URL.createObjectURL=()=>{throw new Error('Intentional QA download failure')}});
 await page.getByRole('button',{name:'下载规范文档',exact:true}).click();
 await page.getByRole('alert').filter({hasText:'下载未能启动'}).waitFor();
 await page.evaluate(()=>{URL.createObjectURL=window.__originalCreateObjectURL;delete window.__originalCreateObjectURL});
 report.errors.push({label:'download-failure-recoverable',pass:true});
 for(const [label,payload,message] of [
  ['not-docx',{name:'test.doc',mimeType:'application/msword',buffer:Buffer.from('test')},'仅支持 .docx'],
  ['empty',{name:'empty.docx',mimeType:'application/octet-stream',buffer:Buffer.alloc(0)},'文件为空'],
  ['corrupt',path.join(ROOT,'demo/cases/10-corrupt.docx'),'DOCX 文件已损坏'],
 ]){
  await page.setInputFiles('#docx-file',payload);
  if(label==='corrupt')await page.getByRole('button',{name:/^AI 智能规范化/}).click();
  await page.getByRole('alert').filter({hasText:message}).waitFor();report.errors.push({label,pass:true});
 }
 const missing=new JSZip();missing.file('placeholder.txt','test');
 await page.setInputFiles('#docx-file',{name:'missing.docx',mimeType:'application/octet-stream',buffer:await missing.generateAsync({type:'nodebuffer'})});
 await page.getByRole('button',{name:/^AI 智能规范化/}).click();await page.getByRole('alert').filter({hasText:'缺少 word/document.xml'}).waitFor();report.errors.push({label:'missing-document',pass:true});
 for(const [label,status,body,message] of [
  ['invalid-ai-json',200,'{"oops":true}','AI 返回 JSON 无效'],
  ['timeout',502,JSON.stringify({error:'analysis_failed',detail:'AI 分析超时，请稍后重试。'}),'AI 分析失败或超时'],
  ['too-large',413,JSON.stringify({error:'document_too_large',detail:'文档超过支持范围，请拆分后重试。'}),'文档超过支持范围'],
 ]){
  await page.route('**/v1/structure',route=>route.fulfill({status,contentType:'application/json',body}));
  await page.setInputFiles('#docx-file',path.join(ROOT,'demo/cases/01-uniform.docx'));await page.getByRole('button',{name:/^AI 智能规范化/}).click();
  await page.getByRole('alert').filter({hasText:message}).waitFor();report.errors.push({label,pass:true});await page.unroute('**/v1/structure');
 }
 await page.route('**/v1/structure',route=>route.abort('failed'));
 await page.setInputFiles('#docx-file',path.join(ROOT,'demo/cases/01-uniform.docx'));await page.getByRole('button',{name:/^AI 智能规范化/}).click();
 await page.locator('.demo-warning').waitFor();assert((await page.locator('.demo-warning').innerText()).includes('演示模式'));report.errors.push({label:'ai-unavailable-clearly-labelled-demo',pass:true});await page.unroute('**/v1/structure');
 await page.getByRole('button',{name:'移除文件',exact:true}).click();assert(await page.getByRole('button',{name:/^AI 智能规范化/}).isDisabled());report.errors.push({label:'remove-recover',pass:true});
 await axe('error-recovered');
 report.finishedAt=new Date().toISOString();report.pass=report.fatalConsole.length===0&&report.accessibility.every(a=>a.violations.length===0);
 fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
 await browser.close();console.log(JSON.stringify({pass:report.pass,documents:report.documents.length,responsive:report.responsive.length,accessibility:report.accessibility.map(a=>({label:a.label,violations:a.violations.length})),errors:report.errors,fatal:report.fatalConsole},null,2));if(!report.pass)process.exitCode=1;
})().catch(e=>{report.failure=e.message;fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));console.error(e);process.exit(1)});

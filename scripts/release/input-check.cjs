/** Production UI contract checks. Injected AI risk cases are explicitly synthetic. */
const {chromium}=require('playwright');const fs=require('node:fs');const path=require('node:path');const assert=require('node:assert/strict');
const ROOT=path.resolve(__dirname,'../..'),OUT=path.join(ROOT,'output/input-check');fs.mkdirSync(OUT,{recursive:true});
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});const page=await browser.newPage({viewport:{width:390,height:844}});const checks=[];
 await page.goto('https://neuromorphicscience-sys.github.io/officical-doc-ai/',{waitUntil:'networkidle'});
 const drop=page.locator('.dropzone');await drop.focus();assert.notEqual(await drop.evaluate(e=>getComputedStyle(e).outlineStyle),'none');
 for(const key of ['Enter','Space']){const event=page.waitForEvent('filechooser');await page.keyboard.press(key);const chooser=await event;await chooser.setFiles(path.join(ROOT,'demo/cases/01-uniform.docx'));await drop.focus();checks.push({name:'keyboard file selection '+key,pass:true});}
 const data=await page.evaluateHandle(bytes=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],'拖拽测试.docx',{type:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'}));return dt},[...fs.readFileSync(path.join(ROOT,'demo/cases/03-unnumbered.docx'))]);
 await drop.dispatchEvent('dragover',{dataTransfer:data});assert((await drop.getAttribute('class')).includes('dragging'));await drop.dispatchEvent('drop',{dataTransfer:data});await page.getByText('拖拽测试.docx',{exact:true}).waitFor();assert(!(await drop.getAttribute('class')).includes('dragging'));checks.push({name:'drag-over and file drop',pass:true});
 await page.setInputFiles('#docx-file',{name:'很长的文档文件名称用于检查移动端换行'.repeat(6)+'.docx',mimeType:'application/octet-stream',buffer:fs.readFileSync(path.join(ROOT,'demo/cases/01-uniform.docx'))});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));checks.push({name:'replacement and long filename at 390px',pass:true});
 await page.getByRole('button',{name:'移除文件',exact:true}).click();assert(await page.getByRole('button',{name:/^AI 智能规范化/}).isDisabled());checks.push({name:'remove resets CTA',pass:true});
 const oversized=path.join(OUT,'oversized.docx');fs.writeFileSync(oversized,Buffer.alloc(50*1024*1024+1));await page.setInputFiles('#docx-file',oversized);await page.getByRole('alert').filter({hasText:'文件超过 50 MB'}).waitFor();checks.push({name:'client 50MB limit',pass:true});
 await page.setViewportSize({width:1440,height:900});
 const original=JSON.parse(fs.readFileSync(path.join(ROOT,'output/production-e2e/A-uniform-analysis.json'),'utf8'));
 for(const kind of ['low-confidence','numbering-conflict']){
  const analysis=structuredClone(original);const block=analysis.blocks.find(b=>b.id===(kind==='low-confidence'?2:3));
  if(kind==='low-confidence'){block.role='unknown';delete block.level;block.confidence=.3;}else {block.role='body';delete block.level;}
  await page.route('**/v1/structure',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(analysis)}));
  await page.setInputFiles('#docx-file',path.join(ROOT,'demo/cases/01-uniform.docx'));await page.getByRole('button',{name:/^AI 智能规范化/}).click();await page.locator('.final-action-card').waitFor();assert.equal(await page.locator('#result').count(),0);
  if(kind==='low-confidence'){await page.getByText(/角色尚不确定/).waitFor();await page.getByText(/结构置信度为 30%/).waitFor();await page.getByRole('combobox',{name:'段落 P2 的角色',exact:true}).selectOption('body');}
  else {assert(await page.getByRole('button',{name:'一键规范化 DOCX'}).isDisabled());await page.getByRole('combobox',{name:'段落 P3 的角色',exact:true}).selectOption('heading');}
  assert.equal(await page.locator('.issue.error').count(),0);await page.getByRole('button',{name:'一键规范化 DOCX'}).click();await page.locator('#result').waitFor();checks.push({name:kind+' review and manual recovery',mode:'controlled contract injection; not a real AI result',pass:true});await page.unroute('**/v1/structure');
 }
 fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify({pass:true,checks},null,2));console.log(JSON.stringify({pass:true,checks},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});

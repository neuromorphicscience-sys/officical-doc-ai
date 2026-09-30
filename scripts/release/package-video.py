"""Build burned-in Chinese subtitles, encode H.264, and produce video QC artifacts."""
from pathlib import Path
import json,subprocess,hashlib
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/video';SUB=ROOT/'submission';SUB.mkdir(exist_ok=True)
r=json.loads((OUT/'timeline.json').read_text());subs=r['subtitles']
# AI latency varies: clamp a cue to the next actual scene rather than overlap it.
for a,b in zip(subs,subs[1:]): a['end']=min(a['end'],b['start'])
assert all(x['end']>x['start'] for x in subs)
def stamp(s):
 n=round(s*1000);return f'{n//3600000:02}:{n//60000%60:02}:{n//1000%60:02},{n%1000:03}'
srt='\n\n'.join(f'{i+1}\n{stamp(x["start"])} --> {stamp(x["end"])}\n{x["text"]}' for i,x in enumerate(subs))+'\n'
(SUB/'office-doc-ai-demo.srt').write_text(srt,encoding='utf-8-sig')
# Use explicit 1080p ASS coordinates so subtitle font sizes stay predictable.
def ass_time(seconds):
 n=round(seconds*100);return f'{n//360000}:{n//6000%60:02}:{n//100%60:02}.{n%100:02}'
ass="""[Script Info]
ScriptType: v4.00+
PlayResX: 1920
PlayResY: 1080
WrapStyle: 0
[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,WenQuanYi Zen Hei,34,&H00FFFFFF,&H00FFFFFF,&H0010243F,&H0010243F,0,0,0,0,100,100,0,0,1,1,0,2,70,70,24,1
[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
for x in subs:
 text=x['text'].replace(chr(10),r'\N')
 ass+=f"Dialogue: 0,{ass_time(x['start'])},{ass_time(x['end'])},Default,,0,0,0,,{text}\n"
(OUT/'subtitles.ass').write_text(ass,encoding='utf-8-sig')
video=SUB/'office-doc-ai-demo.mp4'
subprocess.run(['ffmpeg','-y','-hide_banner','-loglevel','warning','-i',str(OUT/'demo-raw.webm'),'-t',str(r['duration']),'-vf',"scale=1920:1080:flags=lanczos,fps=30,ass=output/video/subtitles.ass",'-c:v','libx264','-preset','fast','-crf','21','-pix_fmt','yuv420p','-an','-movflags','+faststart',str(video)],cwd=ROOT,check=True)
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)]))
v=next(x for x in probe['streams'] if x['codec_type']=='video');duration=float(probe['format']['duration'])
assert v['codec_name']=='h264' and v['width']==1920 and v['height']==1080 and v['pix_fmt']=='yuv420p'
assert 0<duration<600 and v['r_frame_rate']=='30/1' and 'mp4' in probe['format']['format_name']
assert abs(duration-r['duration'])<.2, 'Unexpected frozen tail or truncated recording'
assert all(0<=x['start']<x['end']<=duration+1 for x in subs)
# A complete decode finds truncation/corruption, not just metadata correctness.
subprocess.run(['ffmpeg','-v','error','-i',str(video),'-f','null','-'],check=True)
for label,at in [('start',3),('25',duration*.25),('50',duration*.5),('75',duration*.75),('end',duration-3)]:
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',str(at),'-i',str(video),'-frames:v','1',str(OUT/f'qc-{label}.png')],check=True)
summary={'pass':True,'container':probe['format']['format_name'],'codec':v['codec_name'],'width':v['width'],'height':v['height'],'fps':v['r_frame_rate'],'pixelFormat':v['pix_fmt'],'durationSeconds':duration,'duration':f'{int(duration)//60:02}:{int(duration)%60:02}','sizeBytes':video.stat().st_size,'sha256':hashlib.sha256(video.read_bytes()).hexdigest(),'audio':'none','subtitles':'simplified Chinese, burned in, plus UTF-8 SRT','fullDecode':'PASS','sampleFrames':['start','25%','50%','75%','end']}
(OUT/'ffprobe.json').write_text(json.dumps(probe,indent=2));(SUB/'VIDEO_VALIDATION.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
rows=[]
for i,scene in enumerate(r['scenes']):
 end=r['scenes'][i+1]['start'] if i+1<len(r['scenes']) else duration
 rows.append(f'| {stamp(scene["start"])[:-4]}–{stamp(end)[:-4]} | {scene["name"]} |')
script=f'''# 正式演示视频脚本与制作记录

- 文件：office-doc-ai-demo.mp4
- 实际时长：{summary['duration']}（{duration:.3f} 秒）
- 1920×1080，16:9，30 fps，H.264 / yuv420p，CRF 21，faststart，无音轨。
- 中文字幕已烧录，同时提供 UTF-8 SRT。系统字体 WenQuanYi Zen Hei，仅本机调用，未提交字体文件。
- 主样本：`demo/乱格式办公通知示例.docx`，合成内容，无真实敏感信息。
- 实录：[生产网站]({r['url']})，真实生产 Worker，实际响应 `source=deepseek`。
- 浏览器录制：Playwright 1440×810，最终 Lanczos 缩放为1080p。录制展示真实操作、请求、结果和下载；裁去关闭浏览器时录屏尾部重复的静止帧。标题卡、底部说明与字幕属于后期讲解层。
- 对比页面使用真实原始 DOCX 与本次录制实际下载 DOCX 的 LibreOffice PDF 补充渲染；不声称等价于 Word 分页。系统缺少部分规范字体时存在替代。
- Word COM 已对核心样本执行 OpenAndRepair=false 打开、保存、关闭；当前 Office PDF 导出持续等待，故未将其列为通过。

## 实际时间轴

| 时间 | 画面 |
|---|---|
'''+ '\n'.join(rows)+ '\n\n## 全部字幕\n\n'+ '\n\n'.join(f'**{stamp(x["start"])[:-4]}–{stamp(x["end"])[:-4]}**\n\n{x["text"]}' for x in subs)+ '\n\n## 复现\n\n先执行生产 E2E，再运行 `scripts/release/render-preview.py` 准备原文预览；`node scripts/release/record-demo.cjs` 录制；`python scripts/release/package-video.py` 编码、烧录字幕、全片解码及抽帧。录屏脚本针对本次 Windows + WSL 环境，其他环境需调整渲染程序路径。\n'
(SUB/'VIDEO_SCRIPT.md').write_text(script)
print(json.dumps(summary,ensure_ascii=False,indent=2))

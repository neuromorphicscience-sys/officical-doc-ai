"""Render actual DOCX to PDF with LibreOffice, explicitly supplementary to Word.
Uses a system soffice, or the temporary official Ubuntu packages in this run.
No font file is copied into the project.
"""
from pathlib import Path
import os,shutil,subprocess,sys
import fitz
ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'output/video';OUT.mkdir(parents=True,exist_ok=True)
lo=shutil.which('soffice') or '/tmp/official-doc-lo/root/usr/lib/libreoffice/program/soffice'
env=os.environ.copy();env['LD_LIBRARY_PATH']='/tmp/official-doc-lo/root/usr/lib/libreoffice/program:/tmp/official-doc-lo/root/usr/lib/x86_64-linux-gnu:'+env.get('LD_LIBRARY_PATH','')
if lo.startswith('/tmp/official-doc-lo'):
 env['URE_BOOTSTRAP']='vnd.sun.star.pathname:/tmp/official-doc-lo/root/usr/lib/libreoffice/program/fundamentalrc'
env['SAL_USE_VCLPLUGIN']='svp'
# System-installed fonts may be used locally; they are never shipped.
fonts=Path('/tmp/official-doc-fonts.conf');fonts.write_text('''<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><include>/etc/fonts/fonts.conf</include><dir>/mnt/c/Windows/Fonts</dir><cachedir>/tmp/official-doc-font-cache</cachedir><alias binding="strong"><family>仿宋_GB2312</family><prefer><family>FangSong</family></prefer></alias><alias binding="strong"><family>楷体_GB2312</family><prefer><family>KaiTi</family></prefer></alias><alias binding="strong"><family>方正小标宋_GBK</family><prefer><family>SimSun</family></prefer></alias></fontconfig>''');env['FONTCONFIG_FILE']=str(fonts)
recorded='--recorded' in sys.argv
items=[('after',OUT/'recorded-output.docx')] if recorded else [('before',ROOT/'demo/乱格式办公通知示例.docx'),('after',ROOT/'output/production-e2e/demo_规范版.docx')]
for label,source in items:
 # Use ASCII staging names to avoid shell and viewer filename encoding differences.
 stage=OUT/(label+'.docx');shutil.copyfile(source,stage)
 subprocess.run([lo,'-env:UserInstallation=file:///tmp/official-doc-lo-profile','--headless','--convert-to','pdf','--outdir',str(OUT),str(stage)],env=env,check=True,timeout=90,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 pdf=OUT/(label+'.pdf');assert pdf.exists(), 'PDF was not generated'
 doc=fitz.open(pdf)
 for i,page in enumerate(doc): page.get_pixmap(matrix=fitz.Matrix(1.7,1.7),alpha=False).save(OUT/f'{label}-{i+1}.png')
 print(label, 'pages=',len(doc), 'source=',source.name)

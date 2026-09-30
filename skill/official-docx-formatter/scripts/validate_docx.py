#!/usr/bin/env python3
"""Usage: validate_docx.py ORIGINAL.docx OUTPUT.docx [--report validation.json]"""
from common import *
def run():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('original');p.add_argument('output');p.add_argument('--report');a=p.parse_args()
    result=compare(a.original,a.output)
    if a.report:result['report']=write_new(a.report,json_bytes(result))
    return result
if __name__=='__main__':main(run)

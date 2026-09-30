#!/usr/bin/env python3
"""Usage: inspect_docx.py INPUT.docx --out inspection.json"""
from common import *
def run():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('input');p.add_argument('--out');args=p.parse_args()
    data=inspect(args.input)
    if args.out:return {'ok':True,'inspection':write_new(args.out,json_bytes(data)),'paragraphs':len(data['paragraphs']),'inputSHA256':data['inputSHA256']}
    return data
if __name__=='__main__':main(run)

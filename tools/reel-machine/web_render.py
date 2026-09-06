#!/usr/bin/env python3
"""Detached rendering adapter for the authenticated, locally hosted creator studio."""
import argparse
import fcntl
import json
from pathlib import Path
import subprocess
import sys
import time


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--count',type=int,choices=range(1,6),required=True)
    parser.add_argument('--voice',required=True)
    parser.add_argument('--provider',choices=['kokoro','google'],default='kokoro')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent
    folder = args.output.resolve()
    # Only the API-owned studio output tree can be used by this adapter.
    if not folder.is_relative_to(root/'output'/'studio'):
        parser.error('Output must be within the studio directory')
    def status(value,error=None):
        temp=folder/'status.tmp'
        temp.write_text(json.dumps({'status':value,'updatedAt':int(time.time()*1000),'error':error}))
        temp.replace(folder/'status.json')
    lock=(root/'output'/'.render-lock').open('w')
    try:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        status('failed','The local engine is rendering another batch. Try again when it finishes.')
        return
    child=None
    try:
        status('rendering')
        with (folder/'render.log').open('w') as log:
            child=subprocess.Popen([sys.executable,str(root/'reels.py'),'--render-only','--count',str(args.count),'--voice',args.voice,'--provider',args.provider,'--topics',str(folder/'topics.json'),'--output',str(folder)],stdout=log,stderr=subprocess.STDOUT)
            deadline=time.monotonic()+1800
            while child.poll() is None:
                if time.monotonic()>deadline:
                    child.kill()
                    child.wait()
                    status('failed','Rendering exceeded 30 minutes. Your scripts are saved locally.')
                    return
                status('rendering')
                time.sleep(3)
            status('complete' if child.returncode==0 else 'failed',None if child.returncode==0 else 'Rendering failed. Check the local render log, then retry the batch.')
    except Exception:
        if child and child.poll() is None:
            child.kill()
            child.wait()
        status('failed','The local rendering worker could not start.')


if __name__=='__main__':
    main()

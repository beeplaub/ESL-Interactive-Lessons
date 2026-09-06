#!/usr/bin/env python3
"""Standalone local draft-reel worker. Never loads application secrets."""
from __future__ import annotations

import argparse
import fcntl
import hashlib
import html
import json
import math
import os
from pathlib import Path
import random
import shutil
import subprocess
import sys
import time
import urllib.request
import urllib.parse

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / '.deps'))
from PIL import Image, ImageDraw, ImageFont, ImageOps

TOPICS = [
 ('microfiction', 'The lighthouse that received a letter from tomorrow'),
 ('reflection', 'A small unfinished thing you can finish today'),
 ('creative challenge', 'Imagine a city where shadows choose their owners'),
 ('microfiction', 'The last plant shop on a space station'),
 ('reflection', 'Make room for a hobby you are bad at'),
 ('creative challenge', 'Turn an ordinary key into a story'),
 ('microfiction', 'A night train with one impossible passenger'),
 ('reflection', 'Notice one beautiful ordinary detail'),
 ('creative challenge', 'Design a planet where it rains music'),
 ('microfiction', 'A robot learns why humans keep broken things'),
 ('reflection', 'Write a kind note to your future self'),
 ('creative challenge', 'Invent a tiny shop inside a tree'),
 ('microfiction', 'The ocean returns a lost notebook'),
 ('reflection', 'Choose a smaller first step'),
 ('creative challenge', 'Describe a sunset without naming a color'),
 ('microfiction', 'A clockmaker repairs a missing minute'),
 ('reflection', 'An invitation to take a quiet pause'),
 ('creative challenge', 'Invent a map that follows your curiosity'),
 ('microfiction', 'The moon opens a lost and found desk'),
 ('reflection', 'Keep a little space for surprise'),
]


def write_json(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, indent=2, ensure_ascii=False))
    tmp.replace(path)


def run(args):
    result = subprocess.run([str(a) for a in args], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(result.stderr[-2500:])
    return result.stdout


def request(url, payload=None):
    data = None if payload is None else json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=600) as response:
        return json.load(response)


def validate(script):
    if not isinstance(script, dict) or not isinstance(script.get('title'), str):
        raise ValueError('Script needs a title')
    if not 1 <= len(script['title']) <= 100:
        raise ValueError('Title too long')
    scenes = script.get('scenes')
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= 10:
        raise ValueError('Use 1–10 scenes')
    for scene in scenes:
        for key in ('narration', 'caption'):
            if not isinstance(scene.get(key), str) or not scene[key].strip():
                raise ValueError('Missing scene text: ' + key)
        if len(scene['narration']) > 400:
            raise ValueError('Narration exceeds 400 characters')
        if len(scene['caption']) > 90:
            raise ValueError('Caption exceeds 90 characters')
    return script


def generate(args, genre, topic):
    prompt = f'''Write an original {genre} vertical video about: {topic}.
Return only JSON: {{"title":"short title","scenes":[{{"narration":"spoken words","caption":"short headline","image_prompt":"visual description without text"}}]}}.
Exactly 4 scenes, each narration 12–22 words, each caption 3–9 words and under 90 characters.
Use a compelling opening and satisfying ending, simple natural English, no hashtags, no emojis.
Fiction must be clearly fictional. Reflections are gentle invitations, never medical advice or factual promises.
No quotes attributed to real people, factual trivia, brands, or copyrighted characters.'''
    last = None
    for attempt in range(3):
        result = request('http://127.0.0.1:11434/api/generate', {
            'model': args.model, 'prompt': prompt, 'format': 'json', 'stream': False,
            'keep_alive': 0, 'options': {'temperature': 0.8, 'num_predict': 1000}})
        try:
            return validate(json.loads(result['response']))
        except (ValueError, KeyError, TypeError) as error:
            last = error
            prompt += '\nPrevious response failed validation: ' + str(error)
    raise ValueError(f'Script failed after three attempts: {last}')


def font(size, bold=False):
    path = os.getenv('REEL_FONT', '/System/Library/Fonts/Supplemental/Arial' + (' Bold' if bold else '') + '.ttf')
    return ImageFont.truetype(path, size)


def wrapped(draw, text, face, width):
    lines = []
    current = ''
    for word in text.split():
        test = (current + ' ' + word).strip()
        if draw.textlength(test, font=face) > width and current:
            lines.append(current)
            current = word
        else:
            current = test
    if current:
        lines.append(current)
    return lines


def artwork(path, seed):
    """Original procedural landscape; no paid service or downloaded stock."""
    rng = random.Random(seed)
    palettes = [((12, 19, 43), (53, 90, 113), '#edbf89'),
                ((29, 16, 48), (103, 58, 98), '#e9a794'),
                ((8, 32, 35), (36, 95, 90), '#dfd39f'),
                ((22, 22, 39), (75, 79, 126), '#b8bced')]
    top, bottom, accent = palettes[seed % len(palettes)]
    im = Image.new('RGB', (1080, 1920))
    d = ImageDraw.Draw(im)
    for y in range(1920):
        t = y / 1919
        d.line((0, y, 1080, y), fill=tuple(int(a*(1-t)+b*t) for a,b in zip(top,bottom)))
    for _ in range(120):
        x,y = rng.randrange(1080), rng.randrange(1100)
        d.ellipse((x,y,x+2,y+2), fill='#a5b2bf')
    x,y = rng.randrange(180,750), rng.randrange(400,700)
    d.ellipse((x,y,x+220,y+220), fill=accent)
    for layer in range(4):
        points = [(0,1920)]
        for x in range(0,1140,60):
            y = 1000 + layer*160 + int(100*math.sin(x/240+seed+layer)) + rng.randrange(-30,30)
            points.append((x,y))
        points.append((1080,1920))
        d.polygon(points, fill=tuple(max(0,c-layer*9) for c in (35,55,65)))
    im.save(path)


def comfy_image(workflow_path, prompt, seed, target):
    """Run a user-supplied local API workflow; never calls a cloud image service."""
    def substitute(value):
        if isinstance(value, dict):
            return {k: substitute(v) for k,v in value.items()}
        if isinstance(value, list):
            return [substitute(v) for v in value]
        if value == '__SEED__':
            return seed
        if isinstance(value, str):
            return value.replace('__PROMPT__', prompt)
        return value
    workflow = substitute(json.loads(workflow_path.read_text()))
    server = 'http://127.0.0.1:8188'
    job = request(server+'/prompt', {'prompt':workflow})['prompt_id']
    deadline = time.monotonic()+900
    while time.monotonic()<deadline:
        history = request(server+'/history/'+job).get(job)
        if history:
            if history.get('status',{}).get('status_str')=='error':
                raise RuntimeError('ComfyUI workflow failed; inspect the local ComfyUI log')
            for output in history.get('outputs',{}).values():
                for item in output.get('images',[]):
                    query = urllib.parse.urlencode({k:item[k] for k in ('filename','subfolder','type') if k in item})
                    with urllib.request.urlopen(server+'/view?'+query,timeout=60) as response:
                        data=response.read()
                    temp=target.with_suffix('.download')
                    temp.write_bytes(data)
                    with Image.open(temp) as im:
                        im.convert('RGB').save(target)
                    temp.unlink()
                    return
        time.sleep(2)
    raise TimeoutError('ComfyUI image job exceeded 15 minutes')


def frame(background, output, caption, genre, index, total):
    im = ImageOps.fit(Image.open(background).convert('RGB'), (1080,1920))
    shade = Image.new('RGBA', im.size, (0,0,0,0))
    d = ImageDraw.Draw(shade)
    d.rectangle((0,0,1080,1920), fill=(0,0,0,35))
    d.rounded_rectangle((64,680,1016,1240), radius=35, fill=(8,14,25,205))
    im = Image.alpha_composite(im.convert('RGBA'),shade)
    d = ImageDraw.Draw(im)
    d.text((80,165), genre.upper(), font=font(27,True), fill='#eacfa8')
    face = font(66,True)
    lines = wrapped(d,caption,face,820)
    if len(lines)>5 or any(d.textlength(line,font=face)>820 for line in lines):
        raise ValueError('Caption does not fit the safe area')
    y = 960 - len(lines)*82/2
    for line in lines:
        d.text((540,y+41),line,font=face,fill='white',anchor='mm')
        y += 82
    for n in range(total):
        x = 80+n*920/total
        d.rounded_rectangle((x,1740,x+920/total-12,1746),radius=3,fill='#eacfa8' if n<=index else '#52606d')
    im.convert('RGB').save(output)


def probe(path):
    return json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',path]))


def gallery(output):
    cards = []
    for folder in sorted(output.iterdir()):
        if not folder.is_dir() or not (folder/'reel.mp4').exists():
            continue
        script = json.loads((folder/'script.json').read_text())
        title = html.escape(script['title'])
        cards.append(f'<article><video controls preload="none" poster="{folder.name}/thumbnail.jpg" src="{folder.name}/reel.mp4"></video><h2>{title}</h2><a href="{folder.name}/reel.mp4" download>Download MP4</a> · <a href="{folder.name}/script.json">Script</a></article>')
    (output/'index.html').write_text('''<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Reel Machine · Drafts</title><style>body{background:#11151b;color:#eee;font:16px system-ui;margin:40px}h1{font-size:40px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:24px}article{background:#1e2630;padding:16px;border-radius:16px}video{width:100%;aspect-ratio:9/16;border-radius:8px;background:black}h2{font-size:18px}a{color:#eacfa8}</style><h1>Reel Machine</h1><p>Local drafts · Preview before publishing · Fiction, reflections and creative prompts</p><main>''' + ''.join(cards) + '</main>')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--count',type=int,default=5)
    parser.add_argument('--model',default='qwen2.5:7b')
    parser.add_argument('--voice',default='af_heart')
    parser.add_argument('--provider',choices=['kokoro','google'],default='kokoro')
    parser.add_argument('--output',type=Path,default=ROOT/'output'/'first-5')
    parser.add_argument('--topics',type=Path,help='JSON array of [genre, topic] pairs')
    parser.add_argument('--images',type=Path,help='Optional local image library (PNG/JPG)')
    parser.add_argument('--comfy-workflow',type=Path,help='Local ComfyUI API JSON with __PROMPT__ and __SEED__ placeholders')
    parser.add_argument('--scripts-only',action='store_true')
    parser.add_argument('--render-only',action='store_true',help='Require existing scripts; never invoke Ollama')
    args = parser.parse_args()
    if not 1<=args.count<=1000:
        parser.error('count must be 1–1000')
    if args.images and args.comfy_workflow:
        parser.error('Choose --images or --comfy-workflow')
    for binary in ('ffmpeg','ffprobe'):
        if not shutil.which(binary):
            parser.error(f'Missing {binary}')
    args.output = args.output.resolve()
    args.output.mkdir(parents=True,exist_ok=True)
    lock = (args.output/'.lock').open('w')
    try:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BlockingIOError:
        parser.error('This batch is already running')
    topics = json.loads(args.topics.read_text()) if args.topics else TOPICS
    if not isinstance(topics,list) or any(not isinstance(row,list) and not isinstance(row,tuple) or len(row)!=2 or any(not isinstance(v,str) or not v.strip() for v in row) for row in topics):
        parser.error('Topics must be a JSON array of [genre, topic] string pairs')
    if len({topic.strip().lower() for _,topic in topics}) != len(topics):
        parser.error('Topics must be unique')
    if args.count>len(topics):
        parser.error('Supply enough unique topics with --topics')
    images = sorted(p for p in args.images.iterdir() if p.suffix.lower() in ('.png','.jpg','.jpeg')) if args.images else []
    if args.images and not images:
        parser.error('Image library is empty')
    manifest = {'status':'running','started':time.time(),'reels':[]}
    failures = 0
    # Generate scripts before loading the voice model to reduce shared-memory pressure.
    jobs = []
    for n,(genre,topic) in enumerate(topics[:args.count],1):
        folder = args.output/f'{n:03d}'
        folder.mkdir(exist_ok=True)
        path = folder/'script.json'
        if not path.exists():
            if args.render_only:
                parser.error('Missing script in render-only mode')
            print(f'[{n}/{args.count}] Writing: {topic}',flush=True)
            script = generate(args,genre,topic)
            script.update(genre=genre,topic=topic,status='draft')
            write_json(path,script)
        script=validate(json.loads(path.read_text()))
        if script.get('topic')!=topic or script.get('genre')!=genre:
            parser.error('Existing batch has different topics; choose a new --output directory')
        jobs.append((folder,script))
    if args.scripts_only:
        return
    import soundfile as sf
    tts = None
    if args.provider == 'kokoro':
        from kokoro_mlx import KokoroTTS
        print('Loading local Kokoro model',flush=True)
        tts = KokoroTTS.from_pretrained()
    for n,(folder,script) in enumerate(jobs,1):
        started = time.time()
        try:
            workflow_text = args.comfy_workflow.read_text() if args.comfy_workflow else ''
            signature_data = ['centered-v2',script,args.voice,args.provider,[str(p) + str(p.stat().st_mtime_ns) for p in images]]
            if workflow_text:
                signature_data.append(workflow_text)
            signature = hashlib.sha256(json.dumps(signature_data,sort_keys=True).encode()).hexdigest()
            complete = folder/'complete.json'
            if complete.exists() and (folder/'reel.mp4').exists() and json.loads(complete.read_text()).get('signature')==signature:
                print(f'[{n}/{args.count}] Already complete',flush=True)
                manifest['reels'].append({'id':n,'status':'complete','cached':True})
                continue
            print(f'[{n}/{args.count}] Rendering: {script["title"]}',flush=True)
            clips=[]
            srt=[]
            elapsed=0.0
            def stamp(seconds):
                ms=round(seconds*1000)
                return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
            for i,scene in enumerate(script['scenes']):
                base=folder/f'scene-{i+1}'
                audio=base.with_suffix('.wav')
                key=hashlib.sha256((args.provider+args.voice+scene['narration']).encode()).hexdigest()
                keyfile=base.with_suffix('.voice-key')
                if not audio.exists() or not keyfile.exists() or keyfile.read_text()!=key:
                    if args.provider == 'google':
                        source=base.with_suffix('.source.audio')
                        if not source.exists():
                            raise ValueError('Prepared Gemini narration is missing')
                        run(['ffmpeg','-y','-v','error','-i',source,'-ac','1','-ar','24000',audio])
                    else:
                        tts.save(scene['narration'],audio,voice=args.voice,speed=1.0,sample_rate=24000)
                    keyfile.write_text(key)
                duration=sf.info(audio).duration+0.35
                background=base.with_suffix('.background.png')
                if scene.get('imageAssetId'):
                    background=base.with_suffix('.upload.jpg')
                    if not background.exists():
                        raise ValueError('Uploaded scene image is missing')
                elif images:
                    background=images[((n-1)*4+i)%len(images)]
                elif args.comfy_workflow:
                    image_key=hashlib.sha256((workflow_text+scene['image_prompt']).encode()).hexdigest()
                    image_keyfile=base.with_suffix('.image-key')
                    if not background.exists() or not image_keyfile.exists() or image_keyfile.read_text()!=image_key:
                        comfy_image(args.comfy_workflow,scene['image_prompt'],n*13+i,background)
                        image_keyfile.write_text(image_key)
                else:
                    artwork(background,n*13+i)
                still=base.with_suffix('.png')
                frame(background,still,scene['caption'],script['genre'],i,len(script['scenes']))
                if i==0:
                    Image.open(still).resize((540,960)).convert('RGB').save(folder/'thumbnail.jpg')
                clip=base.with_suffix('.mp4')
                run(['ffmpeg','-y','-v','error','-loop','1','-framerate','24','-i',still,'-i',audio,
                     '-t',str(duration),'-vf',"scale=1120:1992,crop=1080:1920:x='20+10*sin(t/3)':y=36,format=yuv420p",
                     '-af','apad=pad_dur=0.35','-c:v','libx264','-preset','ultrafast','-crf','24','-threads','2',
                     '-c:a','aac','-b:a','128k','-ar','48000',clip])
                clips.append(clip)
                srt.append(f'{i+1}\n{stamp(elapsed)} --> {stamp(elapsed+duration)}\n{scene["narration"]}\n')
                elapsed+=duration
            (folder/'captions.srt').write_text('\n'.join(srt))
            listing=folder/'clips.txt'
            listing.write_text(''.join(f"file '{p.name}'\n" for p in clips))
            tmp=folder/'reel.partial.mp4'
            run(['ffmpeg','-y','-v','error','-f','concat','-safe','1','-i',listing,'-c','copy','-movflags','+faststart',tmp])
            metadata=probe(tmp)
            video=next(s for s in metadata['streams'] if s['codec_type']=='video')
            assert video['width']==1080 and video['height']==1920
            assert any(s['codec_type']=='audio' for s in metadata['streams'])
            assert abs(float(metadata['format']['duration'])-elapsed)<2
            tmp.replace(folder/'reel.mp4')
            write_json(complete,{'signature':signature,'seconds':round(time.time()-started,2),'duration':elapsed,'status':'draft'})
            for clip in clips:
                clip.unlink()
            manifest['reels'].append({'id':n,'status':'complete'})
            gallery(args.output)
        except Exception as error:
            failures+=1
            manifest['reels'].append({'id':n,'status':'failed','error':str(error)})
            print(f'Reel {n} failed: {error}',flush=True)
        write_json(args.output/'batch.json',manifest)
    manifest.update(status='failed' if failures else 'complete',finished=time.time())
    write_json(args.output/'batch.json',manifest)
    gallery(args.output)
    print(f'Gallery: {args.output / "index.html"}',flush=True)
    if failures:
        sys.exit(1)


if __name__=='__main__':
    main()

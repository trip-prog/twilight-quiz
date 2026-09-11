"""Create the quiz clips from the recorded source and its Russian audio.

Run: python tools/prepare_media.py
Requires .work/source.json (yt-dlp metadata) and .work/saga-audio.m4a.
Existing completed clips are retained. Source media stays outside the site.
"""
import concurrent.futures, json, subprocess, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
questions = json.loads((root/'questions.json').read_text(encoding='utf-8'))
source = json.loads((root/'.work/source.json').read_text(encoding='utf-8'))
video_url = next(f['url'] for f in source['formats'] if f['format_id'] == 'dash_sep-5')
agent = source['http_headers']['User-Agent']
candidates = {r['id']: r for r in json.loads((root/'.work/candidates.json').read_text(encoding='utf-8'))}
if len(sys.argv)>1: questions=[q for q in questions if q['film'] in list(map(int,sys.argv[1:]))]


def render(q):
    full = root/q['video'].removeprefix('./')
    ranges = [(q['video'], q['source']['start'], q['source']['end'])]
    if q.get('intro'):
        ranges.append((q['intro'], q['source']['introStart'], q['source']['introEnd']))
    for path, start, end in ranges:
        target = root/path.removeprefix('./')
        if target.exists():
            continue
        temporary = target.with_suffix('.partial.mp4')
        candidate = root/'.work/candidates'/f"{q['id']}.mp4"
        if target == full and candidate.exists():
            c = candidates[q['id']]
            offset = start - (source['chapters'][c['film']-1]['start_time'] + c['start'])
            assert offset >= 0 and end-start+offset <= c['end']-c['start']+.05, q['id']
            inputs = ['-ss',str(round(offset,3)),'-i',str(candidate),'-map','0:v:0','-map','0:a:0']
        elif target == full:
            inputs = ['-rw_timeout','30000000','-ss',str(start),'-user_agent',agent,'-i',video_url,'-ss',str(start),'-i',str(root/'.work/saga-audio.m4a'),'-map','0:v:0','-map','1:a:0']
        else:
            inputs = ['-ss',str(round(start-q['source']['start'],3)),'-i',str(full),'-map','0:v:0','-map','0:a:0']
        command = ['ffmpeg','-hide_banner','-loglevel','error','-y',*inputs,'-t',str(round(end-start,3)),'-vf',"scale=w='min(960,iw)':h='min(540,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",'-r','25','-c:v','libx264','-preset','fast','-crf','24','-pix_fmt','yuv420p','-threads','2','-c:a','aac','-b:a','96k','-ar','48000','-movflags','+faststart',str(temporary)]
        result = subprocess.run(command,capture_output=True,timeout=180)
        if result.returncode:
            raise RuntimeError(q['id']+': '+result.stderr.decode(errors='replace').replace(video_url,'[source video]')[-1200:])
        temporary.replace(target)
    poster = root/q['poster'].removeprefix('./')
    if not poster.exists():
        clip = root/q.get('intro',q['video']).removeprefix('./')
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss','0.25','-i',str(clip),'-frames:v','1','-vf','scale=960:-2','-q:v','3',str(poster)],check=True)
    return q['id']


with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    for i,name in enumerate(pool.map(render,questions),1):
        print(f'{i}/{len(questions)} {name}',flush=True)


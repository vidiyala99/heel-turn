# Final submission cut: true order, continuous takes. Run from docs/video/final: python build.py
import json, subprocess, sys, os
FF = r'C:/Users/aakas/Tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe'
FP = FF.replace('ffmpeg.exe', 'ffprobe.exe')
RAW = '../raw'; CL = '../clips'; MUS = '../../../voice/assets/music/menu-loop.mp3'
ENC = '-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 48000 -ac 2'.split()
def run(a): subprocess.run([FF, '-v', 'error', '-y'] + a, check=True)
def dur(f): return float(subprocess.check_output([FP, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).decode().strip())
caps = {}
def cap(k, t): open(f'cap{k}.txt', 'w', encoding='utf-8').write(t); caps[k] = 1
def DT(k, size=56, y='h-th-170'):
    return f"drawtext=fontfile=impact.ttf:textfile=cap{k}.txt:fontsize={size}:fontcolor=white:box=1:boxcolor=black@0.85:boxborderw=16:line_spacing=10:x=(w-tw)/2:y={y}"
def seg(out, take, a, b, sp=1.0, c=None, cs=None, ce=None, y='h-th-170'):
    """a,b in seconds of take time; caption c shown from cs..ce (output seconds)"""
    vf = f'scale=1920:1080,fps=30,setpts=(PTS-STARTPTS)/{sp}'
    if c: vf += ',' + DT(c, y=y) + (f":enable='between(t,{cs},{ce})'" if cs is not None else '')
    run(['-ss', f'{a:.3f}', '-t', f'{b-a:.3f}', '-i', f'{RAW}/{take}-0.webm', '-ss', f'{a:.3f}', '-t', f'{b-a:.3f}', '-i', f'{RAW}/{take}-0-audio.wav',
         '-map', '0:v', '-map', '1:a', '-vf', vf, '-af', f'asetpts=PTS-STARTPTS,atempo={sp},aresample=48000,apad', '-shortest'] + ENC + [out])
plan = json.load(open('plan.json', encoding='utf-8'))
for k, t in plan['caps'].items(): cap(k, t)
parts = []
for i, s in enumerate(plan['segs']):
    out = f'p{i:02d}.mp4'
    if s['take'] == 'clip':
        vf = f"scale=1920:1080,fps=30,setpts=PTS-STARTPTS" + ((',' + DT(s['c'])) if s.get('c') else '')
        run(['-ss', str(s['a']), '-t', str(s['b'] - s['a']), '-i', f"{CL}/{s['f']}", '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-map', '0:v', '-map', '1:a', '-vf', vf, '-shortest'] + ENC + [out])
    elif s['take'] == 'card':
        run(['-f', 'lavfi', '-i', f"color=c=0x0b0b0f:s=1920x1080:r=30:d={s['d']}", '-f', 'lavfi', '-i', 'anullsrc=r=48000:cl=stereo', '-t', str(s['d']), '-vf', DT(s['c'], 80, '(h-th)/2')] + ENC + [out])
    else:
        seg(out, s['take'], s['a'], s['b'], s.get('sp', 1.0), s.get('c'), s.get('cs'), s.get('ce'), s.get('y', 'h-th-170'))
    parts.append(out); print(out, round(dur(out), 2), flush=True)
open('list.txt', 'w').write(''.join(f"file '{p}'\n" for p in parts))
run(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'body.mp4'])
D = dur('body.mp4'); T = plan['teaser']; O = D - plan['outro']
# music only under cold open [0,T] and outro [O,D]
vol = f"volume='if(lt(t,{T}),0.5,if(gt(t,{O}),0.5,0))':eval=frame"
fc = f"[1:a]aresample=48000,atrim=0:{D},{vol},afade=t=out:st={D-2}:d=2[m];[0:a][m]amix=inputs=2:duration=first:normalize=0[mx]"
r = subprocess.run([FF, '-hide_banner', '-i', 'body.mp4', '-stream_loop', '-1', '-i', MUS, '-filter_complex', fc + ';[mx]loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json[a]', '-map', '[a]', '-f', 'null', 'NUL'], capture_output=True, text=True).stderr
j = json.loads(r[r.rindex('{'):r.rindex('}') + 1])
ln = f"loudnorm=I=-16:TP=-1.5:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true"
run(['-i', 'body.mp4', '-stream_loop', '-1', '-i', MUS, '-filter_complex', fc + f';[mx]{ln},aresample=48000[a]', '-map', '0:v', '-map', '[a]',
     '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', '30', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '../heel-turn-final.mp4'])
print('DONE', dur('../heel-turn-final.mp4'))

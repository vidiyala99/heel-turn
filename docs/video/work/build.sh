set -e
FF=/c/Users/aakas/Tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffmpeg
C=../clips
N="-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -ar 48000 -ac 2"
cap(){ printf '%b' "$2" > cap$1.txt; }
DT(){ echo "drawtext=fontfile=impact.ttf:textfile=cap$1.txt:fontsize=${2:-64}:fontcolor=white:box=1:boxcolor=black@0.85:boxborderw=18:line_spacing=10:x=(w-tw)/2:y=${3:-h-th-190}"; }
seg(){ # id clip ss dur speed capid
  id=$1; f=$2; ss=$3; d=$4; sp=$5; vf="scale=1920:1080,fps=30,setpts=(PTS-STARTPTS)/$sp"
  [ -n "$6" ] && vf="$vf,$(DT $6)"
  $FF -v error -y -ss $ss -t $d -i $C/$f.mp4 -vf "$vf" -af "asetpts=PTS-STARTPTS,atempo=$sp,aresample=48000" $N s$id.mp4
}
card(){ # id dur capid size
  $FF -v error -y -f lavfi -i color=c=0x0b0b0f:s=1920x1080:r=30:d=$2 -f lavfi -i anullsrc=r=48000:cl=stereo -t $2 -vf "$(DT $3 $4 '(h-th)/2')" $N s$1.mp4
}
cap A "AI WRESTLERS THAT REMEMBER\nHOW YOU FIGHT"
cap T "HEEL TURN"
cap F "Every opponent is an LLM agent.\nIt reads your habits."
cap P "It cuts promos from your real stats"
cap B "The commentators are agents too."
cap O "Agents ally. Agents betray."
cap V "You approve or block."
cap J "Track 02: 2 humans + AI in one ring"
cap R "Bruin: every match becomes checked memory\n80 checks green"
cap L "What the AI learned"
cap M "Memory on vs off, 32,000 matches"
cap D "BAND: every wrestler is an agent\nin its own room"
cap Z "HEEL TURN\n\ngithub.com/vidiyala99/heel-turn\n\nBruin · BAND · Runware · AdaL"
seg 01 06-over-the-top 16.5 6 1 A &
seg 02 02-entrance 0 9 1 &
seg 03 02-entrance 10 3 1 &
card 04 1.5 T 180 &
seg 05 04-fight 2 13 1.2 F &
seg 06 03-promo 0 7.8 1 P &
wait
seg 07 05-booth 0 10 1 B &
seg 08 06-over-the-top 0 7.5 1.15 O &
seg 09 06-over-the-top 10.5 7.5 1 V &
seg 10 08-invite-join 3.5 4.5 1 J &
seg 11 09-bruin-run 6 3 1 R &
seg 12 07-results 5 4 1 L &
seg 13 10-learning-chart 6 4 1 M &
card 14 2.5 D 80 &
card 15 7 Z 90 &
wait
ls s*.mp4 | sed "s/.*/file '&'/" > list.txt
$FF -v error -y -f concat -safe 0 -i list.txt -c copy body.mp4
D=$(/c/Users/aakas/Tools/ffmpeg/ffmpeg-9.0.2-essentials_build/bin/ffprobe -v error -show_entries format=duration -of csv=p=0 body.mp4)
$FF -v error -y -i body.mp4 -stream_loop -1 -i ../../../voice/assets/music/menu-loop.mp3 -filter_complex "[0:a]asplit=2[dia][sc];[1:a]aresample=48000,volume=0.55,atrim=0:$D,afade=t=out:st=$(python -c "print($D-2)"):d=2[mus];[mus][sc]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[duck];[dia][duck]amix=inputs=2:duration=first:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000[a]" -map 0:v -map "[a]" -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 30 -c:a aac -b:a 192k -movflags +faststart ../heel-turn-demo-90s.mp4
echo DONE $D

#!/bin/sh
# Generates the demo and benchmark audio. Needs macOS `say` and ffmpeg.
# Files land in apps/bench/public/audio; the site symlinks the ones it uses.
set -e
cd "$(dirname "$0")/.."
OUT=apps/bench/public/audio
TMP=$(mktemp -d)
mkdir -p "$OUT" apps/site/public/audio

# A two-person interview with deliberately long pauses, for the edit-review demo.
if [ ! -f "$OUT/interview.mp3" ]; then
  i=0
  line() { # voice, pause-after (s), text
    i=$((i + 1))
    say -v "$1" -o "$TMP/l$i.aiff" "$3"
    ffmpeg -v error -i "$TMP/l$i.aiff" -af "apad=pad_dur=$2" -ar 44100 -ac 2 "$TMP/l$i.wav"
    echo "file 'l$i.wav'" >> "$TMP/list.txt"
  }
  line Samantha 0.4 "So you've been recording people for, what, twenty years now?"
  line Daniel 2.6 "Twenty two. I started with a cassette deck my uncle left in the garage."
  line Samantha 0.3 "And what changed, in that time?"
  line Daniel 3.1 "Honestly? Less than you'd think."
  line Daniel 0.5 "The microphones got better. The rooms didn't. People still pause before they say the true thing."
  line Samantha 2.2 "That's a lovely way to put it."
  line Daniel 0.4 "Editors cut those pauses first. I think that's usually a mistake."
  line Samantha 2.8 "Even the long ones?"
  line Daniel 0.4 "Some of them. You learn which silences are thinking, and which are just waiting."
  line Samantha 0.3 "Can a machine tell the difference?"
  line Daniel 3.4 "It can find them. Deciding is still your job."
  ffmpeg -v error -f concat -safe 0 -i "$TMP/list.txt" -c:a libmp3lame -b:a 128k "$OUT/interview.mp3"
fi

# The music: a Strudel pattern (scripts/strudel/loop.strudel.js), played in
# headless Chromium and captured. Needs network once, for the drum samples.
[ -f "$OUT/loop.mp3" ] || node scripts/strudel/render.mjs loop 32
[ -f "$OUT/avril.mp3" ] || node scripts/strudel/render.mjs avril 120

# Speech for the regions demo: JFK at Rice University, 1962 (public domain, JFK
# Presidential Library via Wikimedia Commons). "There is no strife…" through
# "…and the others, too", with the tape hiss reduced so the pauses read as pauses.
if [ ! -f "$OUT/moon.mp3" ]; then
  curl -sL -A "sillon-site" -o "$TMP/rice.ogg" "https://upload.wikimedia.org/wikipedia/commons/5/50/Jfk_rice_university_we_choose_to_go_to_the_moon.ogg"
  ffmpeg -v error -y -ss 481.8 -t 79.4 -i "$TMP/rice.ogg" -ac 1 \
    -af "highpass=f=90,lowpass=f=7500,afftdn=nr=18:nf=-28:tn=1,loudnorm=I=-16:TP=-1.5,afade=t=in:d=0.3,afade=t=out:st=78.6:d=0.8" \
    -ar 44100 -c:a libmp3lame -b:a 128k "$OUT/moon.mp3"
fi

# An hour with structure (spoken chapters drifting in level, music between
# them), so the hero's hour-long waveform has a shape. Same encoding as the
# benchmark files, but the published numbers come from podcast-60m.
if [ ! -f "$OUT/hour.mp3" ]; then
  set -- \
    Samantha "Every recording starts as a groove. On a record it's cut into lacquer, a single spiral line that holds every sound in the room. A waveform is the same idea, drawn flat: time running left to right, loudness rising from the middle." \
    Daniel "Most of what you hear in a long conversation is quiet. Breath, the hum of a room, someone thinking before they answer. The loud parts are rare, and they're where the eye goes first." \
    Karen "Editors read waveforms the way musicians read scores. A gap means a pause. A dense block means someone talking fast. A sudden spike is a laugh, a door, a microphone knocked by a sleeve." \
    Moira "An hour of audio is a few hundred megabytes of samples once it's decoded. You don't need any of that to draw it. You need one number per bar, and you need it now, not when the download finishes." \
    Tessa "So decode it as it arrives. Frame by frame, in the background, keeping only the loudest sample in each little bucket. The picture fills in from the left while the rest of the file is still on the wire." \
    Daniel "And then let the page decide how it looks. Bars or grooves, ink or gradient, light or glow. The shape is the data. Everything else is style."
  n=0; inputs="-i $OUT/loop.mp3"
  while [ $# -gt 0 ]; do
    n=$((n + 1)); say -v "$1" -o "$TMP/c$n.aiff" "$2"; shift 2
    inputs="$inputs -stream_loop -1 -i $TMP/c$n.aiff"
  done
  f=""; cat=""
  for c in 1 2 3 4 5 6; do
    # Slow, chapter-specific swells, so the hour reads as hills rather than a wall.
    f="$f[$c:a]atrim=0:564,aresample=44100,aformat=channel_layouts=stereo,volume='0.22+0.7*pow(0.5+0.5*sin(2*PI*t/$((90 + c * 23))+$c),1.6)*(0.75+0.25*sin(2*PI*t/41))':eval=frame[s$c];"
    f="$f[0:a]atrim=0:30,asetpts=N/SR/TB,volume=$(echo "0.55 0.8 0.65 0.95 0.7 0.85 1" | cut -d' ' -f$c)[m$c];"
    cat="$cat[m$c][s$c]"
  done
  f="$f[0:a]atrim=0:30,asetpts=N/SR/TB[m7];${cat}[m7]concat=n=13:v=0:a=1,alimiter=limit=0.97[out]"
  ffmpeg -v error $inputs -filter_complex "$f" -map "[out]" -t 3600 -ac 2 -c:a libmp3lame -b:a 128k "$OUT/hour.mp3"
fi

# Long speech for the decode benchmarks. The originals were made the same way.
for m in 5 60 180; do
  [ -f "$OUT/podcast-${m}m.mp3" ] && continue
  say -v Samantha -o "$TMP/talk.aiff" -f README.md 2>/dev/null || say -v Samantha -o "$TMP/talk.aiff" "This is a long recording used to benchmark waveform decoding."
  ffmpeg -v error -stream_loop -1 -i "$TMP/talk.aiff" -t $((m * 60)) -ar 44100 -ac 2 -c:a libmp3lame -b:a 128k "$OUT/podcast-${m}m.mp3"
done

for f in hour moon avril; do ln -sf "../../../bench/public/audio/$f.mp3" "apps/site/public/audio/$f.mp3"; done
rm -rf "$TMP"
ls -lh "$OUT"

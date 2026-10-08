#!/usr/bin/env bash
# Downloads and re-encodes the instrument samples into public/samples/<instrument>/<midi>.mp3.
# Sources & licences (see README "Credits"):
#   piano  : Salamander Grand Piano V3 by Alexander Holm — CC BY 3.0 (files via github.com/Tonejs/audio/salamander)
#   nylon, steel, rhodes, pad, synth, bass : FluidR3_GM soundfont by Frank Wen, rendered by gleitz/midi-js-soundfonts — CC BY 3.0
#   electric (Metal guitar): MusyngKite electric_guitar_clean — real electric-guitar samples; high-gain amp/cab
#     is applied live in src/ui/audio.ts (FluidR3 distortion_guitar was too synth-like / tinny).
# Each sample is trimmed, faded out and encoded as 44.1 kHz MP3 (decodable by iOS Safari).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/samples
TMP=$(mktemp -d)
NAMES_SHARP=(C Cs D Ds E F Fs G Gs A As B)
NAMES_FLAT=(C Db D Eb E F Gb G Ab A Bb B)
note() { local m=$1 style=$2; local pc=$((m % 12)) oct=$((m / 12 - 1)); if [ "$style" = sharp ]; then echo "${NAMES_SHARP[$pc]}${oct}"; else echo "${NAMES_FLAT[$pc]}${oct}"; fi; }
enc() { # in out seconds fade bitrate channels
  ffmpeg -nostdin -v error -y -i "$1" -af "silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.003,atrim=0:$3,afade=t=out:st=$(awk "BEGIN{print $3 - $4}"):d=$4" -ar 44100 -ac "$6" -c:a libmp3lame -b:a "$5" "$2"
}
fetch() { # instrument url-prefix style from to step seconds fade bitrate channels
  local inst=$1 prefix=$2 style=$3 from=$4 to=$5 step=$6 secs=$7 fade=$8 br=$9 ch=${10}
  mkdir -p "$OUT/$inst"
  for ((m = from; m <= to; m += step)); do
    local n; n=$(note "$m" "$style")
    curl -sfL "$prefix/$n.mp3" -o "$TMP/$inst-$m.mp3"
    enc "$TMP/$inst-$m.mp3" "$OUT/$inst/$m.mp3" "$secs" "$fade" "$br" "$ch"
  done
}
# piano: A1 (33) .. C7 (96) every minor third; low notes keep a longer tail
fetch piano https://tonejs.github.io/audio/salamander sharp 33 57 3 6 1.5 96k 2
fetch piano https://tonejs.github.io/audio/salamander sharp 60 96 3 4.5 1.2 96k 2
FL=https://gleitz.github.io/midi-js-soundfonts/FluidR3_GM
MK=https://gleitz.github.io/midi-js-soundfonts/MusyngKite
fetch nylon    $FL/acoustic_guitar_nylon-mp3 flat 40 85 3 3 0.8 80k 1
fetch steel    $FL/acoustic_guitar_steel-mp3 flat 40 85 3 3 0.8 80k 1
# Clean electric guitar → live amp/cab in audio.ts (sounds like a guitar, not a synth lead).
fetch electric $MK/electric_guitar_clean-mp3 flat 40 85 3 2.8 0.8 96k 1
fetch rhodes   $FL/electric_piano_1-mp3      flat 36 90 3 3 0.8 80k 1
fetch pad      $FL/pad_2_warm-mp3            flat 36 84 3 3 1.0 72k 1
fetch synth    $FL/lead_2_sawtooth-mp3       flat 36 90 3 2.8 0.8 80k 1
fetch bass     $FL/acoustic_bass-mp3         flat 28 55 3 2.5 0.8 80k 1
rm -rf "$TMP"
du -sh "$OUT" "$OUT"/*

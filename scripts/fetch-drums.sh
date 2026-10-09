#!/usr/bin/env bash
# Extract FluidR3 GM Power-kit drum one-shots into public/samples/drums/<gmNote>.mp3.
# Source: FluidR3_GM.sf2 (Frank Wen) via surikov/webaudiofontdata renders — CC BY 3.0.
# Bank 16 = Power kit (acoustic body; distinct acoustic/electric kick variants).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/samples/drums
BANK=16
NOTES=(35 36 37 38 41 42 43 44 45 46 47 48 49 50 51 53 55 57)
mkdir -p "$OUT"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

for midi in "${NOTES[@]}"; do
  url="https://surikov.github.io/webaudiofontdata/sound/128${midi}_${BANK}_FluidR3_GM_sf2_file.js"
  js="$TMP/$midi.js"
  curl -sfL "$url" -o "$js"
  node -e "
    const fs = require('fs');
    const js = fs.readFileSync(process.argv[1], 'utf8');
    const m = js.match(/,file:'([^']+)'/);
    if (!m) { console.error('no sample in', process.argv[1]); process.exit(1); }
    fs.writeFileSync(process.argv[2], Buffer.from(m[1], 'base64'));
  " "$js" "$TMP/$midi.raw.mp3"
  ffmpeg -nostdin -v error -y -i "$TMP/$midi.raw.mp3" \
    -af "loudnorm=I=-16:LRA=11:TP=-1.5" -ar 44100 -ac 1 -c:a libmp3lame -b:a 96k \
    "$OUT/$midi.mp3"
  echo "drums/$midi.mp3"
done
du -sh "$OUT"

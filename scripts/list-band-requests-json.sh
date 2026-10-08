#!/usr/bin/env bash
# Parse a muse.bandRequests JSON dump (file arg or stdin) into agent-ready rows.
# Usage:
#   ./scripts/list-band-requests-json.sh dump.json
#   pbpaste | ./scripts/list-band-requests-json.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILE="${1:-}"
if [[ -n "$FILE" ]]; then
  exec npx --yes tsx -e "
import { readFileSync } from 'fs';
import { parseBandRequestEntries, artistLensAgentPrompt } from '${ROOT}/src/core/artistRequest.ts';
const raw = JSON.parse(readFileSync(process.argv[1], 'utf8'));
const reqs = parseBandRequestEntries(raw);
for (const r of reqs) {
  console.log(JSON.stringify({ ...r, prompt: artistLensAgentPrompt(r) }));
}
if (!reqs.length) console.error('No real band requests in dump.');
" "$FILE"
else
  exec npx --yes tsx -e "
import { readFileSync } from 'fs';
import { parseBandRequestEntries, artistLensAgentPrompt } from '${ROOT}/src/core/artistRequest.ts';
const raw = JSON.parse(readFileSync(0, 'utf8') || '[]');
const reqs = parseBandRequestEntries(raw);
for (const r of reqs) {
  console.log(JSON.stringify({ ...r, prompt: artistLensAgentPrompt(r) }));
}
if (!reqs.length) console.error('No real band requests in dump.');
"
fi

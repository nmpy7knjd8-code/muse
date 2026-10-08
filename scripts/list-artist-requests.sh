#!/usr/bin/env bash
# List open GitHub Artist Lens band-request issues (title prefix).
# Filters obvious smoke-test titles. Full parse: parseArtistLensIssue in src/core/artistRequest.ts.
set -euo pipefail
gh issue list --state open --limit 50 --json number,title,body,url \
  --jq '[.[] | select(.title | test("^Artist Lens request:"; "i"))
        | select(.title | test("PIPELINE-SMOKE|SMOKE-TEST"; "i") | not)
        | {number, title, url, body}]'

# 24 · Progress map (theory tree)

## Thesis
A visual "theory tree" of what you've used and heard (cadences, modes, borrowed chords), and what's next.

## Critique
- **Educator:**
  - Visible progress motivates (Yousician missions, Hooktheory levels). But a tree of jargon ("Neapolitan", "secondary dominant") intimidates a non-theory user. Show plain names, and reveal the theory name only once the node is done (as in "Your theory").
  - Progress must come from *doing* (bars, ear games, missions), not from reading.
  - Use prerequisites (cadences before deceptive; home notes before bass), because scaffolding matters.
- **Design:**
  - No scores, XP or percentages (Garrett's number-free preference). Use node states: done ★, next ●, later ○. Branch bars are number-free.
  - Nodes must be actionable: tapping "next" opens the exact tool or tab.
- **Data:** it must aggregate existing local stores without new tracking servers (offline):
  - `muse.concepts` (#10)
  - `muse.missions` (#9)
  - `muse.gym` (#1–#7)
  - `muse.ear` (mood trainer)
  - modes you've written in (a new small store, `muse.modesUsed`, recorded when the session key changes and bars exist)
- **Mobile:** use a vertical list of four branches, not a sprawling canvas. A canvas tree would need pinch-zoom at 390px.

## Synthesis
- **"Your progress" drawer entry** (Practice group). Four branches: **Hearing**, **Building blocks**, **Writing moves**, **Colours (modes)**. Each has 4–7 nodes with done/next/later states, plain names, and a number-free branch bar.
- **"Next up" card** on top: the first unlocked, unfinished node, with a Go button (opens the tool and tab via `openTool` plus a stored tab).
- **Core:** `progressMap(stores)` is pure and unit-tested.

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-5/)
- **Checked** with seeded stores (concepts authentic + seventh, the loop4 mission, Ear gym 1·3·5 items) and C-major bars:
  - Five nodes are done.
  - "Next up" picks the least-explored branch (Hearing → "Hear moods in chords"), and **Go** opened the Mood ear trainer.
  - `muse.modesUsed` recorded "major" from the session.
- **Found:**
  - "it's called Strong landing (authentic cadence)" read clumsily.
  - "Unlocks after the step above" was wrong when the prerequisite wasn't the row directly above (Lydian needs "Rock swagger").
- **Fixed:**
  - It now reads: You did it — the theory name is "authentic cadence".
  - Locked nodes name their prerequisite ("Unlocks after "Rock swagger"").
- No numbers, scores or XP (number-free bars only). 0 sideways scroll, no console errors.

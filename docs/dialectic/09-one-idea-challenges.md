# 9 · One-idea challenges (missions)

## Thesis
A list of missions like "make it sound unfinished" and "borrow one sad chord". Each is checked automatically against your bars.

## Critique
- **Educator:**
  - Gamification helps beginners but feels patronising when it's points-driven (DSP Academy's review of Yousician). Keep it to a check mark and one sentence of "what you just learned".
  - Missions must be achievable with the Write tab's existing palette. Otherwise they become tests of knowledge.
- **Coherence:** "borrow a sad chord" assumes a major key. In minor the mirror is "borrow a bright chord". Missions must be mode-aware.
- **UX:**
  - The checking must be live: as soon as your bars meet the goal, the mission ticks. That needs to work while the drawer is closed.
  - Don't nag. No popups for missions you didn't pick.
- **Mobile:** a short list, with one "active" mission shown under the Lessons header.

## Synthesis
- **Missions:** 8, phrased by mode family:
  - unfinished ending
  - feel finished (strong approach to home)
  - borrow a sad chord (major) / a bright chord (minor)
  - sus that resolves
  - secondary dominant
  - add a 7th
  - return home twice
  - a 4-chord loop with no repeats
- **Checking:** each mission has a checker over the live bars and key. The tool shows ✓ or "not yet" with a hint, plus "Try it on my bars" (closes the drawer).
- **Completion:** stored in `muse.missions`. The #10 toast fires for the concept when it happens.

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-2/)
- **Checked:**
  - Bars C G Am immediately tick "Make it sound unfinished". Expanding a mission shows the hint or what you learned.
  - Completion persists in `muse.missions`.
  - Minor keys show "Borrow one bright chord" (unit test).
- **Post-build fix:** moved the completion save out of render into an effect, so there are no side effects during render.

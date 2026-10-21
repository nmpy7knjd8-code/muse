# Dialectic design log

Each feature has a file with four parts:
1. **Thesis**: the first design.
2. **Critique**: an adversarial review, written as a separate pass in three voices: a sceptical music educator, a UX designer, and a mobile designer.
3. **Synthesis**: the revised design that was built.
4. **Post-build review**: checked against the live build (Playwright at 390px and desktop), with any fixes.

The critic was emulated in a separate written pass on the box. No external reviewer was used.

Shared wave-1 decision (from the critiques of #1–#7): the seven hearing ideas ship as **one drawer tool, "Ear gym"**, with five games and one shared adaptive engine (#4, #5). They do not get seven new menu rows. The mobile Write view is unchanged.

Wave 2 shared decision: ideas #8, #9, #12 and #13 live in **one drawer tool, "Lessons"** (tabs: Fix it · Missions · Your theory · Key slide · Mode morph). Ideas #10 and #11 are cross-cutting:
- #10 is a once-per-idea toast on Write plus the "Your theory" tab.
- #11 is a toggle that tints the Roman numeral under each bar.

Wave 3 shared decision: ideas #14–#19 share **one drawer tool, "Song helpers"**, with a 3×2 tab grid (Melody coach · Strum · Hooks · Lyrics · Key change · Layers). Six tabs don't fit a one-row segmented control at 390px, which the critique flagged. Every helper previews first and changes your bars only on an explicit button, with undo.

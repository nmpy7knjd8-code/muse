# 19 · Arrangement layers

## Thesis
Auto-generate pad, arpeggio and bass parts from your chords; mute or solo each.

## Critique
- **Educator:** it teaches "same chords, different roles" (orchestration basics). Keep it to 3–4 layers with plain role names: "Pad = glue", "Arp = motion", "Bass = foundation", "Pulse = drive".
- **Coherence:**
  - The bass register must follow the guitar tuning's low string (as in the Ear gym).
  - The arp density should follow the Style: busy for EDM, sparse for ballads.
- **UX:**
  - Writing layers into the session would collide with the existing bass lane and parts mixer. Preview-only first is safer.
  - Offer "Put the bass into my bars" because the timeline has a bass lane. This reuses `useBars`, which doesn't set bass, so it was ruled out of scope this wave (stated, not hidden).
- **Mobile:** use toggle chips, not a mixer.

## Synthesis
- **Layers tab:** four toggle chips (Pad, Arp, Bass, Pulse), each with a one-line role, plus "Play layers", which loops your first 4 bars.
- **Generation:** `arrangeLayers()` builds the events. Arp density comes from the Style (`busy`, `medium` or `sparse`), and the bass floor from the tuning.
- **Writing:** preview-only; documented as the closest-feasible version.

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-3/)
- **Checked:** the Pad, Arp, Bass and Pulse chips toggle; "Play layers" and Stop work. The note states preview-only and the tuning-floor bass.
- **Infeasible part (as planned):** writing layers into the session. The closest alternative shipped is preview with mute/solo-style toggles. Writing the bass into the timeline's bass lane is the natural follow-up.
- No overflow at 390px.

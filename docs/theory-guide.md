# Theory guide (drawer › Learn › Theory guide)

Interactive web edition of the Muse theory guide (PDF in progress at /workspace/muse-guide). Content: `src/core/theoryGuide.ts`; UI: `src/ui/tools/TheoryGuideTool.tsx`; tests: `tests/theoryGuide.test.ts`.

- **Chapters:** 14 chapters from beginner to advanced, plus a "How this guide teaches" intro. The intro cites Kodály/Dalcroze/Gordon, JMTP functional ear training, Bruner's spiral, Sweller's worked examples, Roediger & Karpicke's retrieval practice, Paivio/Mayer and real-song practice.
- **In each chapter:**
  - sounds in the current key, played through Muse's offline audio engine with the current instrument
  - one interactive visual: keyboard, tuning-aware fretboard, DEGREE_COLORS step ladder, mode brightness slider, tension curve with a playhead, or function map
  - Try-it deep links (tool + tab)
  - a quiz with feedback
  - sources
- **Where the facts come from:** repo data and docs only — scales.ts, earGym.ts, lessons.ts, songwriting.ts, tunings.ts, styleProfiles.ts, research/tension/tension_report.md and docs/style-coherence.md.
- **Progress:** stored in `muse.guide` as {read, quiz bitmask}. A chapter counts as done once it is read and every quiz question has been answered correctly. Your progress shows this as a "Theory guide" branch with 5 milestones.
- **Synced** with Muse-Theory-Guide.pdf (src/content.py): ledes, listen-first prompts, worked examples, takeaways and the 4 recall questions per chapter (as multiple choice). Chord jobs now follow palette.ts degreeRole (only I is home).

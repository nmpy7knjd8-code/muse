# 14 · Melody coach

## Thesis
Score a hummed or drawn melody for shape, range, repetition and where phrases land, and give one suggestion.

## Critique
- **Educator:**
  - Scores invite "chasing the number" and contradict Garrett's number-free bars. Use number-free bars with plain poles ("all over the place ↔ smooth", "narrow ↔ wide").
  - The research-backed traits of memorable or singable melodies are well known in songwriting pedagogy (Pattison; Hooktheory's melody stats; Huron's *Sweet Anticipation* on stepwise motion and leaps followed by step-back). The coach should use only those:
    - mostly steps with occasional leaps
    - a leap followed by a step the other way
    - a range of about an octave or a 10th
    - repetition of a motif
    - phrase ends on chord tones, the last on home
  - One suggestion, not a list. Tie it to a bar.
- **UX:**
  - With no melody, the tool must say how to get one: the melody tab, or Hum to harmony. It must not show empty meters.
  - Read the current key and chords: "lands on a chord tone" depends on them.
- **Mobile:** five bars plus one tip fits.

## Synthesis
- **Melody coach tab:** `melodyCoach()` returns 5 number-free traits: smooth vs jumpy, range, repeats an idea, lands on chord tones, ends home.
- **Tip:** one tip for the weakest trait, naming the bar ("Bar 3 leaps up a 6th and keeps going — step back down after big leaps").
- **Empty state:** buttons to "Write a melody" (closes the drawer to the Melody tab) and "Hum one".

## Post-build review (Playwright at 390px and 1280px; screenshots in /workspace/audit/wave-3/)
- **Found:** a test melody whose bar 2 leaps up a 9th and keeps climbing got a generic "repeat an idea" tip. The most important fault was hidden.
- **Fixed:** an unrecovered leap now takes priority: "Bar 2 leaps and keeps going the same way — after a big leap, step back the other way…". Unit test added.
- **Checked:** five number-free bars, "Hear my melody", and an empty state that points to Melody / Hum.

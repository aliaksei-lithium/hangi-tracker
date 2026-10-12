# Prompt for the Design Agent: Hangi Tracker

Copy everything below the line into the Design Agent.

---

You are designing **Hangi Tracker**, a mobile-first web app (PWA) for hangboard
training. One climber uses it alone, in a gym or at home, with the phone lying on
the floor during the session. The app must be very clean and functional first,
and pleasant second. Think "well-made training tool", not "fitness marketing".

## Users and context

- A single adult climber, training two times a week on a round hangboard with
  15, 20, 25 and 30 mm edges.
- Phone in portrait, one hand, often chalky fingers. Big touch targets.
- During the timer the phone lies 1 to 2 metres away on the floor. The timer must
  be readable from there, and the phase must be clear from colour and text.
- Gym lighting varies. A dark theme is the default for the timer screen; the rest
  of the app supports light, dark and system.
- Text is English and Russian. Russian strings are about 20 percent longer.

## Style direction

- Clean, calm, functional. Generous whitespace, few colours, strong hierarchy.
- One accent colour for primary actions. Three distinct phase colours for the
  timer (get ready, hang, rest) that also differ in lightness so they work for
  colour-blind users. Colour is never the only signal; always pair with text.
- A subtle climbing graphic in the background: for example thin line-art of a
  hangboard, a rock face contour, or a chalk-dust texture. It must be
  low-contrast, must not sit under text, and must not appear on the timer screen
  at all. Deliver it as one SVG under 30 KB, in a light and a dark variant.
- Typography: a system font stack or at most one Google font. The timer digits
  need a tabular-figures face that reads at 2 metres (aim for 96 to 120 px).
- Rounded but not bubbly corners, light elevation only where it helps.

## Screens to design (portrait phone, 390 x 844 as the base frame)

1. **Login.** App name, a short line, two fields (name, password), one button.
   No sign-up. Error state for a wrong name or password (one generic message).
2. **Home.** Greeting by name with a time-of-day line ("Good evening, Aliaksei")
   and one short friendly sentence about the next session. Card "Next session":
   date, type (full or light), plan week, summary like "25 mm, 5 x 5 s, rest
   2:30, warm-up on". Big primary button **Start session**, secondary **Edit**.
   A warning banner when the last session was less than 48 hours ago. Below:
   a short list of upcoming sessions and the last completed one. Bottom
   navigation: Home, Progress, Settings.
3. **Session preview.** The full sequence as a list: warm-up (if on), then work
   sets, each with edge, hang time, rest, grip, added weight; the total session
   time at the top. Every value is editable in place with steppers or a sheet.
   Toggle for warm-up. Per-set override (one set on another edge). Add and
   remove a set. Button "Reset to plan". Big **Start** button fixed at the
   bottom. Include the scope dialog shown on save: "Only this session" or
   "This and all next sessions of this type", with "Remember my choice".
4. **Timer.** Full-screen, dark. Very large digits. Phase name in text
   (GET READY, HANG, REST, NEXT SET) and phase colour on the whole screen or a
   large band. "Set 3 of 5", current edge, target hang time, and "Next: rest
   2:30". Controls as big full-width buttons at the bottom: Pause/Resume,
   +10 s, Skip, Finish (with confirmation). During rest, a one-tap result for
   the last set: **Completed** (default, pre-selected) or **Failed at second N**.
   Design all phases: start countdown, warm-up, hang, rest, prepare, finish.
5. **Session summary.** Opens automatically after the timer. Sets done, total
   time under load. Optional fields, each skippable: RPE 1 to 10, pain 0 to 10
   with location chips (finger joint, pulley, forearm, elbow, shoulder, none),
   body weight, free note. Primary button "Done". A safety message variant when
   the user reports sharp finger-joint pain, a click or a pop: stop training,
   see a doctor if symptoms stay. No diagnosis language.
6. **Progress.** Week table in the plan format (week, edge, hang, sets, notes).
   Three small charts: total time under load per week (bars), edge and hang
   time over time (line), pain and RPE per session (two lines). Personal
   records: best hang on each edge, best volume in one session. A month
   calendar with completed sessions marked. Plan vs actual list: done, skipped,
   modified. Also one suggestion card with **Accept** and **Dismiss** (for
   example "Move to 20 mm: first session 5 s x 5 sets").
7. **Settings.** Grouped list: Protocol, Schedule, Timer, Progression rules,
   General (units, theme, language), Data (export, import, reset with
   confirmation), and Log out. Design one detail page as an example (Timer).

## Deliverables

1. Design tokens as CSS custom properties: colours for light and dark (surface,
   text, muted, accent, danger, the three timer phase colours), type scale,
   spacing scale, radii, shadows.
2. Component sheet: primary and secondary buttons (default, pressed, disabled),
   number stepper, toggle, chip, card, banner (warning, safety), bottom
   navigation, dialog, text field with error.
3. The seven screens above, light and dark where applicable, with the timer
   phases shown as separate frames.
4. The background graphic as SVG (light and dark variants) and a note on where
   it is placed on each screen.
5. A PWA icon (512 px, maskable-safe) and a favicon, in the same visual
   language.
6. A short rationale: how the design keeps the timer readable at 2 metres and
   how the phases stay distinct without colour.

## Constraints for the build

- The app is built with Svelte and plain CSS using your tokens. Prefer layouts
  that work with flexbox and grid, no absolute positioning for content.
- Minimum touch target 48 x 48 px; timer controls at least 64 px tall.
- Contrast at least WCAG AA for all text, AAA for the timer digits.
- No large raster images. The whole visual layer should add under 100 KB.
- Keep copy short; the app, not the design, owns final wording.

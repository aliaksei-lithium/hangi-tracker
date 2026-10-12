# Hangi Tracker: design handoff

Exported from Claude Design on 2026-10-12. These files are HTML prototypes, not
production code. Rebuild them in Svelte with plain CSS (see `docs/PLAN.md`) and
match the visual output.

Live board (private, open it with the owner's account):
https://claude.ai/artifact/1MCiNCCM2vH8i5Xyx2ajEX

## Files

| File | What it holds |
| --- | --- |
| `Hangi Tracker.dc.html` | The board: overview and rationale, timer layouts, phase colours, all screens light and dark, tokens, component sheet, icons. Start here. |
| `Timer.dc.html` | Timer screen, every phase (`countdown`, `warmup`, `hang`, `rest`, `prepare`, `paused`, `confirm`, `done`) and the three layouts. The sample data is in the `<script>` at the bottom. |
| `App Screen.dc.html` | Login, Home, Session preview with the scope dialog, Summary with the safety variant, Progress, Settings, Settings → Timer. |
| `tokens.css` | Design tokens as CSS custom properties: light, dark, and the always-dark timer set. Use this as the base for the app's CSS. |
| `assets/` | Background graphics (topo, strata, survey; light and dark), `icon-512.svg`, `favicon.svg`. |
| `_ds/industry/` | The Industry design system the board is built on, for reference. |
| `chats/chat1.md` | The design chat: what the user asked for and what changed along the way. |
| `support.js` | Runtime that renders the `.dc.html` files in a browser. Not for the app. |

To view the board locally, serve this folder over HTTP (for example
`python3 -m http.server`) and open `Hangi Tracker.dc.html`. The page loads React
from unpkg and Barlow Condensed from Google Fonts.

## Decisions taken in the design chat

- Timer layout **1a "Flood"**: the whole screen takes the phase colour.
- Phase palette **1d "Signal"**: get ready amber `oklch(0.76 0.15 70)`, hang
  chartreuse `oklch(0.93 0.15 125)`, rest deep steel `oklch(0.34 0.08 250)`.
  Each phase has a different lightness, so they stay distinct in greyscale.
- Background graphic **1g "Topo"**. It is used only in the Login hero (300 px)
  and a 64 px strip at the top of Home. It never appears under text and never on the timer.
- Login has **only a password field**. The error text is "Password is incorrect."
- Icon: the pentagon training ring on deep steel. The favicon drops the slots.
- Settings → Timer has no Vibration toggle.
- Square corners (Industry). Accent `#416180` light / `#94bce3` dark.
- Fonts: Barlow Condensed for display type and timer digits, system stack for body text.

## Open points for the build

- Login: the design has a password field only, but `docs/PLAN.md` uses name +
  password for later multi-user. Confirm with the owner before building auth.
- Corners: the brief said "rounded, not bubbly"; the design keeps them square.
  You can change this with `--r-1` in `tokens.css`.
- `tokens.css` leaves "system" theme to JS or a copied dark block; see the
  comment at the end of the file.
- Export `icon-512.svg` to a 512 px PNG for the web manifest.
- Contrast values in the design were not checked with a tool.

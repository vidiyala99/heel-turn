# Impeccable critique and polish (2026-11-23, before the 16:50 demo recording)

Method: dual-agent critique. Assessment A was a design review of the 1920 screenshots plus the CSS. Assessment B was `impeccable detect` plus measured contrast. The two ran isolated, and this file merges their findings. Mode: Experience for the match, Operate for menus and HUD. No PRODUCT.md or DESIGN.md exists, so the incumbent broadcast look was kept (red, gold and ink, Anton, -14deg slashes). This was a polish pass, not a redesign.

Screens: `docs/shots/impeccable-before-<screen>-<1920|1440>.png` and `impeccable-after-*`. Screens: title, menu, select, versus, lowerthird, match, results, royal, odds, card. Rerun with `python game/ui/impeccable_shots.py <tag>`.

Score: 26/40 on Nielsen's heuristics. Lowest: consistency (2), recognition (2), minimalism (2), error recovery (2).
Detector: 8 warnings: Inter x4, side-tab x3, dark-glow x1. Contrast: 0 failures. The locked "Tag Team" item comes closest at 4.26:1 (large text).

## Prioritized fix list

| # | P | Screen | Issue | Fix | Status |
|---|---|---|---|---|---|
| 1 | P0 | match, royal, results | The trash-talk promo card covers the key help and the speaker strap in the bottom-left corner | While `.promo.on`, `.keys` fades out and `#l3` moves up to 214px (promo.css, `:has()`) | DONE |
| 2 | P0 | match | The decision log reads as a chunky console dump: 12.5px rows, mono source chips, cites wrap, rows clipped mid-line | 288px rail with 11.5px rows. Sources show as tinted dots. Reasons clamp to 2 lines. Cites take one muted, truncated line. 4 rows max with fades (index.html) | DONE |
| 3 | P0 | match HUD | Three bars of equal weight with no labels, so the meaning of health, stamina and meter is unreadable | Health stays 14px with a HEALTH label. Stamina and meter drop to 6px (index.html) | DONE |
| 4 | P1 | all match | Captions compete with audio | Promo card goes from 760 to 600px wide, name 34 to 26px, line 19 to 16px. Strap name 22 to 18px | DONE |
| 5 | P1 | royal | The log rail is illegible over the saturated crowd (row fades .72/.45, banner fade .2) | Darker rail background. Row fades .85/.65, banner fade .45 (royal.css) | DONE |
| 6 | P1 | royal | Strip tags are 10px #a9b1bf | 11px #d6dbe6 | DONE |
| 7 | P1 | match, royal | The `#banner` (128px, black offset plus gold halo) cuts through wrestlers and the card | Smaller clamp, `top:22%`, a scrim behind it | OPEN: the banner drives the demo beats; resize only after Aakash reviews |
| 8 | P1 | odds | `.op-pct` is absolutely positioned and may collide with the payout multipliers. The stake chips have no label | Make `.op-pct` static in grid row 2, add a STAKE label | OPEN: not visible in the after shots; verify on the live panel |
| 9 | P2 | title | PRESS ENTER blinks down to near-invisible | Keep the low blink phase at .55 | OPEN |
| 10 | P2 | menu | The LOCKED chip floats far from "Tag Team". The `.note` callout uses a 4px side stripe (detector side-tab) | Put the chip inline. Change the stripe to a top rule | OPEN |
| 11 | P2 | versus | The role line is 16px under 84px names | 20px, gold, tracked caps | OPEN |
| 12 | P3 | all | Leaked internals in the log cites (`relationships:mae/p1`, `habits:...`) | The cites are now muted and truncated. Hiding them needs a markup change in agent-layer.js | PARTIAL |

Detector false positives: the menu `.mi::before` slash and the `.set.focus` stripe are deliberate fighting-game motifs. Inter is the body face under Anton display, which is fine.

## Skill decisions
- impeccable: refinement preserves. I kept the broadcast world and fixed collisions, hierarchy and density only.
- gstack: verified on the real screens (before/after captures plus `play.py`), not on a proxy.
- ui-ux-pro-max: contrast 4.5:1 checked by measurement. No HUD text was lowered below it (cites were muted, but they are tertiary and truncated).
- taste-core: density dial set low for the match. The HUD stays quiet so the 3D scene and audio lead.
- taste-redesign: hierarchy through weight and size. One dominant bar (health) over two thin ones.
- emil-design-eng: the key help and strap move with existing ease-out curves (160-240ms) rather than jumping.
- frontend-design: removed unnecessary typographic labels (mono source chips became dots) instead of adding more.

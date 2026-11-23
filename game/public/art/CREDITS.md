# Art credits

All images generated with Black Forest Labs FLUX.2 (`flux-2-pro-preview`) via api.bfl.ai. Every prompt was prefixed with: "stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic lighting, no real brands, no logos other than stated text." (prefix included below). Entrance cards were generated at 1920x1088 and cropped to 1920x1080. mat-logo.png is generated on solid black, then black is keyed to alpha. Seeds are the final accepted generation.

## crowd-banner
- model: flux-2-pro-preview
- seed: 63183
- prompt: stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic lighting, no real brands, no logos other than stated text. Strip of hand-made fan signs held up by a wrestling arena crowd, only six large clearly lettered cardboard signs, each with short simple marker text: "HEEL TURN", "BOO!", "WE WANT MAE", "GO VEX", "BRUTUS", "CRANE SUCKS"; no other text anywhere, crowd silhouettes, warm lights. 

## entrance-kane
- model: flux-2-pro-preview
- seed: 63077
- prompt: stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic lighting, no real brands, no logos other than stated text. Wrestler entrance screen, wide cinematic: red fire and smoke stage with a hulking bearded wrestler silhouette on the ramp, huge clean text "BRUTUS KANE" at the bottom. 

## entrance-mae
- model: flux-2-pro-preview
- seed: 63101
- prompt: stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic lighting, no real brands, no logos other than stated text. Wrestler entrance screen, wide cinematic: cold silver steel sparks and white spotlights, older woman wrestler with silver hair silhouette on the ramp, huge clean text "OLD IRON MAE" at the bottom. 

## entrance-silas
- model: flux-2-pro-preview
- seed: 63089
- prompt: stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic lighting, no real brands, no logos other than stated text. Wrestler entrance screen, wide cinematic: purple mist and green-tinged spotlights, sly cloaked wrestler silhouette on the ramp, huge clean text "SILAS CRANE" at the bottom. 

## entrance-vex
- model: flux-2-pro-preview
- seed: 63065
- prompt: stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic lighting, no real brands, no logos other than stated text. Wrestler entrance screen, wide cinematic: electric blue lightning stage with the wrestler silhouette on the ramp, huge clean text "VEX THE VOLTAGE" at the bottom. 

## mat-logo
- model: flux-2-pro-preview
- seed: 63193
- prompt: stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic lighting, no real brands, no logos other than stated text. Centered ring-mat logo: bold gold and red text "HEEL TURN" in a circular emblem with crossed flames, flat graphic design, flat 2D vector emblem on a perfectly uniform pure black background, no spotlight, no gradients in the background, nothing else. 

## portrait-kane
- model: flux-2-pro-preview
- seed: 63036
- prompt: stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic lighting, no real brands, no logos other than stated text. Portrait of original wrestler Brutus Kane: huge brute, thick red beard, scarred, red ring gear, menacing glare, chest-up, dark arena background, red rim light. No text. 

## portrait-mae
- model: flux-2-pro-preview
- seed: 63055
- prompt: stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic lighting, no real brands, no logos other than stated text. Portrait of original wrestler Old Iron Mae: older tough woman veteran, silver hair tied back, silver and steel-gray ring gear, battle-worn determined look, chest-up, dark arena background. No text. 

## portrait-silas
- model: flux-2-pro-preview
- seed: 63045
- prompt: stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic lighting, no real brands, no logos other than stated text. Portrait of original wrestler Silas Crane: sly schemer, slim, purple ring gear and cape, sneaky smirk, narrowed eyes, chest-up, dark arena background, purple rim light. No text. 

## portrait-vex
- model: flux-2-pro-preview
- seed: 63229
- prompt: stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic lighting, no real brands, no logos other than stated text. Portrait of original wrestler Vex 'The Voltage': flashy showboat, young man with spiky hair, electric blue lightning aura, glittering blue ring gear, cocky grin, chest-up, plain dark blurred arena background with no signage, banners or lettering anywhere. 

## titantron
- model: flux-2-pro-preview
- seed: 63014
- prompt: stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic lighting, no real brands, no logos other than stated text. Arena big-screen titantron graphic. Giant bold metallic gold and crimson text "HEEL TURN" centered, dark red smoky background, pyrotechnic sparks and fire fountains, spotlight beams, cinematic wide. 


## Cards from the 3D models (2026-11-23)

portrait-kane/silas/mae/ref and entrance-kane/silas/mae were regenerated from studio renders of the in-game models (render-<id>.png, `game/tools/studio_shot.py`, 1024x1024, idle pose, dark backdrop) with Black Forest Labs FLUX Kontext (`flux-kontext-pro`, image-conditioned) via `game/tools/cards_from_renders.py`, so face, hair, attire and palette match the models. The previous cards are kept as *-v1.jpg. Vex's portrait and entrance were blocked by BFL content moderation twice (seeds 64001-64002, 64101-64102) and stay on v1 until a rerun.

- entrance-kane.jpg: model flux-kontext-pro, seed 64201, input render-kane.png. prompt: Repaint this 3D character render as stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic arena lighting, no real brands. Keep the exact same character: same face, same hair, same outfit pieces and the same colors as the render. Wide cinematic wrestler entrance screen: Brutus Kane (huge muscular man, short red hair and red beard, red wrestling singlet with black straps, black elbow pads, gold wrist tape) standing on the entrance ramp, red fire and smoke stage, huge clean text "BRUTUS KANE" at the bottom. No other text.
- entrance-mae.jpg: model flux-kontext-pro, seed 64008, input render-mae.png. prompt: Repaint this 3D character render as stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic arena lighting, no real brands. Keep the exact same character: same face, same hair, same outfit pieces and the same colors as the render. Wide cinematic wrestler entrance screen: Old Iron Mae (tough veteran woman, silver-white hair in two buns, black singlet with silver side panels and silver straps, silver wrist tape) standing on the entrance ramp, cold silver steel sparks and white spotlights stage, huge clean text "OLD IRON MAE" at the bottom. No other text.
- entrance-silas.jpg: model flux-kontext-pro, seed 64006, input render-silas.png. prompt: Repaint this 3D character render as stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic arena lighting, no real brands. Keep the exact same character: same face, same hair, same outfit pieces and the same colors as the render. Wide cinematic wrestler entrance screen: Silas Crane (slim man with long black hair, long black coat with purple lapels and cuffs worn open over a bare chest, purple tights) standing on the entrance ramp, purple mist with green-tinged spotlights stage, huge clean text "SILAS CRANE" at the bottom. No other text.
- portrait-kane.jpg: model flux-kontext-pro, seed 64003, input render-kane.png. prompt: Repaint this 3D character render as stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic arena lighting, no real brands. Keep the exact same character: same face, same hair, same outfit pieces and the same colors as the render. Chest-up portrait of Brutus Kane: huge muscular man, short red hair and red beard, red wrestling singlet with black straps, black elbow pads, gold wrist tape. Confident wrestler expression, dark blurred arena background, red fire and smoke rim light. No text.
- portrait-mae.jpg: model flux-kontext-pro, seed 64007, input render-mae.png. prompt: Repaint this 3D character render as stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic arena lighting, no real brands. Keep the exact same character: same face, same hair, same outfit pieces and the same colors as the render. Chest-up portrait of Old Iron Mae: tough veteran woman, silver-white hair in two buns, black singlet with silver side panels and silver straps, silver wrist tape. Confident wrestler expression, dark blurred arena background, cold silver steel sparks and white spotlights rim light. No text.
- portrait-ref.jpg: model flux-kontext-pro, seed 64009, input render-ref.png. prompt: Repaint this 3D character render as stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic arena lighting, no real brands. Keep the exact same character: same face, same hair, same outfit pieces and the same colors as the render. Chest-up portrait of Lou Varga: referee with short dark parted hair, black-and-white vertically striped referee shirt with black collar, black slacks. Confident wrestler expression, dark blurred arena background, neutral white spotlights rim light. No text.
- portrait-silas.jpg: model flux-kontext-pro, seed 64005, input render-silas.png. prompt: Repaint this 3D character render as stylized original illustrated wrestling game art, bold painterly comic-book style, dramatic arena lighting, no real brands. Keep the exact same character: same face, same hair, same outfit pieces and the same colors as the render. Chest-up portrait of Silas Crane: slim man with long black hair, long black coat with purple lapels and cuffs worn open over a bare chest, purple tights. Confident wrestler expression, dark blurred arena background, purple mist with green-tinged spotlights rim light. No text.

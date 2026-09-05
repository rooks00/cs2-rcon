# Relay interface direction

Reference: [DeepSeek Harness](https://www.deepseek.com/harness/en/), inspected in a browser and through its live styles. The current brief asks for its exact neutral surfaces, more elegant typography, and a similar interactive whale, while retaining the console-first workspace.

## Measured visual system

- Page base: `#0a0a0a`.
- Primary text and action: white; secondary text white at 80%; description text white at 50%.
- Surface layers: white at 4–6%; input fill white at 8%, with a white 20% border.
- Terminal: black at 20%, white 8% border, 24px backdrop blur, 10px radius, no decorative shadow.
- Typography: locally licensed Montserrat 500 for headings, DM Sans for interface text, Fragment Mono for the console. Display treatment follows the reference's 46px heading and -0.02em tracking. The current interface increases small labels, controls and console copy for readability.

Blue is no longer an interface accent or a tinted panel color. A localized blue/gray atmosphere is painted by the background scene over the neutral page. All UI color values come from the reference's measured theme, rather than approximated blue-gray tokens.

## Interactive scene

The requested whale is an original, procedurally generated humpback point cloud. Its anatomy is authored in `lib/whale-particles.ts`; it does not use DeepSeek's logo or SVG. The dependency-free Canvas2D renderer projects the points in three dimensions, gently moves the tail, turns toward the pointer and disperses/reforms nearby particles. Background clicks create a brief additional dispersal; interactions with actual inputs, buttons and the console remain untouched.

The scene is quieter during a connected RCON session. A visible control pauses/resumes motion. Reduced-motion preferences render a static scene, and hidden tabs stop requesting animation frames. Pointer coordinates and particle physics remain outside React state, with bounded particles and pixel ratio. No WebGL library, image download or additional native-helper runtime is required.

## Workspace

RCON opens immediately after connection with actual status output. Main navigation is horizontal. Command reference and match controls remain secondary disclosures; all player, map, mode, ban, settings, JSON and local-helper functions are preserved. Static map artwork and decorative metric tiles remain removed.

The standard `backdrop-filter` declaration must follow its WebKit-prefixed counterpart. This Next build's CSS transform otherwise retained only the prefixed rule, causing modern Chromium to render no blur. Actual computed styles are checked during visual verification.

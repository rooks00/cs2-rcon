# Tasheer particle artwork

The current scene replaces the former whale with three adult Saudi Tasheer performers in airborne poses, based on the user's pose/clothing references. It includes traditional dress, downward-facing rifles, a restrained discharge glow and smoke. The composition is original and does not reproduce specific people or any reference photograph's background.

## Source and implementation

- Artwork created with the built-in image generation tool and saved at `public/artwork/tasheer-source.webp` (format conversion only).
- `scripts/sample-tasheer-art.mjs` samples luminance and edge detail into `lib/tasheer-cloud.json`; it does not modify the source artwork.
- `lib/tasheer-particles.ts` gives the portrait shallow depth, stable sampling and a small amount of cloth/smoke drift.
- `components/ambient-artwork.tsx` retains pointer interaction, dispersal/reformation, the header pause control, reduced-motion behavior and hidden-tab suspension. The view stays close to front-on to keep human poses readable.
- Sampling is seeded, so mobile and desktop particle budgets both represent the whole composition. The neutral UI, typography, RCON and local helper behavior are unchanged.

Rebuild the particle data from the checked-in artwork with `node scripts/sample-tasheer-art.mjs`.

## Generation prompt

Use case: original cultural artwork for an interactive point-cloud background in a premium web application. The attached three photographs are POSE AND CLOTHING REFERENCES ONLY; do not reproduce any exact face, photographic composition, background, watermark or other person's artwork. Create a new full-body sculptural monochrome illustration of THREE ADULT Saudi Tasheer performers suspended in their characteristic tightly tucked jumping poses, arranged across a wide composition with clear space between each figure. They wear traditional flowing white thobes and draped ghutra/headscarves with dark agal; one may have a slightly darker garment to create tonal variety but keep all figures clearly visible in light grayscale. Accurately convey the references' compact airborne knees-up movement, with feet raised clear of the ground and fabric wrapping around bent legs, rather than standing or ordinary running. Each holds a long traditional rifle directed downward toward the empty ground, with one small restrained discharge glow and a soft plume of smoke underneath. This is a celebratory cultural performance, no targets, combat, injury, crowds or graphic content. Large central performer in three-quarter view and two slightly smaller performers on either side at varied jump heights. Maintain realistic mature human anatomy, coherent hands, natural cloth folds and clearly readable rifle silhouettes. Art style: exquisitely refined silver/ivory sculptural grayscale illustration with soft directional studio lighting, crisp outer silhouettes and controlled photographic detail, designed to be converted into a particle sculpture. Background MUST be solid pure black (#000000) everywhere except the three people, their rifles, small discharge glow and sparse smoke. No stage, no floor horizon or platform, no buildings, no sky, no shadows on a floor, no particles or stippling yet, no text, no border, no logos. Keep the full figures, rifle ends and smoke inside the frame with 10 percent clean margin. Overall wide landscape 3:2 composition, restrained premium mood, bright enough to extract every figure from black.

## User-provided pose references

- https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRItLLQ-jY6KSzKB1gqSn2WFN2yChBHrh2JF0uAaYcQtA&s=10
- https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT0Z1pT2XeE7XNfb8UQNtqZI34xmgipgn45AsMM_QD-HwL_1-MyDUCBN54&s=10
- https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSTvtfZeXYx8JgKyZiRFJF4xiCrbV7qL7n_LfXHbKCe9g&s

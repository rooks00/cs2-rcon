# Tasheer particle artwork

The current scene shows one adult Saudi Tasheer performer in a large airborne pose, based on the user's pose/clothing references. The portrait gives the carved stock, metal barrel details, ghutra pattern and fabric folds much more space and resolution. It includes traditional dress, one downward-facing rifle, a restrained discharge glow and sparse smoke. The composition is original and does not reproduce specific people or any reference photograph's background.

## Source and implementation

- Artwork created with the built-in image generation tool and saved at `public/artwork/tasheer-source.webp` (format conversion only).
- `scripts/sample-tasheer-art.mjs` samples luminance and edge detail into `lib/tasheer-cloud.json`; it does not modify the source artwork.
- `lib/tasheer-particles.ts` gives the portrait shallow depth, stable sampling and a small amount of cloth/smoke drift.
- `components/ambient-artwork.tsx` retains pointer interaction, dispersal/reformation, the header pause control, reduced-motion behavior and hidden-tab suspension. A dedicated welcome-stage displays the portrait around 450–600px tall on desktop. A cached, faint source-image layer preserves engraving, metal edges and cloth folds underneath the particles; it fades during interaction and is omitted from the connected console. The view stays close to front-on to keep the pose readable.
- The source is sampled at up to 960 pixels wide into 20,000 points with extra edge weight. The renderer uses 14,000 desktop / 5,000 coarse-pointer particles, all dedicated to the one figure. Sampling is seeded, so both budgets preserve the complete pose. The neutral UI, typography, RCON and local helper behavior are unchanged.

Rebuild the particle data from the checked-in artwork with `node scripts/sample-tasheer-art.mjs`.

## Generation prompt

Create a new high-resolution original illustration of EXACTLY ONE adult Saudi Tasheer performer. The previous generated three-person image is a STYLE reference only: keep the refined silver/ivory monochrome sculpture treatment but replace the group with a single large hero figure. The two photographs are references only for traditional clothing and the characteristic compact airborne Tasheer jump; do not copy an exact person or face. Frame the full body, headscarf, entire rifle and a small amount of smoke. Mature adult man with both knees tucked high and both bare feet airborne, in a clear three-quarter view. White thobe with extraordinarily readable woven fabric texture, crisp cuff and collar seams, layered folds, tension around bent knees, flowing sleeves, and a patterned ghutra with a dark agal; scarf ends flow behind him. The firearm must clearly look like a traditional ceremonial rifle rather than a pole: show a recognizable dark carved wooden buttstock with fine wood grain, complete exterior silhouette, visible external trigger guard and grip area, contrasting polished metal barrel, decorative metal barrel bands, and sharp highlights along edges. These are exterior visual craft details only, not a technical drawing or cutaway. Hold the rifle downward toward empty ground as in the performance references, with the long barrel visually separated from the white clothing for clarity. One very small restrained glow and a thin sparse wisp of smoke at the lower muzzle; do not obscure the rifle with smoke. A celebratory cultural performance, no combat or targets or other people. Excellent coherent anatomy and believable hands. Directional museum/studio lighting with strong tonal separation to reveal gun and clothing details at website viewing size. Portrait composition 2:3, highly detailed and clean. One figure fills almost the whole canvas with only 6–8 percent pure-black margin. Pure solid black #000000 background. No floor, platform, scenery, secondary figures, triptych, collage, text, labels, logos, particle effects, stippling, dimensions or diagram callouts. Preserve fine material detail; avoid smooth generic fabric and vague rifle shapes.

## User-provided pose references

- https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRItLLQ-jY6KSzKB1gqSn2WFN2yChBHrh2JF0uAaYcQtA&s=10
- https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT0Z1pT2XeE7XNfb8UQNtqZI34xmgipgn45AsMM_QD-HwL_1-MyDUCBN54&s=10
- https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSTvtfZeXYx8JgKyZiRFJF4xiCrbV7qL7n_LfXHbKCe9g&s

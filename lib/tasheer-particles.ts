import cloud from "./tasheer-cloud.json";

export const TASHEER_SOURCE = cloud.image;

export type ArtworkParticle = {
  x: number;
  y: number;
  z: number;
  size: number;
  brightness: number;
  phase: number;
  flex: number;
  turnDepth: number;
};

// Soft volumes follow the portrait's head, shoulders, cloth, arms, and feet.
// They give the point artwork a readable side profile during its turn without
// changing the source portrait or inflating its thin rifle and trailing scarf.
const PORTRAIT_VOLUMES = [
  [-.03, .75, .25, .24, .18],
  [.12, .44, .34, .28, .26],
  [.22, .04, .43, .48, .32],
  [-.20, .10, .24, .30, .21],
  [-.29, .37, .30, .11, .09],
  [.04, -.46, .21, .25, .12],
];

function portraitDepth(x: number, y: number): number {
  let depth = 0;
  for (const [cx, cy, rx, ry, radius] of PORTRAIT_VOLUMES) {
    const distance = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
    if (distance < 1) depth = Math.max(depth, Math.sqrt(1 - distance) * radius);
  }
  return depth;
}

/** A deterministic, shallow-depth portrait of the detailed single Tasheer performer. */
export function createTasheerParticles(count: number, seed = 0x54415348): ArtworkParticle[] {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const particles: ArtworkParticle[] = [];
  if (!cloud.points.length) return particles;
  for (let index = 0; index < total; index++) {
    const source = cloud.points[index % cloud.points.length];
    const luminance = source[2] / 255;
    const x = source[0] / 10000, y = source[1] / 10000;
    particles.push({
      x,
      y,
      z: (random() - .5) * .065 + (1 - luminance) * .07,
      size: .55 + random() * .30 + luminance * .35,
      brightness: .08 + Math.pow(luminance, .85) * .9,
      phase: random() * Math.PI * 2,
      // Fine cloth/smoke drift keeps the photographed airborne pose coherent.
      flex: Math.max(0, Math.min(1, (.35 - y) * .6)) * .45,
      turnDepth: portraitDepth(x, y),
    });
  }
  return particles;
}

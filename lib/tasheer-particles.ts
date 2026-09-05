import cloud from "./tasheer-cloud.json";

export type ArtworkParticle = {
  x: number;
  y: number;
  z: number;
  size: number;
  brightness: number;
  phase: number;
  flex: number;
};

/** A deterministic, shallow-depth portrait of the referenced Tasheer poses. */
export function createTasheerParticles(count: number, seed = 0x54415348): ArtworkParticle[] {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  const particles: ArtworkParticle[] = [];
  if (!cloud.points.length) return particles;
  for (let index = 0; index < total; index++) {
    const source = cloud.points[index % cloud.points.length];
    const luminance = source[2] / 255;
    const y = source[1] / 10000;
    particles.push({
      x: source[0] / 10000,
      y,
      z: (random() - .5) * .065 + (1 - luminance) * .07,
      size: .68 + random() * .50 + luminance * .26,
      brightness: .18 + Math.pow(luminance, .7) * .78,
      phase: random() * Math.PI * 2,
      // Fine cloth/smoke drift keeps the photographed airborne pose coherent.
      flex: Math.max(0, Math.min(1, (.35 - y) * .6)) * .45,
    });
  }
  return particles;
}

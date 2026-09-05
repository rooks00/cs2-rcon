export type WhaleParticle = {
  x: number;
  y: number;
  z: number;
  size: number;
  brightness: number;
  phase: number;
  flex: number;
};

type Point = { x: number; y: number; z: number; flex: number; light: number };
type BodySection = readonly [x: number, centerY: number, height: number, width: number];

const TAU = Math.PI * 2;

// Original anatomy: a blunt, broad head, a rounded chest, and a slender peduncle.
// Radii describe the body surface; fins and flukes are sampled separately.
const BODY: readonly BodySection[] = [
  [-1.6, 0.02, 0.012, 0.022],
  [-1.52, 0.025, 0.155, 0.245],
  [-1.31, 0.04, 0.275, 0.405],
  [-0.96, 0.055, 0.335, 0.475],
  [-0.54, 0.075, 0.35, 0.45],
  [-0.1, 0.095, 0.305, 0.36],
  [0.32, 0.11, 0.23, 0.26],
  [0.73, 0.125, 0.15, 0.16],
  [1.09, 0.14, 0.076, 0.085],
  [1.36, 0.15, 0.046, 0.044],
  [1.52, 0.15, 0.023, 0.027],
];

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function smoothstep(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function cubic(a: number, b: number, c: number, d: number, t: number): number {
  return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (3 * b - a - 3 * c + d) * t * t * t);
}

function bodyAt(x: number): { centerY: number; height: number; width: number } {
  let index = 0;
  while (index < BODY.length - 2 && x > BODY[index + 1][0]) index += 1;
  const before = BODY[Math.max(0, index - 1)];
  const start = BODY[index];
  const end = BODY[index + 1];
  const after = BODY[Math.min(BODY.length - 1, index + 2)];
  const t = clamp((x - start[0]) / (end[0] - start[0]), 0, 1);
  return {
    centerY: cubic(before[1], start[1], end[1], after[1], t),
    height: Math.max(0.01, cubic(before[2], start[2], end[2], after[2], t)),
    width: Math.max(0.01, cubic(before[3], start[3], end[3], after[3], t)),
  };
}

function bodyPoint(random: () => number): Point {
  let x = 0;
  let section = bodyAt(x);
  // Sampling by circumference avoids artificial clusters at the narrow tail.
  // Bounded rejection keeps this inexpensive even at tiny particle counts.
  for (let attempt = 0; attempt < 12; attempt += 1) {
    x = -1.6 + random() * 3.12;
    section = bodyAt(x);
    if (random() < (section.height + section.width) / 0.83) break;
  }
  const angle = random() * TAU;
  const sine = Math.sin(angle);
  const interior = random() < 0.14;
  const depth = interior ? 0.55 + random() * 0.4 : 0.982 + random() * 0.03;
  const pleat = x < -0.12 && sine < -0.25 ? 1 + Math.cos(angle * 14) * 0.013 : 1;
  return {
    x,
    y: section.centerY + section.height * sine * depth * pleat,
    z: section.width * Math.cos(angle) * depth,
    flex: smoothstep((x - 0.05) / 1.5) * 0.8,
    light: interior ? -0.17 : sine > 0 ? 0.035 : -0.015,
  };
}

function flukePoint(random: () => number, side: number): Point {
  const t = Math.pow(random(), 0.85);
  // Two swept lobes meet at the peduncle. The short trailing center creates
  // the characteristic notch; the outer tips close into narrow points.
  const leading = 1.17 + 0.49 * t - 0.07 * Math.sin(Math.PI * t);
  const trailing = 1.49 + 0.25 * Math.pow(Math.sin(Math.PI * t), 0.68) + 0.16 * t;
  const chord = random();
  const thickness = Math.sin(Math.PI * chord) * (1 - t) * 0.024;
  return {
    x: leading + (trailing - leading) * chord,
    y: 0.145 + Math.sin(Math.PI * t) * 0.048 - t * 0.065 + (chord - 0.5) * 0.04 + (random() - 0.5) * thickness,
    z: side * (0.018 + t * 0.92),
    flex: 0.84 + t * 0.16,
    light: 0.07 + t * 0.07,
  };
}

function pectoralPoint(random: () => number, side: number): Point {
  const t = random();
  const across = random() * 2 - 1;
  // Humpback pectorals are long and swept, with a gently scalloped edge.
  const width = 0.22 * Math.pow(1 - t, 0.65) + Math.sin(Math.PI * t) * 0.025;
  const scallop = across < -0.72 ? Math.sin(t * Math.PI * 7) * 0.018 * (1 - t) : 0;
  const offset = across * width + scallop;
  const thickness = Math.sqrt(Math.max(0, 1 - across * across)) * (1 - t) * 0.043;
  return {
    x: -0.72 + 1.23 * t + offset * 0.79,
    y: -0.08 - t * 0.48 + Math.sin(Math.PI * t) * 0.04 + (random() - 0.5) * thickness,
    z: side * (0.285 + Math.sin(t * Math.PI * 0.5) * 0.73 - offset * 0.61),
    flex: t * 0.24,
    light: 0.045 + t * 0.13,
  };
}

function dorsalPoint(random: () => number): Point {
  const root = Math.sqrt(random());
  const split = random();
  const a = 1 - root;
  const b = root * (1 - split);
  const c = root * split;
  return {
    x: a * 0.34 + b * 0.73 + c * 0.99,
    y: a * 0.335 + b * 0.625 + c * 0.242,
    z: (random() - 0.5) * 0.075 * (1 - b),
    flex: 0.18,
    light: 0.055,
  };
}

function anatomyPoint(random: () => number, index: number): Point {
  if (index % 9 === 0) {
    const side = index % 2 === 0 ? 1 : -1;
    const x = -1.21 + (random() - 0.5) * 0.034;
    const section = bodyAt(x);
    const y = 0.018 + (random() - 0.5) * 0.016;
    return { x, y, z: side * section.width * 1.008, flex: 0, light: 0.26 };
  }
  // Sparse longitudinal throat pleats follow the curved lower body. They
  // suggest anatomy without turning the cloud into a wireframe mesh.
  const x = -1.48 + random() * 1.45;
  const section = bodyAt(x);
  const angle = Math.PI + ((index % 7) + 1) * Math.PI / 8;
  return {
    x,
    y: section.centerY + section.height * Math.sin(angle) * 1.012,
    z: section.width * Math.cos(angle) * 1.012,
    flex: 0,
    light: 0.14,
  };
}

/**
 * A dependency-free, original humpback point cloud: head at negative x, tail
 * at positive x, y up, and horizontal flukes spanning z. A three-quarter view
 * reveals the fins best. `flex` is small near the head and largest at the tail.
 * Positive finite counts are floored; empty/invalid counts return an empty cloud.
 */
export function createWhaleParticles(count: number, seed = 0x5748414c): WhaleParticle[] {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const random = seededRandom(seed);
  const particles: WhaleParticle[] = [];
  for (let index = 0; index < total; index += 1) {
    const region = (index + 0.5) / total;
    const side = index % 2 === 0 ? 1 : -1;
    const point = region < 0.61 ? bodyPoint(random)
      : region < 0.77 ? flukePoint(random, side)
        : region < 0.95 ? pectoralPoint(random, side)
          : region < 0.97 ? dorsalPoint(random)
            : anatomyPoint(random, index);
    particles.push({
      x: point.x,
      y: point.y,
      z: point.z,
      size: 0.62 + Math.pow(random(), 0.8) * 0.74,
      brightness: clamp(0.35 + random() * 0.43 + point.light, 0.16, 0.98),
      phase: random() * TAU,
      flex: point.flex,
    });
  }
  return particles;
}

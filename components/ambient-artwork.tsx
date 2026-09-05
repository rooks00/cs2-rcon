"use client";

import { Pause, Play } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createTasheerParticles, type ArtworkParticle } from "@/lib/tasheer-particles";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeMotion(change: () => void) {
  const media = window.matchMedia(REDUCED_MOTION);
  media.addEventListener("change", change);
  return () => media.removeEventListener("change", change);
}
function motionPreference() { return window.matchMedia(REDUCED_MOTION).matches; }

type SceneState = {
  time: number;
  yaw: number;
  pitch: number;
  particles: ArtworkParticle[];
  displacement: Float32Array;
};

const MotionContext = createContext<{ moving: boolean; reducedMotion: boolean; toggle: () => void } | null>(null);

export function ArtworkMotionControl() {
  const motion = useContext(MotionContext);
  if (!motion) return null;
  const label = motion.reducedMotion ? "Background motion reduced by system preference" : motion.moving ? "Pause background animation" : "Resume background animation";
  return <button className="ambient-motion-toggle" type="button" onClick={motion.toggle} disabled={motion.reducedMotion} aria-pressed={!motion.moving} aria-label={label} title={label}>
    {motion.moving ? <Pause size={15} /> : <Play size={15} />}
  </button>;
}

/** Original Tasheer point artwork. Pointer physics stay outside React rendering. */
export function AmbientArtwork({ subdued = false, children }: { subdued?: boolean; children: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<SceneState>({ time: 0, yaw: .06, pitch: .04, particles: [], displacement: new Float32Array(0) });
  const [paused, setPaused] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, motionPreference, () => true);
  const moving = !paused && !reducedMotion;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const ctx = context;
    const scene = sceneRef.current;
    const haze = document.createElement("canvas");
    const hazeContext = haze.getContext("2d");
    let width = 0, height = 0, ratio = 1, frame = 0, last = 0;
    let targetYaw = scene.yaw, targetPitch = scene.pitch;
    let pointerX = -10000, pointerY = -10000, pointerUntil = 0;
    let impulse = 0;
    let disposed = false;
    const mobile = window.matchMedia("(pointer: coarse)").matches;
    const count = mobile ? 2000 : 5000;
    const pointColors = Array.from({ length: 128 }, (_, index) => `rgba(226,229,226,${(index / 127).toFixed(3)})`);
    if (scene.particles.length !== count) {
      scene.particles = createTasheerParticles(count);
      scene.displacement = new Float32Array(count * 4);
    }

    const paintHaze = () => {
      if (!hazeContext) return;
      const h = hazeContext;
      h.setTransform(ratio, 0, 0, ratio, 0, 0);
      h.clearRect(0, 0, width, height);
      const glow = (x: number, y: number, rx: number, ry: number, rgb: string, strength: number, rotation = 0) => {
        h.save();
        h.translate(x, y); h.rotate(rotation); h.scale(rx, ry);
        const gradient = h.createRadialGradient(0, 0, 0, 0, 0, 1);
        gradient.addColorStop(0, `rgba(${rgb},${strength})`);
        gradient.addColorStop(.42, `rgba(${rgb},${strength * .48})`);
        gradient.addColorStop(1, `rgba(${rgb},0)`);
        h.fillStyle = gradient; h.fillRect(-1, -1, 2, 2); h.restore();
      };
      // Localized light, not a blue page fill. All actual UI surfaces are neutral.
      glow(width * .43, -height * .08, width * .79, height * .76, "48,87,144", .72);
      glow(width * .86, height * .04, width * .55, height * .57, "57,92,145", .36);
      glow(width * .62, height * .28, width * .40, height * .16, "181,189,187", .20, .18);
      glow(width * .90, height * .53, width * .25, height * .38, "135,150,155", .06, -.3);
    };
    const render = (elapsed = 0) => {
      if (!width || !height || disposed) return;
      const dt = Math.min(elapsed / 1000, .05);
      if (moving) {
        scene.time += dt;
        scene.yaw += (targetYaw - scene.yaw) * .045;
        scene.pitch += (targetPitch - scene.pitch) * .045;
        impulse *= .94;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(haze, 0, 0, width, height);
      const time = scene.time;
      const centerX = width * (width < 760 ? .50 : .32);
      const centerY = height * (width < 760 ? .18 : .25);
      const scale = Math.min(width * (width < 760 ? .20 : .115), 158, height * .20);
      const yaw = scene.yaw + Math.sin(time * .13) * .012;
      const pitch = scene.pitch + Math.sin(time * .18) * .007;
      const roll = Math.sin(time * .11) * .006;
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
      const cosR = Math.cos(roll), sinR = Math.sin(roll);
      const pointerActive = moving && performance.now() < pointerUntil;
      const positions = scene.displacement;
      const intensity = subdued ? .20 : width < 760 ? .42 : 1;
      for (let index = 0; index < scene.particles.length; index++) {
        const p = scene.particles[index];
        const drift = Math.sin(time * .9 + p.phase * .1) * p.flex * .012;
        const x = p.x, y = p.y + drift, z = p.z;
        const rx = x * cosY + z * sinY;
        const rz = -x * sinY + z * cosY;
        const ry = y * cosP - rz * sinP;
        const depth = y * sinP + rz * cosP;
        const perspective = 4.8 / (4.8 + depth);
        const px = centerX + (rx * cosR - ry * sinR) * scale * perspective;
        const py = centerY - (rx * sinR + ry * cosR) * scale * perspective + Math.sin(time * .24) * 2.5;
        const offset = index * 4;
        if (moving) {
          let forceX = 0, forceY = 0;
          if (pointerActive) {
            const dx = px + positions[offset] - pointerX;
            const dy = py + positions[offset + 1] - pointerY;
            const distance = Math.hypot(dx, dy);
            if (distance < 155 && distance > .1) {
              const force = (1 - distance / 155) ** 2 * 2.6;
              forceX = dx / distance * force;
              forceY = dy / distance * force;
            }
          }
          if (impulse > .02) {
            forceX += Math.cos(p.phase) * impulse * .22;
            forceY += Math.sin(p.phase) * impulse * .22;
          }
          positions[offset + 2] = (positions[offset + 2] + forceX - positions[offset] * .018) * .86;
          positions[offset + 3] = (positions[offset + 3] + forceY - positions[offset + 1] * .018) * .86;
          positions[offset] += positions[offset + 2];
          positions[offset + 1] += positions[offset + 3];
        }
        const shimmer = .94 + Math.sin(time * .33 + p.phase) * .06;
        const alpha = Math.min(.68, (.13 + p.brightness * .39) * perspective * shimmer) * intensity;
        const size = Math.max(.55, p.size * perspective * (width < 760 ? .85 : 1));
        ctx.fillStyle = pointColors[Math.min(127, Math.round(alpha * 127))];
        ctx.fillRect(px + positions[offset], py + positions[offset + 1], size, size);
      }
    };
    const resize = () => {
      width = window.innerWidth; height = window.innerHeight;
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      haze.width = canvas.width; haze.height = canvas.height;
      paintHaze(); render();
    };
    const tick = (now: number) => {
      if (disposed || !moving || document.hidden) return;
      frame = requestAnimationFrame(tick);
      if (!last) last = now;
      const elapsed = now - last;
      if (elapsed < 1000 / 30) return;
      last = now; render(elapsed);
    };
    const visibility = () => {
      cancelAnimationFrame(frame); last = 0;
      if (!document.hidden && moving) frame = requestAnimationFrame(tick);
    };
    const onPointer = (event: PointerEvent) => {
      pointerX = event.clientX; pointerY = event.clientY;
      pointerUntil = performance.now() + 2400;
      targetYaw = .06 + (event.clientX / width - .5) * .20;
      targetPitch = .04 + (event.clientY / height - .5) * .12;
    };
    const onLeave = () => { pointerUntil = 0; targetYaw = .06; targetPitch = .04; };
    const onPress = (event: PointerEvent) => {
      if ((event.target as Element | null)?.closest("button,a,input,textarea,select,summary,.terminal,[role=dialog]")) return;
      impulse = 5;
    };
    resize();
    if (moving && !document.hidden) frame = requestAnimationFrame(tick);
    window.addEventListener("resize", resize, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    if (moving) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onPress, { passive: true });
      document.addEventListener("pointerleave", onLeave);
    }
    return () => {
      disposed = true; cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPress);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [moving, subdued]);

  return <MotionContext.Provider value={{ moving, reducedMotion, toggle: () => setPaused((value) => !value) }}>
    <div className="ambient-artwork-scene" aria-hidden="true"><canvas ref={canvasRef} /></div>
    {children}
  </MotionContext.Provider>;
}

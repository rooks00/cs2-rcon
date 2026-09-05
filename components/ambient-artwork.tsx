"use client";

import { Pause, Play } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createTasheerParticles, TASHEER_SOURCE, type ArtworkParticle } from "@/lib/tasheer-particles";

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
  detailVisibility: number;
  particles: ArtworkParticle[];
  displacement: Float32Array;
};

const MotionContext = createContext<{
  moving: boolean;
  reducedMotion: boolean;
  toggle: () => void;
  registerStage: (element: HTMLDivElement | null) => void;
} | null>(null);

export function ArtworkStage() {
  const motion = useContext(MotionContext);
  return <div className="connection-artwork-stage" ref={motion?.registerStage} aria-hidden="true" />;
}

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
  const detailImageRef = useRef<HTMLImageElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const stageChangedRef = useRef<(() => void) | null>(null);
  const sceneRef = useRef<SceneState>({ time: 0, yaw: .06, pitch: .04, detailVisibility: 1, particles: [], displacement: new Float32Array(0) });
  const [paused, setPaused] = useState(false);
  const reducedMotion = useSyncExternalStore(subscribeMotion, motionPreference, () => true);
  const moving = !paused && !reducedMotion;
  const registerStage = useCallback((element: HTMLDivElement | null) => {
    stageRef.current = element;
    stageChangedRef.current?.();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;
    const ctx = context;
    const scene = sceneRef.current;
    if (!detailImageRef.current) {
      const detail = new Image();
      detail.decoding = "async";
      detail.src = "/artwork/tasheer-source.webp";
      detailImageRef.current = detail;
    }
    const detailImage = detailImageRef.current;
    const haze = document.createElement("canvas");
    const hazeContext = haze.getContext("2d");
    let width = 0, height = 0, ratio = 1, frame = 0, last = 0;
    let targetYaw = scene.yaw, targetPitch = scene.pitch;
    let pointerX = -10000, pointerY = -10000, pointerUntil = 0;
    let impulse = 0;
    let disposed = false;
    let scrollX = window.scrollX, scrollY = window.scrollY;
    let stageBounds: { left: number; top: number; width: number; height: number } | null = null;
    const mobile = window.matchMedia("(pointer: coarse)").matches;
    const count = mobile ? 5000 : 14000;
    const pointColors = Array.from({ length: 128 }, (_, index) => `rgba(226,229,226,${(index / 127).toFixed(3)})`);
    if (scene.particles.length !== count) {
      scene.particles = createTasheerParticles(count);
      scene.displacement = new Float32Array(count * 4);
    }

    const measureStage = () => {
      const bounds = stageRef.current?.getBoundingClientRect();
      stageBounds = bounds && bounds.width && bounds.height ? {
        left: bounds.left + window.scrollX,
        top: bounds.top + window.scrollY,
        width: bounds.width,
        height: bounds.height,
      } : null;
    };

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
      // Screen-blended black is neutral only over an opaque destination.
      ctx.fillStyle = "#0a0a0a";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(haze, 0, 0, width, height);
      if (!subdued && !stageBounds) return;
      const time = scene.time;
      // Document coordinates are measured on layout changes, never per frame.
      // Scrolling moves the drawing with its reserved stage in the left column.
      const stage = !subdued ? stageBounds : null;
      if (stage && (stage.top - scrollY >= height || stage.top - scrollY + stage.height <= 0)) return;
      const centerX = stage ? stage.left - scrollX + stage.width * .5 : width * .32;
      const centerY = stage ? stage.top - scrollY + stage.height * .5 : height * .25;
      const scale = stage ? Math.min(stage.height / 2.18, stage.width / 1.5, 290) : Math.min(width * .115, 158, height * .20);
      if (stage) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(stage.left - scrollX, stage.top - scrollY, stage.width, stage.height);
        ctx.clip();
      }
      const yaw = scene.yaw + Math.sin(time * .13) * .012;
      const pitch = scene.pitch + Math.sin(time * .18) * .007;
      const roll = Math.sin(time * .11) * .006;
      const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
      const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
      const cosR = Math.cos(roll), sinR = Math.sin(roll);
      const pointerActive = moving && performance.now() < pointerUntil;
      const positions = scene.displacement;
      const intensity = subdued ? .20 : width < 760 ? .88 : 1;
      const bob = Math.sin(time * .24) * 2.5;
      if (stage && detailImage.complete && detailImage.naturalWidth) {
        const source = TASHEER_SOURCE;
        const portraitWidth = (source.right - source.left) * source.scale * scale;
        const portraitHeight = (source.bottom - source.top) * source.scale * scale;
        const inspecting = pointerActive && Math.abs(pointerX - centerX) < portraitWidth * .6 && Math.abs(pointerY - centerY) < portraitHeight * .54;
        if (moving) scene.detailVisibility += ((inspecting || impulse > .1 ? 0 : 1) - scene.detailVisibility) * .12;

        // This affine transform maps source pixels onto the same shallow plane
        // as the points. Screen blending lets the black source fall away.
        const pixelScale = source.scale * scale;
        const a = pixelScale * (cosY * cosR - sinY * sinP * sinR);
        const b = -pixelScale * (cosY * sinR + sinY * sinP * cosR);
        const c = pixelScale * cosP * sinR;
        const d = pixelScale * cosP * cosR;
        const sourceCenterX = (source.left + source.right) * .5;
        const sourceCenterY = (source.top + source.bottom) * .5;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = (.045 + scene.detailVisibility * .165) * intensity;
        ctx.imageSmoothingQuality = "high";
        ctx.transform(a, b, c, d, centerX - a * sourceCenterX - c * sourceCenterY, centerY + bob - b * sourceCenterX - d * sourceCenterY);
        ctx.drawImage(detailImage, 0, 0, source.width, source.height);
        ctx.restore();
      }
      for (let index = 0; index < scene.particles.length; index++) {
        const p = scene.particles[index];
        const drift = Math.sin(time * .9 + p.phase * .1) * p.flex * .012;
        const x = p.x, y = p.y + drift, z = p.z;
        const rx = x * cosY + z * sinY;
        const rz = -x * sinY + z * cosY;
        const ry = y * cosP - rz * sinP;
        const depth = y * sinP + rz * cosP;
        const depthScale = 4.8 / (4.8 + depth);
        // Orthographic position keeps the photo and sampled pixels aligned;
        // the points' small z variation still supplies restrained parallax.
        const px = centerX + (rx * cosR - ry * sinR) * scale;
        const py = centerY - (rx * sinR + ry * cosR) * scale + bob;
        const offset = index * 4;
        if (moving) {
          let forceX = 0, forceY = 0;
          if (pointerActive) {
            const dx = px + positions[offset] - pointerX;
            const dy = py + positions[offset + 1] - pointerY;
            const distance = Math.hypot(dx, dy);
            if (distance < 120 && distance > .1) {
              const force = (1 - distance / 120) ** 2 * 1.5;
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
        const alpha = Math.min(.78, (.055 + p.brightness * .62) * depthScale * shimmer) * intensity;
        const size = Math.max(.55, p.size * depthScale * (width < 760 ? .85 : 1));
        ctx.fillStyle = pointColors[Math.min(127, Math.round(alpha * 127))];
        ctx.fillRect(px + positions[offset], py + positions[offset + 1], size, size);
      }
      if (stage) ctx.restore();
    };
    const onDetailReady = () => { if (!disposed) render(); };
    detailImage.addEventListener("load", onDetailReady);
    const stageObserver = new ResizeObserver(() => {
      measureStage();
      render();
    });
    const bindStage = () => {
      stageObserver.disconnect();
      const stage = stageRef.current;
      if (stage) {
        stageObserver.observe(stage);
        if (stage.parentElement) stageObserver.observe(stage.parentElement);
        if (stage.parentElement?.parentElement) stageObserver.observe(stage.parentElement.parentElement);
      }
      measureStage();
      render();
    };
    stageChangedRef.current = bindStage;
    const resize = () => {
      width = window.innerWidth; height = window.innerHeight;
      scrollX = window.scrollX; scrollY = window.scrollY;
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
      haze.width = canvas.width; haze.height = canvas.height;
      measureStage();
      paintHaze(); render();
    };
    const onScroll = () => {
      scrollX = window.scrollX; scrollY = window.scrollY;
      if (!moving) render();
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
      measureStage();
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
    bindStage();
    if (moving && !document.hidden) frame = requestAnimationFrame(tick);
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", visibility);
    if (moving) {
      window.addEventListener("pointermove", onPointer, { passive: true });
      window.addEventListener("pointerdown", onPress, { passive: true });
      document.addEventListener("pointerleave", onLeave);
    }
    return () => {
      disposed = true; cancelAnimationFrame(frame);
      detailImage.removeEventListener("load", onDetailReady);
      stageObserver.disconnect();
      stageChangedRef.current = null;
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPress);
      document.removeEventListener("pointerleave", onLeave);
    };
  }, [moving, subdued]);

  return <MotionContext.Provider value={{ moving, reducedMotion, toggle: () => setPaused((value) => !value), registerStage }}>
    <div className="ambient-artwork-scene" aria-hidden="true"><canvas ref={canvasRef} /></div>
    {children}
  </MotionContext.Provider>;
}

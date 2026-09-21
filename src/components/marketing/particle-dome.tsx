"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Hand-drawn canvas-2D particle field: thousands of short glowing blue dashes laid out on a
 * slowly rotating, rippling dome ("dome") or on concentric tilted rings ("rings").
 *
 * Perf: dashes are bucketed by brightness and each bucket is stroked as ONE path per pass
 * (glow pass + core pass) → ~20 stroke calls per frame regardless of particle count.
 * Pauses when offscreen / tab hidden; renders one static frame under prefers-reduced-motion.
 */
export function ParticleDome({
  variant = "dome",
  className,
  density = 1,
}: {
  variant?: "dome" | "rings";
  className?: string;
  density?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0;
    let h = 0;
    let dpr = 1;
    let raf = 0;
    let visible = true;
    let running = false;
    const t0 = performance.now();

    // Particles in spherical coords (phi from the pole, theta around), with per-particle jitter.
    type P = { phi: number; theta: number; len: number; seed: number };
    let parts: P[] = [];

    const build = () => {
      parts = [];
      const small = w < 700;
      const scale = density * (small ? 0.55 : 1);
      if (variant === "dome") {
        const rings = Math.round(46 * scale);
        for (let i = 1; i <= rings; i++) {
          const phi = (i / rings) * (Math.PI / 2) * 1.02;
          const count = Math.max(8, Math.round(Math.sin(phi) * 150 * scale));
          for (let j = 0; j < count; j++) {
            const seed = Math.random();
            parts.push({
              phi: phi + (seed - 0.5) * 0.012,
              theta: (j / count) * Math.PI * 2 + (i % 2) * (Math.PI / count) + (Math.random() - 0.5) * 0.02,
              len: 0.6 + seed * 0.8,
              seed,
            });
          }
        }
      } else {
        const rings = Math.round(22 * scale);
        for (let i = 1; i <= rings; i++) {
          const r = i / rings;
          const count = Math.round(40 + r * 170 * scale);
          for (let j = 0; j < count; j++) {
            const seed = Math.random();
            parts.push({ phi: r, theta: (j / count) * Math.PI * 2 + seed * 0.03, len: 0.6 + seed * 0.8, seed });
          }
        }
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (!running) draw(performance.now());
    };

    const BUCKETS = 10;
    const paths: Path2D[] = [];

    const draw = (now: number) => {
      const t = reduced ? 8 : (now - t0) / 1000;
      ctx.clearRect(0, 0, w, h);
      for (let b = 0; b < BUCKETS; b++) paths[b] = new Path2D();

      if (variant === "dome") {
        const R = Math.min(w * 0.62, h * 1.22, 980); // keep the crown inside the canvas
        const cx = w / 2;
        const cy = h * 0.98; // dome base sits at the bottom of the canvas
        const tilt = 0.38; // camera looks slightly down onto the dome
        const ct = Math.cos(tilt);
        const st = Math.sin(tilt);
        const f = R * 2.6;
        const spin = t * 0.035;
        for (const p of parts) {
          // Ripple: a wave travelling from the pole outwards + a slow azimuthal swell.
          const wave = Math.sin(p.phi * 9 - t * 1.4 + Math.sin(p.theta * 3 + t * 0.3) * 0.6);
          const rr = R * (1 + 0.028 * wave);
          const th = p.theta + spin;
          const sp = Math.sin(p.phi);
          const x3 = rr * sp * Math.cos(th);
          const y3 = rr * Math.cos(p.phi);
          const z3 = rr * sp * Math.sin(th);
          const y = y3 * ct - z3 * st;
          const z = y3 * st + z3 * ct;
          if (z < -R * 0.15) continue; // back side hidden (stays dark like the reference)
          const s = f / (f + (R - z));
          const sx = cx + x3 * s;
          const sy = cy - y * s;
          if (sy < -10 || sy > h + 10) continue;
          // Tangent along the meridian (d/dphi) → dash orientation.
          const cp = Math.cos(p.phi);
          const tx = cp * Math.cos(th);
          const ty3 = -sp;
          const tz = cp * Math.sin(th);
          const ty = ty3 * ct - tz * st;
          const len = (3.2 + 3.2 * p.len) * s * (1 + 0.35 * wave);
          const dx = tx * len;
          const dy = -ty * len;
          const depth = (z / R + 0.15) / 1.15; // 0 back .. 1 front
          const bright = Math.max(0, Math.min(1, depth * 0.75 + 0.25 * (0.5 + 0.5 * wave) + (1 - p.phi / 1.6) * 0.15));
          const b = Math.min(BUCKETS - 1, Math.floor(bright * BUCKETS));
          paths[b].moveTo(sx - dx, sy - dy);
          paths[b].lineTo(sx + dx, sy + dy);
        }
      } else {
        // Concentric tilted rings off to the right (closing CTA).
        const cx = w * 0.82;
        const cy = h * 0.5;
        const R = Math.max(w, h) * 0.55;
        const spin = t * 0.05;
        for (const p of parts) {
          const th = p.theta + spin * (0.4 + p.phi);
          const wave = Math.sin(p.phi * 14 - t * 1.2);
          const rr = R * p.phi * (1 + 0.02 * wave);
          const sx = cx + rr * Math.cos(th) * 0.9;
          const sy = cy + rr * Math.sin(th);
          if (sx < -10 || sx > w + 10 || sy < -10 || sy > h + 10) continue;
          const len = (2.5 + 3 * p.len) * (0.6 + p.phi * 0.8);
          // Radial dashes like a fingerprint/ripple.
          const dx = Math.cos(th) * 0.9 * len;
          const dy = Math.sin(th) * len;
          const bright = Math.max(0, Math.min(1, 0.35 + 0.45 * (0.5 + 0.5 * wave) + (1 - p.phi) * 0.3));
          const b = Math.min(BUCKETS - 1, Math.floor(bright * BUCKETS));
          paths[b].moveTo(sx - dx, sy - dy);
          paths[b].lineTo(sx + dx, sy + dy);
        }
      }

      ctx.lineCap = "round";
      ctx.globalCompositeOperation = "lighter";
      for (let b = 0; b < BUCKETS; b++) {
        const a = (b + 1) / BUCKETS;
        // Glow pass
        ctx.strokeStyle = `rgba(59,130,246,${0.14 * a})`;
        ctx.lineWidth = 6;
        ctx.stroke(paths[b]);
        // Core pass
        ctx.strokeStyle = `rgba(${Math.round(120 + 70 * a)},${Math.round(180 + 40 * a)},255,${0.18 + 0.7 * a})`;
        ctx.lineWidth = 1.9;
        ctx.stroke(paths[b]);
      }
      ctx.globalCompositeOperation = "source-over";
    };

    const loop = (now: number) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    const start = () => {
      if (running || reduced || !visible || document.hidden) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };
    const stop = () => {
      running = false;
      cancelAnimationFrame(raf);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) start();
      else stop();
    });
    io.observe(canvas);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    resize();
    start();

    return () => {
      stop();
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [variant, density]);

  return <canvas ref={ref} aria-hidden className={cn("pointer-events-none block size-full", className)} />;
}

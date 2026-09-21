"use client";

import { createContext, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * One player store per call page. Everything (stage, timeline, transcript, summary chips, Ask citations)
 * reads `currentMs` through selectors so only components whose *derived* value changes re-render.
 *
 * Media: an <audio>/<video> element is attached via `attach()`. If there is no media (or it fails to load),
 * the store falls back to a virtual clock so the synced UI remains fully demonstrable.
 * Optional `bounds` restrict playback to a clip window.
 */
export interface PlayerState {
  currentMs: number;
  durationMs: number;
  playing: boolean;
  rate: number;
  volume: number;
  muted: boolean;
  buffering: boolean;
  virtual: boolean; // true when no playable media → simulated clock
}

export const PLAYBACK_RATES = [1, 1.25, 1.5, 2] as const;

type Listener = () => void;

export class PlayerStore {
  private state: PlayerState;
  private listeners = new Set<Listener>();
  private el: HTMLMediaElement | null = null;
  private raf = 0;
  private lastTick = 0;
  private pendingSeekMs: number | null = null;
  private detachFns: (() => void)[] = [];
  bounds: { startMs: number; endMs: number } | null;

  constructor(durationMs: number, opts?: { bounds?: { startMs: number; endMs: number }; virtual?: boolean }) {
    this.bounds = opts?.bounds ?? null;
    this.state = {
      currentMs: this.bounds?.startMs ?? 0,
      durationMs,
      playing: false,
      rate: 1,
      volume: 1,
      muted: false,
      buffering: false,
      virtual: opts?.virtual ?? false,
    };
  }

  getState = () => this.state;

  subscribe = (l: Listener) => {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  };

  private set(patch: Partial<PlayerState>) {
    let changed = false;
    for (const k in patch) {
      const key = k as keyof PlayerState;
      if (this.state[key] !== patch[key]) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((l) => l());
  }

  attach(el: HTMLMediaElement | null) {
    this.detachFns.forEach((f) => f());
    this.detachFns = [];
    this.el = el;
    if (!el) return;
    el.playbackRate = this.state.rate;
    el.volume = this.state.volume;
    el.muted = this.state.muted;
    const on = (ev: string, fn: () => void) => {
      el.addEventListener(ev, fn);
      this.detachFns.push(() => el.removeEventListener(ev, fn));
    };
    on("loadedmetadata", () => {
      if (Number.isFinite(el.duration) && el.duration > 0) this.set({ durationMs: Math.round(el.duration * 1000) });
      if (this.pendingSeekMs !== null) {
        el.currentTime = this.pendingSeekMs / 1000;
        this.pendingSeekMs = null;
      }
    });
    on("play", () => {
      this.set({ playing: true });
      this.startLoop();
    });
    on("pause", () => {
      this.set({ playing: false, ...(el.readyState >= 1 ? { currentMs: Math.round(el.currentTime * 1000) } : {}) });
      this.stopLoop();
    });
    on("ended", () => {
      this.set({ playing: false });
      this.stopLoop();
    });
    on("waiting", () => this.set({ buffering: true }));
    on("playing", () => this.set({ buffering: false }));
    on("canplay", () => this.set({ buffering: false }));
    on("error", () => this.fallbackToVirtual());
    // The element may have failed before hydration attached our listeners.
    if (el.error || el.networkState === HTMLMediaElement.NETWORK_NO_SOURCE) {
      this.fallbackToVirtual();
      return;
    }
    // Some browsers sit in NETWORK_LOADING on a 404 without firing "error": preflight the URL.
    const src = el.currentSrc || el.getAttribute("src");
    if (src && el.readyState < 1) {
      fetch(src, { method: "HEAD" })
        .then((r) => {
          if (!r.ok && this.el === el) this.fallbackToVirtual();
        })
        .catch(() => {});
    }
    if (this.state.currentMs > 0) {
      if (el.readyState >= 1) el.currentTime = this.state.currentMs / 1000;
      else this.pendingSeekMs = this.state.currentMs;
    }
  }

  /** Media missing/unplayable → keep the experience working with a simulated clock. */
  private fallbackToVirtual() {
    const wasPlaying = this.state.playing;
    this.detachFns.forEach((f) => f());
    this.detachFns = [];
    const dead = this.el;
    this.el = null;
    try {
      dead?.pause();
    } catch {}
    this.set({ virtual: true, buffering: false });
    if (wasPlaying) this.startLoop();
  }

  private startLoop() {
    cancelAnimationFrame(this.raf);
    this.lastTick = performance.now();
    const startedAt = this.lastTick;
    const tick = (now: number) => {
      const dt = now - this.lastTick;
      this.lastTick = now;
      let t: number;
      if (this.el && this.el.readyState < 1 && now - startedAt > 4000) {
        // Stalled with no metadata → media is unusable; continue on the simulated clock.
        this.fallbackToVirtual();
        return;
      }
      if (this.el) {
        // Before metadata loads, currentTime is 0 — keep our (possibly seeked) position.
        t = this.el.readyState >= 1 ? Math.round(this.el.currentTime * 1000) : this.state.currentMs;
      } else {
        t = Math.min(this.state.currentMs + dt * this.state.rate, this.state.durationMs);
      }
      const end = this.bounds?.endMs ?? this.state.durationMs;
      if (t >= end) {
        this.pause();
        this.set({ currentMs: end });
        return;
      }
      this.set({ currentMs: t });
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private stopLoop() {
    cancelAnimationFrame(this.raf);
  }

  play = () => {
    const end = this.bounds?.endMs ?? this.state.durationMs;
    if (this.state.currentMs >= end - 250) this.seek(this.bounds?.startMs ?? 0);
    if (this.el && !this.state.virtual) {
      const el = this.el;
      el.play().catch((err: unknown) => {
        if (el.error || (err instanceof DOMException && err.name === "NotSupportedError")) {
          this.fallbackToVirtual();
          this.set({ playing: true });
          this.startLoop();
        }
        // NotAllowedError (autoplay policy) → user can press play again.
      });
    } else {
      this.set({ playing: true });
      this.startLoop();
    }
  };

  pause = () => {
    if (this.el && !this.state.virtual) this.el.pause();
    else {
      this.set({ playing: false });
      this.stopLoop();
    }
  };

  toggle = () => (this.state.playing ? this.pause() : this.play());

  seek = (ms: number, opts?: { play?: boolean }) => {
    const min = this.bounds?.startMs ?? 0;
    const max = this.bounds?.endMs ?? this.state.durationMs;
    const t = Math.max(min, Math.min(Math.round(ms), max));
    this.set({ currentMs: t });
    if (this.el && !this.state.virtual) {
      if (this.el.readyState >= 1) this.el.currentTime = t / 1000;
      else this.pendingSeekMs = t;
    }
    if (opts?.play) this.play();
  };

  /** Restrict playback to a window (clip trim preview); null = whole recording. */
  setBounds = (b: { startMs: number; endMs: number } | null) => {
    this.bounds = b;
  };

  skip = (deltaMs: number) => this.seek(this.state.currentMs + deltaMs);

  setRate = (rate: number) => {
    if (this.el) this.el.playbackRate = rate;
    this.set({ rate });
  };

  cycleRate = (dir: 1 | -1) => {
    const i = PLAYBACK_RATES.indexOf(this.state.rate as (typeof PLAYBACK_RATES)[number]);
    const next = PLAYBACK_RATES[Math.max(0, Math.min(PLAYBACK_RATES.length - 1, (i < 0 ? 0 : i) + dir))];
    this.setRate(next);
    return next;
  };

  setVolume = (v: number) => {
    const volume = Math.max(0, Math.min(1, v));
    if (this.el) {
      this.el.volume = volume;
      this.el.muted = volume === 0;
    }
    this.set({ volume, muted: volume === 0 });
  };

  toggleMute = () => {
    const muted = !this.state.muted;
    if (this.el) this.el.muted = muted;
    this.set({ muted });
  };

  destroy() {
    this.stopLoop();
    this.detachFns.forEach((f) => f());
    this.listeners.clear();
  }
}

const PlayerContext = createContext<PlayerStore | null>(null);

export function PlayerProvider({
  durationMs,
  bounds,
  virtual,
  children,
}: {
  durationMs: number;
  bounds?: { startMs: number; endMs: number };
  virtual?: boolean;
  children: React.ReactNode;
}) {
  const [store] = useState(() => new PlayerStore(durationMs, { bounds, virtual }));
  const ref = useRef(store);
  useEffect(() => {
    const s = ref.current;
    return () => s.destroy();
  }, []);
  return <PlayerContext.Provider value={store}>{children}</PlayerContext.Provider>;
}

export function usePlayerStore(): PlayerStore {
  const s = useContext(PlayerContext);
  if (!s) throw new Error("usePlayerStore must be used inside <PlayerProvider>");
  return s;
}

/** Subscribe to a derived primitive from player state (re-renders only when it changes). */
export function usePlayer<T>(selector: (s: PlayerState) => T): T {
  const store = usePlayerStore();
  return useSyncExternalStore(
    store.subscribe,
    () => selector(store.getState()),
    () => selector(store.getState()),
  );
}

/** Binary search: index of the last item whose start_ms <= t (or -1). Items must be sorted by start_ms. */
export function indexAt<T extends { start_ms: number }>(items: T[], t: number): number {
  let lo = 0;
  let hi = items.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (items[mid].start_ms <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

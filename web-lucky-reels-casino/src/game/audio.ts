import { SFX, type SfxName } from "./machines";

export interface PlayOptions {
  volume?: number;
  rate?: number;
  loop?: boolean;
}

export interface SoundHandle {
  stop(fadeMs?: number): void;
}

const NOOP_HANDLE: SoundHandle = { stop: () => undefined };

interface MusicTrack {
  el: HTMLAudioElement;
  gain: GainNode | null;
}

type AudioCtor = typeof AudioContext;

/**
 * Web Audio engine. Sound effects are decoded buffers (zero latency), music is
 * streamed through media elements routed into a gain node so it can crossfade
 * and duck on every platform, including iOS.
 */
class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private buffers = new Map<SfxName, AudioBuffer>();
  private loading = new Map<SfxName, Promise<void>>();
  private tracks = new Map<string, MusicTrack>();
  private current: string | null = null;
  private wanted: string | null = null;
  private unlocked = false;
  private duckTimer: ReturnType<typeof setTimeout> | null = null;
  musicEnabled = true;
  sfxEnabled = true;

  constructor() {
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (!this.ctx) return;
        if (document.hidden) void this.ctx.suspend().catch(() => undefined);
        else if (this.unlocked) void this.ctx.resume().catch(() => undefined);
      });
    }
  }

  private ensureCtx(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const w = window as unknown as { AudioContext?: AudioCtor; webkitAudioContext?: AudioCtor };
    const Ctor = w.AudioContext ?? w.webkitAudioContext;
    if (!Ctor) return null;
    try {
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.9;
      this.sfxGain.connect(this.master);
      this.musicBus = this.ctx.createGain();
      this.musicBus.gain.value = 0.42;
      this.musicBus.connect(this.master);
    } catch (err) {
      console.warn("Audio unavailable", err instanceof Error ? err.message : "unknown");
      this.ctx = null;
    }
    return this.ctx;
  }

  /** Must be called from a user gesture at least once. */
  unlock(): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    this.unlocked = true;
    if (ctx.state !== "running") void ctx.resume().catch(() => undefined);
    // Some browsers only start media elements from inside a gesture.
    this.applyMusic();
  }

  /** Fetches and decodes sound effects. Resolves even if some files fail. */
  async load(names: SfxName[], onProgress?: (p: number) => void): Promise<void> {
    const ctx = this.ensureCtx();
    if (!ctx) {
      onProgress?.(1);
      return;
    }
    let done = 0;
    const total = names.length || 1;
    await Promise.all(
      names.map((name) => {
        let p = this.loading.get(name);
        if (!p) {
          p = fetch(SFX[name])
            .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
            .then((buf) => ctx.decodeAudioData(buf))
            .then((decoded) => {
              this.buffers.set(name, decoded);
            })
            .catch((err: unknown) => {
              console.warn(`Sound ${name} failed to load`, err instanceof Error ? err.message : "unknown");
              this.loading.delete(name);
            });
          this.loading.set(name, p);
        }
        return p.finally(() => {
          done += 1;
          onProgress?.(done / total);
        });
      }),
    );
  }

  play(name: SfxName, opts: PlayOptions = {}): SoundHandle {
    if (!this.sfxEnabled) return NOOP_HANDLE;
    const ctx = this.ctx;
    const buffer = this.buffers.get(name);
    if (!ctx || !buffer || !this.sfxGain) {
      if (!buffer) void this.load([name]);
      return NOOP_HANDLE;
    }
    if (ctx.state !== "running") {
      if (this.unlocked) void ctx.resume().catch(() => undefined);
      return NOOP_HANDLE;
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = opts.loop ?? false;
    src.playbackRate.value = opts.rate ?? 1;
    const gain = ctx.createGain();
    gain.gain.value = opts.volume ?? 1;
    src.connect(gain).connect(this.sfxGain);
    src.start();
    let stopped = false;
    return {
      stop: (fadeMs = 80) => {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;
        gain.gain.cancelScheduledValues(t);
        gain.gain.setValueAtTime(gain.gain.value, t);
        gain.gain.linearRampToValueAtTime(0, t + fadeMs / 1000);
        try {
          src.stop(t + fadeMs / 1000 + 0.02);
        } catch {
          /* already stopped */
        }
      },
    };
  }

  /** Crossfades to a music track (or silence with null). */
  setMusic(url: string | null): void {
    this.wanted = url;
    this.applyMusic();
  }

  private track(url: string): MusicTrack {
    let t = this.tracks.get(url);
    if (t) return t;
    const el = new Audio(url);
    el.loop = true;
    el.preload = "auto";
    let gain: GainNode | null = null;
    const ctx = this.ctx;
    if (ctx && this.musicBus) {
      try {
        const src = ctx.createMediaElementSource(el);
        gain = ctx.createGain();
        gain.gain.value = 0;
        src.connect(gain).connect(this.musicBus);
      } catch {
        gain = null;
      }
    }
    t = { el, gain };
    this.tracks.set(url, t);
    return t;
  }

  private fade(t: MusicTrack, to: number, ms: number): void {
    if (t.gain && this.ctx) {
      const now = this.ctx.currentTime;
      t.gain.gain.cancelScheduledValues(now);
      t.gain.gain.setValueAtTime(t.gain.gain.value, now);
      t.gain.gain.linearRampToValueAtTime(to, now + ms / 1000);
    } else {
      t.el.volume = Math.max(0, Math.min(1, to * 0.45));
    }
  }

  private applyMusic(): void {
    const target = this.musicEnabled && this.unlocked ? this.wanted : null;
    for (const [url, t] of this.tracks) {
      if (url !== target && !t.el.paused) {
        this.fade(t, 0, 600);
        setTimeout(() => {
          if (this.current !== url || !this.musicEnabled) t.el.pause();
        }, 650);
      }
    }
    if (!target) {
      this.current = null;
      return;
    }
    this.ensureCtx();
    const t = this.track(target);
    this.current = target;
    if (t.el.paused) {
      t.el.play().catch(() => undefined);
    }
    this.fade(t, 1, 900);
  }

  /** Temporarily lowers music (e.g. under a big-win fanfare). */
  duck(level: number, ms: number): void {
    if (!this.musicBus || !this.ctx) return;
    const now = this.ctx.currentTime;
    this.musicBus.gain.cancelScheduledValues(now);
    this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, now);
    this.musicBus.gain.linearRampToValueAtTime(0.42 * level, now + 0.25);
    if (this.duckTimer) clearTimeout(this.duckTimer);
    this.duckTimer = setTimeout(() => {
      if (!this.musicBus || !this.ctx) return;
      const t = this.ctx.currentTime;
      this.musicBus.gain.cancelScheduledValues(t);
      this.musicBus.gain.setValueAtTime(this.musicBus.gain.value, t);
      this.musicBus.gain.linearRampToValueAtTime(0.42, t + 0.8);
    }, ms);
  }

  setMusicEnabled(on: boolean): void {
    this.musicEnabled = on;
    this.applyMusic();
  }

  setSfxEnabled(on: boolean): void {
    this.sfxEnabled = on;
  }
}

export const audio = new AudioEngine();

/** Short haptic pulse on devices that support it. */
export function vibrate(pattern: number | number[]): void {
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

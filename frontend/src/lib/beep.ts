// Tiny, dependency-free audio blip for the ENTER-transition alert. Uses the Web
// Audio API so there is no asset to bundle. Browser autoplay policy requires a
// prior user gesture — call unlockAudio() from the Analyse click, then
// playEntryBeep() may sound on a later WAIT → ENTER transition. All no-ops when
// audio is unavailable (SSR, unsupported, blocked). Advisory only.

let ctx: AudioContext | null = null;

function audioCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    if (!ctx) ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/** Enable audio on a user gesture (call from the Analyse button click). */
export function unlockAudio(): void {
  const c = audioCtx();
  if (c && c.state === "suspended") void c.resume();
}

/** Short two-tone confirmation blip. No-op if audio is unavailable/blocked. */
export function playEntryBeep(): void {
  const c = audioCtx();
  if (!c) return;
  try {
    if (c.state === "suspended") void c.resume();
    const now = c.currentTime;
    const tone = (freq: number, start: number, dur: number) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + start);
      g.gain.exponentialRampToValueAtTime(0.16, now + start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(now + start);
      o.stop(now + start + dur);
    };
    tone(880, 0, 0.12);
    tone(1320, 0.12, 0.16);
  } catch {
    /* ignore */
  }
}

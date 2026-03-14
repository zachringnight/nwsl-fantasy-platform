/**
 * Haptic and sound feedback utilities.
 * Provides non-blocking sensory feedback for key user actions.
 */

/** Trigger a short haptic vibration if available */
export function hapticLight() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(10);
    }
  } catch {
    // Silently fail — haptic is enhancement-only
  }
}

/** Trigger a medium haptic vibration for confirmations */
export function hapticMedium() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate(25);
    }
  } catch {
    // Silently fail
  }
}

/** Trigger a strong double-pulse for celebrations */
export function hapticHeavy() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([30, 50, 30]);
    }
  } catch {
    // Silently fail
  }
}

/** Trigger an error haptic pattern */
export function hapticError() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate([15, 40, 15, 40, 15]);
    }
  } catch {
    // Silently fail
  }
}

/**
 * Play a short feedback sound using the Web Audio API.
 * Does not require pre-loaded audio files.
 */
function playTone(frequency: number, duration: number, volume = 0.12) {
  try {
    if (typeof window === "undefined") return;
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.frequency.value = frequency;
    oscillator.type = "sine";
    gain.gain.value = volume;

    // Fade out to avoid click
    gain.gain.setTargetAtTime(0, ctx.currentTime + duration * 0.7, duration * 0.15);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + duration);

    // Clean up
    oscillator.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch {
    // Silently fail — audio is enhancement-only
  }
}

/** Success chime — ascending two-note */
export function soundSuccess() {
  playTone(523.25, 0.1, 0.1); // C5
  setTimeout(() => playTone(659.25, 0.15, 0.1), 100); // E5
}

/** Pick confirmation — single clean tone */
export function soundPick() {
  playTone(440, 0.08, 0.08); // A4
}

/** Error/warning buzz */
export function soundError() {
  playTone(220, 0.12, 0.06); // A3
}

/** Celebration jingle — quick ascending triad */
export function soundCelebrate() {
  playTone(523.25, 0.1, 0.1); // C5
  setTimeout(() => playTone(659.25, 0.1, 0.1), 80); // E5
  setTimeout(() => playTone(783.99, 0.18, 0.12), 160); // G5
}

/** Combined haptic + sound feedback for common actions */
export const feedback = {
  pick: () => { hapticMedium(); soundPick(); },
  success: () => { hapticMedium(); soundSuccess(); },
  celebrate: () => { hapticHeavy(); soundCelebrate(); },
  error: () => { hapticError(); soundError(); },
  tap: () => { hapticLight(); },
} as const;

import { settingsStore } from "./settings";

/** Short synthesized sounds (no audio files) and haptics for answers. */
let ctx: AudioContext | null = null;

function tone(
  freq: number,
  start: number,
  duration: number,
  type: OscillatorType = "sine",
  gain = 0.12,
) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

function audio(): boolean {
  if (!settingsStore.get().sound) return false;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return true;
  } catch {
    return false;
  }
}

/**
 * iOS Safari has no Vibration API; since iOS 18 toggling an `<input type="checkbox" switch>`
 * through its label triggers the system haptic. Must run inside a user gesture.
 */
let switchLabel: HTMLLabelElement | null = null;
function iosHaptic() {
  if (!switchLabel) {
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.id = "haptic-switch";
    switchLabel = document.createElement("label");
    switchLabel.htmlFor = input.id;
    const box = document.createElement("div");
    box.style.cssText = "position:fixed;left:-9999px;opacity:0;pointer-events:none";
    box.append(input, switchLabel);
    document.body.append(box);
  }
  switchLabel.click();
}

function haptic(pattern: number | number[]) {
  if (!settingsStore.get().haptics) return;
  if (typeof navigator.vibrate === "function") navigator.vibrate(pattern);
  else iosHaptic();
}

export const feedback = {
  correct() {
    if (audio()) {
      tone(660, 0, 0.12, "triangle");
      tone(990, 0.09, 0.18, "triangle");
    }
    haptic(15);
  },
  wrong() {
    if (audio()) tone(160, 0, 0.28, "sawtooth", 0.07);
    haptic([30, 60, 30]);
  },
  levelUp() {
    if (audio()) [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, "triangle"));
    haptic([20, 40, 20, 40, 40]);
  },
  tap() {
    haptic(8);
  },
};

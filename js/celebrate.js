/**
 * Soft completion fanfare + star burst helpers (no external audio files).
 */

let audioCtx = null;

function getCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

/** Gentle ascending arpeggio — short and quiet. */
export function playSoftFanfare() {
  const ctx = getCtx();
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  const start = ctx.currentTime + 0.02;
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = freq;
    const t0 = start + i * 0.14;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.07, t0 + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.45);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.5);
  });
}

export function starBurstHtml(count = 8) {
  const glyphs = ['✦', '★', '✧', '✩'];
  return Array.from({ length: count }, (_, i) => {
    const g = glyphs[i % glyphs.length];
    const delay = (i * 0.08).toFixed(2);
    const left = 8 + (i * 11) % 84;
    return `<span class="celeb-star" style="left:${left}%;animation-delay:${delay}s">${g}</span>`;
  }).join('');
}

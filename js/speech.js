/**
 * Speech synthesis helper.
 *
 * Android Chrome root cause addressed:
 * calling speechSynthesis.cancel() and then speak() in the same turn often
 * drops the new utterance. We serialize playback through a queue and delay
 * the next speak until after cancel settles (rAF + short timeout).
 *
 * Voices may load asynchronously — listen to voiceschanged.
 * Speech is not guaranteed on every device/OS voice pack.
 */
import { speechLocale } from './registry.js';

export function createSpeechController({ getRate, getVoiceName, onStatus }) {
  let voices = [];
  let queue = [];
  let current = null;
  let playingIndex = null;
  let generation = 0;
  let cancelTimer = null;

  function notify(msg) {
    if (typeof onStatus === 'function') onStatus(msg);
  }

  function supported() {
    return typeof window !== 'undefined'
      && 'speechSynthesis' in window
      && 'SpeechSynthesisUtterance' in window;
  }

  function refreshVoices() {
    if (!supported()) return;
    voices = window.speechSynthesis.getVoices() || [];
  }

  function voicesFor(lang) {
    const prefix = String(lang || '').toLowerCase();
    return voices.filter((v) => {
      const vl = (v.lang || '').toLowerCase();
      return vl === speechLocale(lang).toLowerCase()
        || vl.startsWith(prefix)
        || vl.replace('_', '-').startsWith(prefix);
    });
  }

  function pickVoice(lang) {
    const list = voices.length ? voices : (supported() ? window.speechSynthesis.getVoices() : []);
    const preferred = getVoiceName?.(lang);
    const locale = speechLocale(lang).toLowerCase();
    return list.find((v) => preferred && v.name === preferred)
      || list.find((v) => (v.lang || '').toLowerCase() === locale)
      || list.find((v) => (v.lang || '').toLowerCase().startsWith(String(lang).toLowerCase()))
      || null;
  }

  function hasVoiceHint(lang) {
    refreshVoices();
    return voicesFor(lang).length > 0 || pickVoice(lang) != null;
  }

  function clearHighlight() {
    playingIndex = null;
    document.querySelectorAll?.('.sentence-row.speaking')?.forEach((el) => el.classList.remove('speaking'));
  }

  function highlight(index) {
    playingIndex = index;
    document.querySelectorAll?.('.sentence-row')?.forEach((el) => {
      el.classList.toggle('speaking', Number(el.dataset.sentence) === index);
    });
  }

  function hardCancel() {
    queue = [];
    current = null;
    generation += 1;
    clearTimeout(cancelTimer);
    clearHighlight();
    if (supported()) {
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
    }
  }

  function stop(silent = false) {
    hardCancel();
    if (!silent) notify('stopped');
  }

  function speakNext() {
    if (!queue.length) {
      current = null;
      clearHighlight();
      return;
    }
    const item = queue.shift();
    actuallySpeak(item);
  }

  function scheduleAfterCancel(fn) {
    // Allow cancel() to settle before speak() — fixes Android Chrome dropouts.
    clearTimeout(cancelTimer);
    const raf = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb) => setTimeout(cb, 16);
    cancelTimer = setTimeout(() => {
      raf(() => fn());
    }, 40);
  }

  function actuallySpeak({ text, lang, index, gen }) {
    if (!supported()) {
      notify('unsupported');
      return;
    }
    if (gen !== generation) return;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = speechLocale(lang);
    utterance.rate = Number(getRate?.()) || 0.85;
    utterance.pitch = 1;
    const voice = pickVoice(lang);
    if (voice) utterance.voice = voice;
    else if (!hasVoiceHint(lang)) notify('missing-voice:' + speechLocale(lang));

    current = utterance;
    if (index != null) highlight(index);
    let started = false;

    utterance.onstart = () => {
      if (gen !== generation) return;
      started = true;
      if (index != null) highlight(index);
    };
    utterance.onend = () => {
      if (gen !== generation || current !== utterance) return;
      current = null;
      clearHighlight();
      speakNext();
    };
    utterance.onerror = (e) => {
      if (gen !== generation || current !== utterance) return;
      current = null;
      clearHighlight();
      const err = e?.error || '';
      if (err !== 'interrupted' && err !== 'canceled') {
        queue = [];
        notify('error:' + speechLocale(lang));
      } else {
        speakNext();
      }
    };

    try {
      window.speechSynthesis.speak(utterance);
      // Chrome sometimes parks the synth in paused state.
      try { window.speechSynthesis.resume(); } catch { /* ignore */ }
      setTimeout(() => {
        if (gen === generation && current === utterance && !started) {
          try { window.speechSynthesis.resume(); } catch { /* ignore */ }
        }
      }, 350);
    } catch {
      notify('error:' + speechLocale(lang));
    }
  }

  function enqueue(items, { replace = true } = {}) {
    if (!supported()) {
      notify('unsupported');
      return;
    }
    const gen = replace ? (generation + 1) : generation;
    if (replace) {
      generation = gen;
      queue = [];
      current = null;
      try { window.speechSynthesis.cancel(); } catch { /* ignore */ }
      scheduleAfterCancel(() => {
        queue = items.map((it) => ({ ...it, gen }));
        speakNext();
      });
    } else {
      queue.push(...items.map((it) => ({ ...it, gen: generation })));
      if (!current) speakNext();
    }
  }

  function speakText(text, lang, index = null) {
    if (!text) return;
    enqueue([{ text, lang, index }], { replace: true });
  }

  function speakSequence(lines, lang) {
    const items = lines.map((text, index) => ({ text, lang, index }));
    enqueue(items, { replace: true });
  }

  function bindVoiceEvents() {
    if (!supported()) return;
    refreshVoices();
    if (typeof window.speechSynthesis.addEventListener === 'function') {
      window.speechSynthesis.addEventListener('voiceschanged', refreshVoices);
    } else {
      window.speechSynthesis.onvoiceschanged = refreshVoices;
    }
    setTimeout(refreshVoices, 250);
    setTimeout(refreshVoices, 1000);
    if (typeof window.addEventListener === 'function') {
      window.addEventListener('pagehide', () => stop(true));
    }
  }

  return {
    supported,
    refreshVoices,
    getVoices: () => voices.slice(),
    voicesFor,
    pickVoice,
    hasVoiceHint,
    speakText,
    speakSequence,
    stop,
    getPlayingIndex: () => playingIndex,
    bindVoiceEvents,
  };
}

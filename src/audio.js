const SOUNDS = {
  press: { file: 'stapler-press', volume: .48, cooldown: .022, voices: 4, variation: .035 },
  jam: { file: 'stapler-jam', volume: .42, cooldown: .12, voices: 1 },
  paper: { file: 'paper-shuffle', volume: .75, cooldown: .055, voices: 2 },
  clock: { file: 'clock-in', volume: .48, cooldown: .3, voices: 1 },
  break: { file: 'ceramic-break', volume: .42, cooldown: .075, voices: 2 },
  pick: { file: 'object-pick', volume: .60, cooldown: .045, voices: 2 },
  throw: { file: 'object-throw', volume: .22, cooldown: .06, voices: 2 },
  sip: { file: 'coffee-sip', volume: .3, cooldown: .15, voices: 1 },
  write: { file: 'pencil-write', volume: .29, cooldown: .12, voices: 1 },
  erase: { file: 'eraser', volume: .29, cooldown: .12, voices: 1 },
  stamp: { file: 'stamp', volume: .48, cooldown: .08, voices: 2 },
  rattle: { file: 'desk-rattle', volume: .32, cooldown: .12, voices: 2 },
  key: { file: 'ui-click', volume: .24, cooldown: .045, voices: 2 },
  success: { file: 'success', volume: .44, cooldown: .2, voices: 1 },
  error: { file: 'error', volume: .10, cooldown: .12, voices: 1 },
  complete: { file: 'complete', volume: .56, cooldown: .3, voices: 1 },
  ambience: { file: 'office-ambience', volume: .20, cooldown: 0, voices: 1 },
};

const ALIASES = {
  'test-stapler': 'press', align: 'paper', shuffle: 'paper', sort: 'paper', note: 'paper',
  'clock-in': 'clock', clocked: 'key', start: 'paper', gameover: 'error', put: 'pick',
};

/** Local audio only. The optional dependencies make playback behavior testable without a browser. */
export function createGameAudio({
  muted: initiallyMuted = false,
  contextFactory = () => {
    const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
    return AudioContext ? new AudioContext({ latencyHint: 'interactive' }) : null;
  },
  fetcher = globalThis.fetch?.bind(globalThis),
  random = Math.random,
  baseUrl = `${import.meta.env?.BASE_URL || '/'}audio/`,
} = {}) {
  let context = null;
  let master = null;
  let muted = initiallyMuted;
  let paused = false;
  let unlocked = false;
  let ambienceEnabled = false;
  let disposed = false;
  let resumePending = null;
  let suspendPending = null;
  const assets = new Map(Object.entries(SOUNDS).map(([kind, definition]) => [kind, { ...definition, state: 'idle', raw: null, buffer: null, request: null, decoding: null }]));
  const playing = new Set();
  const lastPlayed = new Map();
  const abort = new AbortController();

  function audible() {
    return !disposed && unlocked && !muted && !paused && context?.state === 'running';
  }

  function removeVoice(voice) {
    if (!playing.delete(voice)) return;
    voice.source.onended = null;
    voice.source.disconnect();
    voice.gain.disconnect();
  }

  function stopVoice(voice) {
    try { voice.source.stop(); } catch { /* It may already have ended. */ }
    removeVoice(voice);
  }

  function stopAll() {
    if (master) master.gain.setValueAtTime(0, context.currentTime);
    for (const voice of [...playing]) stopVoice(voice);
    lastPlayed.clear();
  }

  function resume() {
    if (disposed || !context || muted || paused || !unlocked) return Promise.resolve(false);
    // A rapid unmute must wait for an earlier suspend to finish, even while state still says running.
    if (suspendPending) return suspendPending.then(resume);
    master.gain.setValueAtTime(1, context.currentTime);
    if (context.state === 'running') {
      startAmbience();
      return Promise.resolve(true);
    }
    if (!resumePending) {
      resumePending = Promise.resolve(context.resume()).then(() => {
        resumePending = null;
        if (!audible()) return false;
        startAmbience();
        return true;
      }).catch(() => { resumePending = null; return false; });
    }
    return resumePending;
  }

  function suspend() {
    if (!context || suspendPending || context.state === 'closed') return;
    try {
      suspendPending = Promise.resolve(context.suspend()).catch(() => {}).then(() => {
        suspendPending = null;
        if (!disposed && unlocked && !muted && !paused) return resume();
      });
    } catch { /* StopAll already made every source silent. */ }
  }

  function decode(asset) {
    if (!context || !asset.raw || asset.state !== 'raw' || disposed) return asset.decoding || Promise.resolve();
    asset.state = 'decoding';
    asset.decoding = Promise.resolve().then(() => context.decodeAudioData(asset.raw.slice(0))).then((buffer) => {
      asset.raw = null;
      if (disposed) return;
      asset.buffer = buffer;
      asset.state = 'ready';
      if (asset === assets.get('ambience')) startAmbience();
    }).catch(() => { asset.raw = null; asset.state = 'failed'; });
    return asset.decoding;
  }

  function load(asset) {
    if (asset.request) return asset.request.then(() => decode(asset));
    if (disposed) return Promise.resolve();
    asset.state = 'loading';
    asset.request = Promise.resolve().then(async () => {
      if (!fetcher) throw new Error('Audio fetch is unavailable');
      const response = await fetcher(`${baseUrl}${asset.file}.mp3`, { signal: abort.signal });
      if (!response.ok) throw new Error('Audio asset is unavailable');
      asset.raw = await response.arrayBuffer();
      if (disposed) { asset.raw = null; return; }
      asset.state = 'raw';
      await decode(asset);
    }).catch(() => { asset.state = 'failed'; asset.raw = null; });
    return asset.request;
  }

  function preload() {
    return Promise.all([...assets.values()].map(load));
  }

  function unlock() {
    if (disposed) return Promise.resolve(false);
    unlocked = true;
    if (muted) return Promise.resolve(false);
    if (!context) {
      try {
        context = contextFactory();
        if (!context) return Promise.resolve(false);
        master = context.createGain();
        master.gain.value = paused ? 0 : 1;
        master.connect(context.destination);
      } catch { context = null; return Promise.resolve(false); }
    }
    const resuming = resume();
    void preload();
    return Promise.all([resuming, ...[...assets.values()].map(decode)]).then(([running]) => running);
  }

  function attachVoice(kind, source, volume, loop = false) {
    const definition = assets.get(kind);
    const sameKind = [...playing].filter((voice) => voice.kind === kind);
    while (sameKind.length >= definition.voices) stopVoice(sameKind.shift());
    const effects = [...playing].filter((voice) => !voice.loop);
    if (!loop && effects.length >= 12) stopVoice(effects[0]);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, context.currentTime);
    source.connect(gain);
    gain.connect(master);
    const voice = { kind, source, gain, loop };
    playing.add(voice);
    source.onended = () => removeVoice(voice);
    return voice;
  }

  function playBuffer(kind, loop = false) {
    const asset = assets.get(kind);
    const source = context.createBufferSource();
    source.buffer = asset.buffer;
    source.loop = loop;
    source.playbackRate.value = 1 + (random() * 2 - 1) * (asset.variation || 0);
    attachVoice(kind, source, asset.volume, loop);
    source.start(context.currentTime);
  }

  function fallback(kind) {
    // Emergency feedback only after an MP3 failed to load/decode; never a loading placeholder.
    const source = context.createOscillator();
    const success = kind === 'success' || kind === 'complete';
    const duration = kind === 'press' ? .055 : success ? .19 : .095;
    source.type = kind === 'error' || kind === 'jam' ? 'triangle' : 'sine';
    source.frequency.setValueAtTime(kind === 'press' ? 160 : success ? 660 : kind === 'error' ? 110 : 380, context.currentTime);
    const voice = attachVoice(kind, source, Math.min(.045, assets.get(kind).volume * .1));
    voice.gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + duration);
    source.start(context.currentTime);
    source.stop(context.currentTime + duration);
  }

  function play(requestedKind) {
    const kind = ALIASES[requestedKind] || requestedKind;
    const asset = assets.get(kind);
    if (!audible() || !asset || kind === 'ambience') return false;
    if (asset.state !== 'ready' && asset.state !== 'failed') return false;
    const previous = lastPlayed.get(kind);
    if (previous !== undefined && context.currentTime - previous < asset.cooldown) return false;
    lastPlayed.set(kind, context.currentTime);
    try {
      if (asset.state === 'ready') playBuffer(kind);
      else fallback(kind);
      return true;
    } catch { return false; }
  }

  function startAmbience() {
    if (!ambienceEnabled || !audible() || assets.get('ambience').state !== 'ready') return;
    if ([...playing].some((voice) => voice.loop)) return;
    try { playBuffer('ambience', true); } catch { /* Ambience is optional. */ }
  }

  function setAmbience(enabled) {
    ambienceEnabled = !!enabled;
    if (!ambienceEnabled) {
      for (const voice of [...playing]) if (voice.loop) stopVoice(voice);
    } else startAmbience();
  }

  function setMuted(value) {
    if (muted === !!value) return;
    muted = !!value;
    if (muted) {
      stopAll();
      suspend();
    } else if (unlocked) void unlock();
  }

  function setPaused(value) {
    if (paused === !!value) return;
    paused = !!value;
    if (paused) {
      stopAll();
      suspend();
    } else if (unlocked) void resume();
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stopAll();
    abort.abort();
    for (const asset of assets.values()) { asset.buffer = null; asset.raw = null; }
    if (context) void context.close().catch(() => {});
  }

  return { play, unlock, setMuted, setPaused, setAmbience, preload, dispose };
}

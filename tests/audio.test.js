import test from 'node:test';
import assert from 'node:assert/strict';
import { createGameAudio } from '../src/audio.js';

class FakeParam {
  value = 0;
  setValueAtTime(value) { this.value = value; }
  exponentialRampToValueAtTime(value) { this.endValue = value; }
}

class FakeNode {
  constructor(context) { this.context = context; this.connections = []; }
  connect(node) { this.connections.push(node); return node; }
  disconnect() { this.disconnected = true; }
}

class FakeSource extends FakeNode {
  playbackRate = { value: 1 };
  frequency = new FakeParam();
  stops = [];
  start(at) { this.started = true; this.startedAt = at; }
  stop(at) {
    this.stops.push(at);
    if (at === undefined || at <= this.context.currentTime) {
      this.stopped = true;
      this.onended?.();
    }
  }
  finish() { this.stopped = true; this.onended?.(); }
}

class FakeContext {
  currentTime = 0;
  state = 'suspended';
  destination = {};
  sources = [];
  oscillators = [];
  gains = [];
  resumes = 0;
  suspends = 0;
  createGain() { const gain = new FakeNode(this); gain.gain = new FakeParam(); this.gains.push(gain); return gain; }
  createBufferSource() { const source = new FakeSource(this); this.sources.push(source); return source; }
  createOscillator() { const source = new FakeSource(this); this.oscillators.push(source); return source; }
  decodeAudioData(bytes) { return Promise.resolve({ duration: .4, id: new TextDecoder().decode(bytes) }); }
  resume() { this.resumes += 1; this.state = 'running'; return Promise.resolve(); }
  suspend() { this.suspends += 1; this.state = 'suspended'; return Promise.resolve(); }
  close() { this.state = 'closed'; return Promise.resolve(); }
}

function fixture(options = {}) {
  const context = new FakeContext();
  const requests = [];
  let created = 0;
  const audio = createGameAudio({
    contextFactory: () => { created += 1; return context; },
    fetcher: async (url) => {
      requests.push(url);
      return { ok: true, arrayBuffer: async () => new TextEncoder().encode(url).buffer };
    },
    random: () => 1,
    ...options,
  });
  return { audio, context, requests, get created() { return created; } };
}

async function ready(f) {
  await f.audio.preload();
  await f.audio.unlock();
  await f.audio.preload();
}

const liveSources = (context) => [...context.sources, ...context.oscillators].filter((source) => source.started && !source.stopped);

test('preloading never creates an audio context or autoplays before user unlock', async () => {
  const f = fixture();
  await f.audio.preload();
  f.audio.setAmbience(true);
  assert.equal(f.created, 0);
  assert.equal(f.audio.play('press'), false);
  assert.equal(f.context.sources.length, 0);
  assert.ok(f.requests.every((url) => url.startsWith('/audio/') && url.endsWith('.mp3')));
  await f.audio.unlock();
  await f.audio.preload();
  assert.equal(f.created, 1);
  assert.equal(liveSources(f.context).length, 1);
  const ambience = liveSources(f.context)[0];
  assert.equal(ambience.loop, true);
  f.audio.play('press');
  const effect = liveSources(f.context).find((source) => !source.loop);
  assert.ok(ambience.connections[0].gain.value < effect.connections[0].gain.value, 'office ambience stays below pressure feedback');
  f.audio.dispose();
});

test('rapid stapler taps play immediately with slight pitch variation and at most four overlapping voices', async () => {
  const f = fixture();
  await ready(f);
  for (let i = 0; i < 12; i += 1) {
    f.context.currentTime += .03;
    assert.equal(f.audio.play('press'), true);
    assert.ok(liveSources(f.context).length <= 4);
    assert.equal(f.context.sources.at(-1).startedAt, f.context.currentTime);
  }
  assert.equal(f.context.sources.length, 12);
  assert.equal(liveSources(f.context).length, 4);
  assert.ok(f.context.sources.every((source) => source.playbackRate.value > 1 && source.playbackRate.value < 1.1));
  assert.equal(f.context.oscillators.length, 0);
  f.audio.dispose();
});

test('aliases use the correct recording and duplicate events respect per-sound cooldowns', async () => {
  const f = fixture();
  await ready(f);
  assert.equal(f.audio.play('test-stapler'), true);
  assert.match(f.context.sources.at(-1).buffer.id, /stapler-press\.mp3$/);
  assert.equal(f.audio.play('press'), false, 'aliases share pressure voice limits and cooldown');
  assert.equal(f.audio.play('align'), true);
  assert.match(f.context.sources.at(-1).buffer.id, /paper-shuffle\.mp3$/);
  assert.equal(f.audio.play('start'), false, 'same-frame duplicate start/paper feedback is suppressed');
  assert.equal(f.audio.play('clock-in'), true);
  assert.match(f.context.sources.at(-1).buffer.id, /clock-in\.mp3$/);
  assert.equal(f.audio.play('gameover'), true);
  assert.match(f.context.sources.at(-1).buffer.id, /error\.mp3$/);
  assert.equal(f.audio.play('unknown-kind'), false);
  f.audio.dispose();
});

test('effects requested while loading are dropped and never replay after assets arrive', async () => {
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const f = fixture({ fetcher: () => pending });
  const loading = f.audio.preload();
  await f.audio.unlock();
  assert.equal(f.audio.play('press'), false);
  assert.equal(f.audio.play('success'), false);
  assert.equal(f.context.sources.length, 0);
  assert.equal(f.context.oscillators.length, 0, 'loading is not an asset failure');
  release({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });
  await loading;
  assert.equal(f.context.sources.length, 0, 'there is no queued input backlog');
  assert.equal(f.audio.play('press'), true, 'a fresh tap plays after loading');
  f.audio.dispose();
});

test('mute stops all active effects and ambience immediately, without replaying them on unmute', async () => {
  const f = fixture();
  await ready(f);
  f.audio.setAmbience(true);
  f.audio.play('press');
  f.audio.play('success');
  assert.equal(liveSources(f.context).length, 3);
  f.audio.setMuted(true);
  assert.equal(liveSources(f.context).length, 0);
  assert.equal(f.context.gains[0].gain.value, 0);
  assert.equal(f.context.state, 'suspended');
  assert.equal(f.audio.play('press'), false);
  f.audio.setMuted(false);
  await f.audio.unlock();
  assert.equal(liveSources(f.context).length, 1);
  assert.equal(liveSources(f.context)[0].loop, true, 'only the opted-in ambience restarts');
  f.audio.dispose();
});

test('rapid unmute waits for an in-flight suspend and restores ambience without replaying effects', async () => {
  const f = fixture();
  await ready(f);
  f.audio.setAmbience(true);
  f.audio.play('press');
  let finishSuspend;
  f.context.suspend = () => new Promise((resolve) => {
    finishSuspend = () => { f.context.state = 'suspended'; resolve(); };
  });
  f.audio.setMuted(true);
  f.audio.setMuted(false);
  assert.equal(f.context.state, 'running', 'browser state has not caught up with the suspend request');
  assert.equal(liveSources(f.context).length, 0, 'unmute cannot start sources into a pending suspend');
  finishSuspend();
  await f.audio.unlock();
  assert.equal(f.context.state, 'running');
  assert.equal(liveSources(f.context).length, 1);
  assert.equal(liveSources(f.context)[0].loop, true);
  f.audio.dispose();
});

test('pause and visibility suspension stop sound; unpausing stays silent while muted', async () => {
  const f = fixture();
  await ready(f);
  f.audio.setAmbience(true);
  f.audio.play('clock-in');
  f.audio.setPaused(true);
  assert.equal(liveSources(f.context).length, 0);
  assert.equal(f.context.state, 'suspended');
  assert.equal(f.audio.play('key'), false);
  f.audio.setMuted(true);
  f.audio.setPaused(false);
  assert.equal(f.context.state, 'suspended');
  assert.equal(liveSources(f.context).length, 0);
  f.audio.dispose();
});

test('failed assets use cancellable fallback feedback without creating fallback ambience', async () => {
  const f = fixture({ fetcher: async () => ({ ok: false }) });
  await ready(f);
  f.audio.setAmbience(true);
  assert.equal(liveSources(f.context).length, 0);
  assert.equal(f.audio.play('success'), true);
  const oscillator = f.context.oscillators[0];
  assert.ok(oscillator.stops[0] > f.context.currentTime, 'fallback has a bounded scheduled ending');
  f.audio.setMuted(true);
  assert.equal(oscillator.stops.at(-1), undefined, 'mute cancels the scheduled fallback immediately');
  assert.equal(liveSources(f.context).length, 0);
  f.audio.dispose();
});

test('decode failure enables fallback and disposal prevents later playback or contexts', async () => {
  const f = fixture();
  f.context.decodeAudioData = async () => { throw new Error('Invalid MP3'); };
  await ready(f);
  assert.equal(f.audio.play('press'), true);
  assert.equal(f.context.oscillators.length, 1);
  f.audio.dispose();
  assert.equal(f.context.state, 'closed');
  assert.equal(liveSources(f.context).length, 0);
  assert.equal(f.audio.play('press'), false);
  assert.equal(await f.audio.unlock(), false);
  assert.equal(f.created, 1);
});

test('initially muted interaction does not create or start audio until explicitly unmuted', async () => {
  const f = fixture({ muted: true });
  await f.audio.preload();
  f.audio.setAmbience(true);
  await f.audio.unlock();
  assert.equal(f.created, 0);
  f.audio.setMuted(false);
  await f.audio.preload();
  assert.equal(f.created, 1);
  assert.equal(liveSources(f.context).length, 1);
  f.audio.dispose();
});

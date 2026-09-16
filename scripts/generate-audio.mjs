import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { audioCatalog } from './audio-catalog.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
  if (['--env', '--only'].includes(args[i])) {
    if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`${args[i]} precisa de um valor.`);
    i++;
  } else if (!['--dry-run', '--force'].includes(args[i])) {
    throw new Error('Opção desconhecida. Use --dry-run, --force, --only ID ou --env ARQUIVO.');
  }
}
const option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1]; };
const requested = option('--only')?.split(',');
const catalog = requested ? audioCatalog.filter(item => requested.includes(item.id)) : audioCatalog;
if (requested?.some(id => !catalog.some(item => item.id === id))) throw new Error('ID desconhecido em --only. Consulte scripts/audio-catalog.mjs.');
const output = path.join(root, 'public/audio');
const manifestPath = path.join(output, 'manifest.json');
const model = 'eleven_text_to_sound_v2';
const settings = item => ({ text: item.prompt, duration_seconds: item.seconds, loop: item.loop || false, prompt_influence: .55, model_id: model });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
let manifest;
try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; manifest = { provider: 'ElevenLabs', model, assets: {} }; }

const pending = [];
for (const item of catalog) {
  const prior = manifest.assets[item.id];
  let current = false;
  if (prior?.settingsHash === hash(JSON.stringify(settings(item)))) {
    try { current = hash(await readFile(path.join(output, `${item.id}.mp3`))) === prior.sha256; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  if (!current || args.includes('--force')) pending.push(item);
  else console.log(`Já gerado: ${item.id}`);
}
console.log(`${pending.length} arquivo(s) pendente(s), ${pending.reduce((n, item) => n + item.seconds, 0).toFixed(2)} s de áudio solicitado.`);
if (args.includes('--dry-run') || !pending.length) process.exit(0);

// Only this local script reads the key. It is never imported by the browser build.
const environment = { ...process.env };
try {
  const env = await readFile(path.resolve(root, option('--env') || '.env'), 'utf8');
  for (const line of env.split(/\r?\n/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (match && environment[match[1]] === undefined) {
      environment[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
const key = environment.ELEVENLABS || environment.ELEVENLABS_API_KEY;
if (!key) throw new Error('Defina ELEVENLABS no .env local para gerar os áudios.');
await mkdir(output, { recursive: true });
const scrub = value => String(value).replaceAll(key, '[redacted]').replace(/sk_[A-Za-z0-9_-]+/g, '[redacted]');

async function generate(item) {
  console.log(`Gerando: ${item.id} (${item.seconds}s)`);
  const response = await fetch('https://api.elevenlabs.io/v1/sound-generation?output_format=mp3_44100_128', {
    method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(settings(item)), signal: AbortSignal.timeout(120000), redirect: 'error',
  });
  if (!response.ok) {
    // Do not retry generation automatically: uncertain requests may already have been billed.
    throw new Error(`ElevenLabs ${response.status}: ${scrub(await response.text()).slice(0, 500)}`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (!response.headers.get('content-type')?.startsWith('audio/') || bytes.length < 1000) throw new Error('A API não retornou um arquivo de áudio válido.');
  const file = path.join(output, `${item.id}.mp3`);
  await writeFile(`${file}.tmp`, bytes);
  await rename(`${file}.tmp`, file);
  manifest.assets[item.id] = {
    file: `${item.id}.mp3`, prompt: item.prompt, seconds: item.seconds, loop: !!item.loop,
    model, settingsHash: hash(JSON.stringify(settings(item))), sha256: hash(bytes), bytes: bytes.length,
    generatedAt: new Date().toISOString(), characterCost: response.headers.get('character-cost'),
  };
  await writeFile(`${manifestPath}.tmp`, JSON.stringify(manifest, null, 2) + '\n');
  await rename(`${manifestPath}.tmp`, manifestPath);
  console.log(`Salvo: ${item.id}.mp3 (${bytes.length} bytes)`);
}

for (const item of pending) {
  try { await generate(item); }
  catch (error) {
    console.error(`Falha em ${item.id}: ${scrub(error.message)}. Os arquivos concluídos foram preservados; execute novamente para continuar.`);
    process.exitCode = 1;
    break;
  }
}

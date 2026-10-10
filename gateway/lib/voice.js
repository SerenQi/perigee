// 下面每一段都是 server.js 里的原文，一个字没动；只多了开头的 require和结尾的导出。
const { readFileSync, writeFileSync, chmodSync, existsSync, statSync, createReadStream, unlinkSync } = require('fs');
const https = require('https');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const http = require('http');
const { json } = require('./util');
const config = require('./config');

// Generic per-page collections (ledger/diary/mood/...): one JSON file each.
// Voice: edge-tts renders my replies to speech; saved recordings live in AUDIO_DIR.
const EDGE_TTS = config.EDGE_TTS_BIN;
const TTS_DEFAULT_VOICE = 'zh-CN-YunxiNeural';
const TTS_VOICES = new Set(['zh-CN-YunxiNeural', 'zh-CN-YunjianNeural', 'zh-CN-YunyangNeural', 'zh-CN-YunxiaNeural', 'zh-CN-XiaoxiaoNeural', 'zh-CN-XiaoyiNeural']);
const AUDIO_DIR = `${config.DATA_DIR}/audio`;
// MOSI 云端 TTS（可选，key 填环境变量 MOSI_API_KEY，音色 ID 在设置里填）
const MOSI_URL = 'https://api.mosi.cn/v1/audio/speech';
const VOICE_SETTINGS_FILE = `${config.DATA_DIR}/voice-settings.json`;
const VOICE_PROVIDERS = new Set(['elevenlabs', 'mosi', 'edge']);
const ELEVEN_MODELS = new Set(['eleven_multilingual_v2', 'eleven_v3', 'eleven_v4', 'eleven_v4_turbo', 'eleven_flash_v2_5']);
const VOICE_DEFAULTS = {
  provider: 'edge', apiKey: '', voiceId: '', model: 'eleven_multilingual_v2',
  mosiVoiceId: '', tempo: 1.15,
  edgeVoice: TTS_DEFAULT_VOICE,
};
function mosiKey() { return readVoiceSettings().mosiApiKey || config.MOSI_API_KEY || null; }

function readVoiceSettings() {
  let saved = {};
  try { saved = JSON.parse(readFileSync(VOICE_SETTINGS_FILE, 'utf8')); } catch {}
  return {
    ...VOICE_DEFAULTS,
    ...saved,
    apiKey: saved.apiKey || config.ELEVENLABS_API_KEY || '',
    mosiApiKey: saved.mosiApiKey || '',
    provider: VOICE_PROVIDERS.has(saved.provider) ? saved.provider : VOICE_DEFAULTS.provider,
    model: ELEVEN_MODELS.has(saved.model) ? saved.model : VOICE_DEFAULTS.model,
    edgeVoice: TTS_VOICES.has(saved.edgeVoice) ? saved.edgeVoice : VOICE_DEFAULTS.edgeVoice,
  };
}

function publicVoiceSettings() {
  const item = readVoiceSettings();
  return {
    provider: item.provider, configured: Boolean(item.apiKey), mosiConfigured: Boolean(item.mosiApiKey || config.MOSI_API_KEY), voiceId: item.voiceId,
    model: item.model, mosiVoiceId: item.mosiVoiceId, tempo: item.tempo, edgeVoice: item.edgeVoice,
  };
}

function saveVoiceSettings(input) {
  const current = readVoiceSettings();
  const provider = VOICE_PROVIDERS.has(input.provider) ? input.provider : current.provider;
  const apiKey = input.clearKey ? '' : (String(input.apiKey || '').trim() || current.apiKey);
  const mosiApiKey = input.clearMosiKey ? '' : (String(input.mosiApiKey || '').trim() || current.mosiApiKey || '');
  const voiceId = String(input.voiceId ?? current.voiceId).trim();
  const model = ELEVEN_MODELS.has(input.model) ? input.model : current.model;
  const mosiVoiceId = String(input.mosiVoiceId ?? current.mosiVoiceId).trim();
  const tempo = Math.min(1.4, Math.max(0.8, Number(input.tempo ?? current.tempo) || 1.15));
  const edgeVoice = TTS_VOICES.has(input.edgeVoice) ? input.edgeVoice : current.edgeVoice;
  if (voiceId && !/^[A-Za-z0-9_-]{8,80}$/.test(voiceId)) throw new Error('ElevenLabs Voice ID 格式不对');
  if (provider === 'elevenlabs' && !apiKey) throw new Error('请先填写 ElevenLabs API Key');
  if (provider === 'elevenlabs' && !voiceId) throw new Error('请填写 ElevenLabs Voice ID');
  const stored = { provider, apiKey, mosiApiKey, voiceId, model, mosiVoiceId, tempo, edgeVoice };
  writeFileSync(VOICE_SETTINGS_FILE, JSON.stringify(stored, null, 2), { encoding: 'utf8', mode: 0o600 });
  chmodSync(VOICE_SETTINGS_FILE, 0o600);
  return publicVoiceSettings();
}

function mosiSpeak(res, text, voiceId, fallback, tempo) {
  const key = mosiKey();
  if (!key || !/^[a-f0-9-]{20,}$/.test(String(voiceId || ''))) return fallback();
  // 默认过一道变速不变调（atempo，需要 ffmpeg），音色不动
  const speed = Math.min(1.4, Math.max(0.8, Number(tempo) || 1.15));
  const payload = JSON.stringify({ model: 'moss-tts', input: text, voice: voiceId });
  const upstream = https.request(MOSI_URL, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    timeout: 60_000,
  }, up => {
    if (up.statusCode !== 200) {
      let err = ''; up.on('data', d => { err += d; }); up.on('end', () => { console.log('[mosi]', up.statusCode, err.slice(0, 200)); fallback(); });
      return;
    }
    if (Math.abs(speed - 1) < 0.02) {
      res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
      up.pipe(res);
      return;
    }
    const ff = spawn('ffmpeg', ['-v', 'quiet', '-i', 'pipe:0', '-filter:a', `atempo=${speed}`, '-f', 'mp3', '-q:a', '3', 'pipe:1'], { stdio: ['pipe', 'pipe', 'ignore'] });
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
    up.pipe(ff.stdin);
    ff.stdout.pipe(res);
    ff.on('error', () => { try { res.end(); } catch {} });
  });
  upstream.on('error', error => { console.log('[mosi]', error.message); fallback(); });
  upstream.on('timeout', () => upstream.destroy());
  upstream.end(payload);
}

function elevenLabsSpeak(res, text, settings) {
  const payload = JSON.stringify({ text, model_id: settings.model });
  const path = `/v1/text-to-speech/${encodeURIComponent(settings.voiceId)}?output_format=mp3_44100_128`;
  const upstream = https.request({
    hostname: 'api.elevenlabs.io', port: 443, path, method: 'POST', timeout: 90_000,
    headers: {
      'xi-api-key': settings.apiKey, 'Content-Type': 'application/json',
      'Accept': 'audio/mpeg', 'Content-Length': Buffer.byteLength(payload),
    },
  }, up => {
    if (up.statusCode !== 200) {
      let detail = '';
      up.on('data', chunk => { if (detail.length < 800) detail += chunk.toString(); });
      up.on('end', () => {
        console.log('[elevenlabs]', up.statusCode, detail.slice(0, 300));
        json(res, 502, { error: { message: `ElevenLabs 返回 ${up.statusCode}` } });
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
    up.pipe(res);
  });
  upstream.on('error', error => { console.log('[elevenlabs]', error.message); if (!res.headersSent) json(res, 502, { error: { message: 'ElevenLabs 连接失败' } }); else res.end(); });
  upstream.on('timeout', () => upstream.destroy(new Error('timeout')));
  upstream.end(payload);
}

function ttsSpeak(res, body) {
  const text = String(body.text || '').replace(/\s+/g, ' ').trim().slice(0, 3000);
  if (!text) return json(res, 400, { error: { message: '没有要念的字' } });
  const settings = readVoiceSettings();
  if (!body.forceEdge && settings.provider === 'elevenlabs') {
    if (!settings.apiKey || !settings.voiceId) return json(res, 503, { error: { message: 'ElevenLabs 还没在设置里配置完整' } });
    return elevenLabsSpeak(res, text, settings);
  }
  if (!body.forceEdge && settings.provider === 'mosi') {
    return mosiSpeak(res, text, settings.mosiVoiceId, () => ttsSpeak(res, { ...body, forceEdge: true }), settings.tempo);
  }
  const voice = settings.edgeVoice;
  const rate = /^[+-]\d{1,2}%$/.test(String(body.rate || '')) ? body.rate : '+0%';
  const pitch = /^[+-]\d{1,3}Hz$/.test(String(body.pitch || '')) ? body.pitch : '+0Hz';
  const out = `/tmp/tts-${randomUUID().slice(0, 8)}.mp3`;
  const child = spawn(EDGE_TTS, ['--voice', voice, `--rate=${rate}`, `--pitch=${pitch}`, '--text', text, '--write-media', out], { stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', d => { err += d; });
  const timer = setTimeout(() => child.kill('SIGKILL'), 60_000);
  child.on('close', code => {
    clearTimeout(timer);
    if (code !== 0 || !existsSync(out)) {
      console.error('[tts] failed:', err.trim().slice(0, 300));
      return json(res, 502, { error: { message: '声音没能生成' } });
    }
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': statSync(out).size, 'Cache-Control': 'no-store' });
    const stream = createReadStream(out);
    stream.pipe(res);
    stream.on('close', () => { try { unlinkSync(out); } catch {} });
  });
}

function serveAudioFile(res, name) {
  const safe = String(name).match(/^([a-zA-Z0-9_-]+)\.(mp3|m4a|wav)$/);
  const path = safe ? `${AUDIO_DIR}/${safe[0]}` : null;
  if (!path || !existsSync(path)) return json(res, 404, { error: { message: 'not found' } });
  const mime = { mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav' }[safe[2]];
  res.writeHead(200, { 'Content-Type': mime, 'Content-Length': statSync(path).size, 'Cache-Control': 'private, max-age=31536000' });
  require('stream').pipeline(createReadStream(path), res, () => {});
}

module.exports = {
  AUDIO_DIR,
  mosiKey,
  readVoiceSettings,
  publicVoiceSettings,
  saveVoiceSettings,
  mosiSpeak,
  elevenLabsSpeak,
  ttsSpeak,
  serveAudioFile,
};

// lib/integrations.js —— 设置页里"需要人来配"的服务器设置，统一存在 DATA_DIR/settings.json（权限 600）。
// 分区：general（名字/时区/附言）、session（权限/换窗/保活）、asr（语音识别+听语气）、draw（生图）、bark（推送）、mousecrew（群聊后端）。
// key / token 只进不出：GET 只告诉前端"配没配"，不回显明文。设置页没填的项退回环境变量（见 .env.example）。
// 四家 API 通道的 key 在 provider-settings.json（channel-adapters.cjs），声音（TTS）在 voice-settings.json（voice.js）。
const config = require('./config');

const ASR_PROVIDERS = new Set(['off', 'url', 'openai', 'gemini']);
const DRAW_PROVIDERS = new Set(['off', 'openai', 'openrouter']);
const PERMISSION_MODES = new Set(['default', 'acceptEdits', 'plan', 'bypassPermissions']);
const env = k => String(process.env[k] || '').trim();

/** 实际生效的配置（设置页优先，环境变量兜底） */
function current() {
  const raw = config.readSettings();
  const asr = raw.asr || {}, draw = raw.draw || {};
  const asrEnv = config.ASR_URL ? 'url' : (env('GEMINI_API_KEY') ? 'gemini' : 'off');
  const asrProvider = ASR_PROVIDERS.has(asr.provider) ? asr.provider : asrEnv;
  const drawEnv = env('PERIGEE_DRAW_API_KEY') ? (env('PERIGEE_DRAW_PROVIDER') || 'openai') : 'off';
  const drawProvider = DRAW_PROVIDERS.has(draw.provider) ? draw.provider : (DRAW_PROVIDERS.has(drawEnv) ? drawEnv : 'off');
  return {
    general: {
      userName: config.USER_NAME, aiName: config.AI_NAME, tz: config.TZ,
      turnNote: config.TURN_NOTE, homeApiDoc: config.HOME_API_DOC,
    },
    session: {
      permissionMode: PERMISSION_MODES.has(config.PERMISSION_MODE) ? config.PERMISSION_MODE : 'default',
      forgeEnabled: config.FORGE_ENABLED, forgeSoftPct: config.FORGE_SOFT_PCT,
      forgeRetain: config.FORGE_RETAIN, forgeSquash: config.FORGE_SQUASH,
      keepaliveMinutes: config.KEEPALIVE_MINUTES,
      sideModel: config.SIDE_MODEL,
    },
    asr: {
      provider: asrProvider,
      url: String(asr.url || config.ASR_URL || ''),
      apiKey: String(asr.apiKey || (asrProvider === 'gemini' ? env('GEMINI_API_KEY') : env('PERIGEE_ASR_API_KEY')) || ''),
      baseUrl: String(asr.baseUrl || ''),
      model: String(asr.model || ''),
      tone: asr.tone !== false && asrProvider === 'gemini',
    },
    draw: {
      provider: drawProvider,
      apiKey: String(draw.apiKey || env('PERIGEE_DRAW_API_KEY') || ''),
      baseUrl: String(draw.baseUrl || env('PERIGEE_DRAW_BASE_URL') || ''),
      model: String(draw.model || env('PERIGEE_DRAW_MODEL') || ''),
      aspect: String(draw.aspect || '1:1'),
      quality: String(draw.quality || 'medium'),
    },
    bark: { url: String(raw.bark?.url || config.BARK_URL || '').replace(/\/+$/, ''), push: config.BARK_PUSH },
    mousecrew: {
      url: String(raw.mousecrew?.url || config.MOUSECREW_URL || '').replace(/\/+$/, ''),
      token: String(raw.mousecrew?.token || config.MOUSECREW_TOKEN || ''),
    },
  };
}

function publicView() {
  const c = current();
  return {
    general: c.general,
    session: c.session,
    asr: { provider: c.asr.provider, url: c.asr.url, baseUrl: c.asr.baseUrl, model: c.asr.model, tone: c.asr.tone, configured: Boolean(c.asr.apiKey) },
    draw: { provider: c.draw.provider, baseUrl: c.draw.baseUrl, model: c.draw.model, aspect: c.draw.aspect, quality: c.draw.quality, configured: Boolean(c.draw.apiKey) },
    bark: { configured: Boolean(c.bark.url), push: c.bark.push },
    mousecrew: { url: c.mousecrew.url, configured: Boolean(c.mousecrew.token) },
  };
}

const httpUrl = (v, label) => {
  const s = String(v || '').trim();
  if (!s) return '';
  let u; try { u = new URL(s); } catch { throw new Error(`${label} 不是合法网址`); }
  if (!/^https?:$/.test(u.protocol)) throw new Error(`${label} 只能是 http(s)`);
  return s.replace(/\/+$/, '');
};
const clampNum = (v, lo, hi, label) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`${label} 要在 ${lo}–${hi} 之间`);
  return n;
};
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

/** 保存。key 类字段：传空串/不传 = 保持不变；clearKey / clearToken / clear = true 才清掉 */
function save(input = {}) {
  const raw = { ...config.readSettings() };
  if (input.general) {
    const g = input.general, out = { ...(raw.general || {}) };
    for (const k of ['userName', 'aiName']) if (has(g, k)) out[k] = String(g[k] || '').trim().slice(0, 40);
    if (has(g, 'tz')) {
      const tz = String(g.tz || '').trim();
      if (tz) { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); } catch { throw new Error('时区写法不对，例：Asia/Shanghai'); } }
      out.tz = tz;
    }
    if (has(g, 'turnNote')) out.turnNote = String(g.turnNote || '').slice(0, 1000);
    if (has(g, 'homeApiDoc')) out.homeApiDoc = String(g.homeApiDoc || '').trim().slice(0, 300);
    raw.general = out;
  }
  if (input.session) {
    const x = input.session, out = { ...(raw.session || {}) };
    if (has(x, 'permissionMode')) { if (!PERMISSION_MODES.has(x.permissionMode)) throw new Error('权限模式不对'); out.permissionMode = x.permissionMode; }
    if (has(x, 'forgeEnabled')) out.forgeEnabled = Boolean(x.forgeEnabled);
    if (has(x, 'forgeSoftPct')) out.forgeSoftPct = clampNum(x.forgeSoftPct, 30, 95, '换窗水位');
    if (has(x, 'forgeRetain')) out.forgeRetain = clampNum(x.forgeRetain, 10_000, 500_000, '保留原文');
    if (has(x, 'forgeSquash')) out.forgeSquash = clampNum(x.forgeSquash, 0, 100_000, '工具输出压缩阈值');
    if (has(x, 'sideModel')) out.sideModel = String(x.sideModel || '').trim().slice(0, 80);
    if (has(x, 'keepaliveMinutes')) out.keepaliveMinutes = clampNum(x.keepaliveMinutes, 0, 59, '保活间隔');
    raw.session = out;
  }
  if (input.asr) {
    const a = input.asr, old = raw.asr || {};
    raw.asr = {
      provider: ASR_PROVIDERS.has(a.provider) ? a.provider : (old.provider || 'off'),
      url: has(a, 'url') ? httpUrl(a.url, '识别服务地址') : (old.url || ''),
      baseUrl: has(a, 'baseUrl') ? httpUrl(a.baseUrl, 'Base URL') : (old.baseUrl || ''),
      model: has(a, 'model') ? String(a.model || '').trim().slice(0, 80) : (old.model || ''),
      tone: has(a, 'tone') ? Boolean(a.tone) : old.tone !== false,
      apiKey: a.clearKey ? '' : (String(a.apiKey || '').trim() || old.apiKey || ''),
    };
  }
  if (input.draw) {
    const d = input.draw, old = raw.draw || {};
    raw.draw = {
      provider: DRAW_PROVIDERS.has(d.provider) ? d.provider : (old.provider || 'off'),
      baseUrl: has(d, 'baseUrl') ? httpUrl(d.baseUrl, 'Base URL') : (old.baseUrl || ''),
      model: has(d, 'model') ? String(d.model || '').trim().slice(0, 120) : (old.model || ''),
      aspect: has(d, 'aspect') ? String(d.aspect || '1:1') : (old.aspect || '1:1'),
      quality: has(d, 'quality') ? String(d.quality || 'medium') : (old.quality || 'medium'),
      apiKey: d.clearKey ? '' : (String(d.apiKey || '').trim() || old.apiKey || ''),
    };
  }
  if (input.bark) {
    const b = input.bark, old = raw.bark || {};
    raw.bark = {
      url: b.clear ? '' : (b.url ? httpUrl(b.url, 'Bark 地址') : (old.url || '')),
      push: has(b, 'push') ? Boolean(b.push) : (old.push ?? true),
    };
  }
  if (input.mousecrew) {
    const m = input.mousecrew, old = raw.mousecrew || {};
    raw.mousecrew = {
      url: has(m, 'url') ? httpUrl(m.url, 'mousecrew 地址') : (old.url || ''),
      token: m.clearToken ? '' : (String(m.token || '').trim() || old.token || ''),
    };
  }
  config.writeSettings(raw);
  return publicView();
}

// ── 语音识别 ──────────────────────────────────────────────
function sniffAudio(buf) {
  const h = buf.subarray(0, 12);
  if (h.toString('ascii', 0, 4) === 'RIFF') return { ext: 'wav', mime: 'audio/wav' };
  if (h.toString('ascii', 0, 4) === 'OggS') return { ext: 'ogg', mime: 'audio/ogg' };
  if (h.toString('ascii', 4, 8) === 'ftyp') return { ext: 'm4a', mime: 'audio/mp4' };
  if (h[0] === 0x1a && h[1] === 0x45 && h[2] === 0xdf && h[3] === 0xa3) return { ext: 'webm', mime: 'audio/webm' };
  return { ext: 'mp3', mime: 'audio/mpeg' };
}

/** 音频字节 → { text, tone?, env? }。没配置时抛错（带 status 503）。 */
async function transcribe(buf) {
  const { asr } = current();
  if (asr.provider === 'off') throw Object.assign(new Error('没有配置语音识别（设置 › 语音与通话）'), { status: 503 });
  const kind = sniffAudio(buf);
  if (asr.provider === 'url') {
    if (!asr.url) throw Object.assign(new Error('没有填识别服务地址'), { status: 503 });
    const r = await fetch(asr.url, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: buf, signal: AbortSignal.timeout(60_000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.error?.message || `识别服务返回 ${r.status}`);
    return { text: String(j.text || '').trim() };
  }
  if (!asr.apiKey) throw Object.assign(new Error('没有填语音识别的 API Key'), { status: 503 });
  if (asr.provider === 'openai') {
    const base = (asr.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const form = new FormData();
    form.append('file', new Blob([buf], { type: kind.mime }), `audio.${kind.ext}`);
    form.append('model', asr.model || 'whisper-1');
    const r = await fetch(`${base}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${asr.apiKey}` }, body: form, signal: AbortSignal.timeout(60_000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`识别服务返回 ${r.status}：${String(j?.error?.message || '').slice(0, 200)}`);
    return { text: String(j.text || '').trim() };
  }
  // gemini：一次听完，顺带"听语气"
  const model = asr.model || 'gemini-2.5-flash';
  const prompt = asr.tone
    ? '把这段语音逐字转写成文字（保持原语言，不要翻译、不要润色）。'
      + '再用一两句中文描述说话人的语气和情绪，包括笑声、叹气、鼻音、哽咽这类非语言的声音（只描述听感，不要猜原因）。'
      + '再用一两句中文描述背景里明显的环境声，比如下雨、车流、音乐、旁人说话；没有明显的环境声就写空字符串。'
      + '只输出 JSON：{"text":"转写","tone":"语气","env":"环境声"}'
    : '把这段语音逐字转写成文字（保持原语言，不要翻译、不要润色）。只输出 JSON：{"text":"转写"}';
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': asr.apiKey },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ inline_data: { mime_type: kind.mime, data: buf.toString('base64') } }, { text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
    signal: AbortSignal.timeout(60_000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`Gemini 返回 ${r.status}：${String(j?.error?.message || '').slice(0, 200)}`);
  const out = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
  let parsed = {};
  try { parsed = JSON.parse(out); } catch { parsed = { text: out }; }
  return {
    text: String(parsed.text || '').trim(),
    tone: asr.tone ? String(parsed.tone || '').trim().slice(0, 300) : '',
    env: asr.tone ? String(parsed.env || '').trim().slice(0, 200) : '',
  };
}

module.exports = { current, publicView, save, transcribe, PERMISSION_MODES };

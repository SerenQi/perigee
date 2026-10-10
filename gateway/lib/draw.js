// lib/draw.js —— 生图（可选）。提供商、Base URL、Key、模型在「设置 › 生图」里填（lib/integrations.js 的 draw 分区）。
// 画好的图存进发件箱 outbox/，Claude 在回复里写 [[file:文件名]] 就能递给用户；keep=true 时顺手放进图库。
// 给 Claude 用的入口：gateway/bin/perigee-draw（本机命令行），它调的就是 POST /draw。
const { writeFileSync, mkdirSync, existsSync } = require('fs');
const { randomUUID } = require('crypto');
const integrations = require('./integrations');
const { OUTBOX_DIR } = require('./outbox');

const SIZE = { '1:1': '1024x1024', '3:4': '1024x1536', '2:3': '1024x1536', '9:16': '1024x1536', '4:3': '1536x1024', '3:2': '1536x1024', '16:9': '1536x1024' };
const DEFAULT_MODEL = { openai: 'gpt-image-1', openrouter: '' };
const DEFAULT_BASE = { openai: 'https://api.openai.com/v1', openrouter: 'https://openrouter.ai/api/v1' };

function safeName(name) {
  const base = String(name || '').trim().replace(/[\/\\\0]/g, '_').replace(/^\.+/, '').slice(0, 100);
  const withExt = /\.(png|jpe?g|webp)$/i.test(base) ? base : (base ? `${base}.png` : '');
  return withExt || `draw-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}.png`;
}
const dataUrlParts = u => { const m = String(u || '').match(/^data:([^;]+);base64,(.+)$/s); return m ? { mime: m[1], data: m[2] } : null; };

async function imageBytes(item) {
  if (item?.b64_json) return Buffer.from(item.b64_json, 'base64');
  if (item?.url) {
    const d = dataUrlParts(item.url);
    if (d) return Buffer.from(d.data, 'base64');
    const r = await fetch(item.url, { signal: AbortSignal.timeout(120_000) });
    if (!r.ok) throw new Error(`取图失败 ${r.status}`);
    return Buffer.from(await r.arrayBuffer());
  }
  throw new Error('生图服务没有返回图片');
}

/** { prompt, name?, aspect?, quality?, refs?: dataURL[] } → { file, path, bytes } */
async function draw(body = {}) {
  const { draw: cfg } = integrations.current();
  if (cfg.provider === 'off') throw Object.assign(new Error('没有配置生图（设置 › 生图 · 推送 · 群聊）'), { status: 503 });
  if (!cfg.apiKey) throw Object.assign(new Error('没有填生图的 API Key'), { status: 503 });
  const prompt = String(body.prompt || '').trim();
  if (!prompt) throw Object.assign(new Error('prompt 不能为空'), { status: 400 });
  const aspect = SIZE[body.aspect] ? body.aspect : (SIZE[cfg.aspect] ? cfg.aspect : '1:1');
  const quality = ['low', 'medium', 'high'].includes(body.quality) ? body.quality : cfg.quality;
  const refs = (Array.isArray(body.refs) ? body.refs : []).map(dataUrlParts).filter(Boolean).slice(0, 4);
  const base = (cfg.baseUrl || DEFAULT_BASE[cfg.provider]).replace(/\/+$/, '');
  const model = cfg.model || DEFAULT_MODEL[cfg.provider];
  if (!model) throw Object.assign(new Error('没有填生图模型'), { status: 503 });
  const auth = { Authorization: `Bearer ${cfg.apiKey}` };
  let r;
  if (cfg.provider === 'openrouter') {
    const payload = { model, prompt, aspect_ratio: aspect, quality, n: 1 };
    if (refs.length) payload.input_references = refs.map(x => ({ type: 'image_url', image_url: { url: `data:${x.mime};base64,${x.data}` } }));
    r = await fetch(`${base}/images`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(400_000) });
  } else if (refs.length) {
    const form = new FormData();
    form.append('model', model); form.append('prompt', prompt); form.append('size', SIZE[aspect]); form.append('quality', quality); form.append('n', '1');
    refs.forEach((x, i) => form.append('image[]', new Blob([Buffer.from(x.data, 'base64')], { type: x.mime }), `ref-${i}.${x.mime.split('/')[1] || 'png'}`));
    r = await fetch(`${base}/images/edits`, { method: 'POST', headers: auth, body: form, signal: AbortSignal.timeout(400_000) });
  } else {
    r = await fetch(`${base}/images/generations`, { method: 'POST', headers: { ...auth, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, prompt, size: SIZE[aspect], quality, n: 1 }), signal: AbortSignal.timeout(400_000) });
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`生图服务返回 ${r.status}：${String(j?.error?.message || JSON.stringify(j?.error || '')).slice(0, 300)}`);
  const bytes = await imageBytes(j.data?.[0]);
  if (!existsSync(OUTBOX_DIR)) mkdirSync(OUTBOX_DIR, { recursive: true });
  const file = safeName(body.name);
  writeFileSync(`${OUTBOX_DIR}/${file}`, bytes);
  return { file, path: `${OUTBOX_DIR}/${file}`, bytes };
}

module.exports = { draw };

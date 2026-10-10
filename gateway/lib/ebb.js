// lib/ebb.js —— 「涨落 · Ebb」页的数据：由你自己的程序或 Claude 往里推，网关只负责存和给。
//   POST /ebb/metrics  { metrics: [{ key, label, desc?, value(0~1) }] }   整组替换（由数据决定有几条、叫什么）
//   POST /ebb/events   { kind, text, note?, at? }                        追加一条（at 省略 = 现在）
//   POST /ebb/sky      { text }                                          顶上那行小字
//   GET  /ebb?days=7   页面读：{ sky, metrics, events(新的在前), counts }
//   DELETE /ebb/events  清空事件
// 存在 DATA_DIR/ebb.json；事件只留最近 KEEP_DAYS 天、最多 MAX_EVENTS 条。
const { readFileSync, writeFileSync, renameSync, mkdirSync } = require('fs');
const { randomUUID } = require('crypto');
const config = require('./config');
const { json, readBody } = require('./util');

const FILE = `${config.DATA_DIR}/ebb.json`;
const KEEP_DAYS = Number(process.env.PERIGEE_EBB_KEEP_DAYS) || 30;
const MAX_EVENTS = 1000;
const clip = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

function load() {
  try { const d = JSON.parse(readFileSync(FILE, 'utf8')); return { sky: d.sky || null, metrics: Array.isArray(d.metrics) ? d.metrics : [], events: Array.isArray(d.events) ? d.events : [] }; }
  catch { return { sky: null, metrics: [], events: [] }; }
}
function save(d) {
  const cutoff = Date.now() - KEEP_DAYS * 86400e3;
  d.events = d.events.filter(e => Date.parse(e.at) >= cutoff).sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, MAX_EVENTS);
  mkdirSync(config.DATA_DIR, { recursive: true });
  const tmp = `${FILE}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(d, null, 1));
  renameSync(tmp, FILE);
}

function view(days) {
  const d = load();
  const since = Date.now() - days * 86400e3;
  const recent = d.events.filter(e => Date.parse(e.at) >= since);
  const byKind = {};
  for (const e of recent) byKind[e.kind] = (byKind[e.kind] || 0) + 1;
  return { ok: true, sky: d.sky, metrics: d.metrics, events: d.events.slice(0, 200), counts: { days, total: recent.length, by_kind: byKind } };
}

async function handle(req, res, url) {
  const p = url.pathname;
  try {
    if (p === '/ebb' && req.method === 'GET') {
      const days = Math.max(1, Math.min(Number(url.searchParams.get('days')) || 7, KEEP_DAYS));
      return json(res, 200, view(days)), true;
    }
    if (p === '/ebb/metrics' && req.method === 'POST') {
      const b = await readBody(req);
      if (!Array.isArray(b.metrics)) return json(res, 400, { error: { message: 'metrics 要是数组' } }), true;
      const at = new Date().toISOString();
      const metrics = b.metrics.slice(0, 24).map((m, i) => ({
        key: clip(m.key || `m${i}`, 40), label: clip(m.label || m.key || `指标${i + 1}`, 16), desc: clip(m.desc, 120),
        value: Math.max(0, Math.min(1, Number(m.value) || 0)), at,
      }));
      const d = load(); d.metrics = metrics; save(d);
      return json(res, 200, { ok: true, metrics }), true;
    }
    if (p === '/ebb/events' && req.method === 'POST') {
      const b = await readBody(req);
      const text = clip(b.text, 200);
      if (!text) return json(res, 400, { error: { message: 'text 不能为空' } }), true;
      const at = b.at && !Number.isNaN(Date.parse(b.at)) ? new Date(b.at).toISOString() : new Date().toISOString();
      const e = { id: randomUUID().slice(0, 8), kind: clip(b.kind || 'note', 24).toLowerCase(), text, note: clip(b.note, 300) || undefined, at };
      const d = load(); d.events.push(e); save(d);
      return json(res, 200, { ok: true, event: e }), true;
    }
    if (p === '/ebb/events' && req.method === 'DELETE') {
      const d = load(); d.events = []; save(d);
      return json(res, 200, { ok: true }), true;
    }
    if (p === '/ebb/sky' && req.method === 'POST') {
      const b = await readBody(req);
      const d = load(); d.sky = clip(b.text, 120) ? { text: clip(b.text, 120), at: new Date().toISOString() } : null; save(d);
      return json(res, 200, { ok: true, sky: d.sky }), true;
    }
  } catch (e) { return json(res, 400, { error: { message: e.message } }), true; }
  return false;
}

module.exports = { handle };

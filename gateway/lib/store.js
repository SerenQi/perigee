// 下面每一段都是 server.js 里的原文，一个字没动；只多了开头的 require、init 注入和结尾的导出。
const { readFileSync, writeFileSync, unlinkSync, appendFileSync, existsSync, statSync, createReadStream, openSync, writeSync, fsyncSync, closeSync, copyFileSync, renameSync } = require('fs');
const { randomUUID } = require('crypto');
const { json } = require('./util');
const config = require('./config');
const { mkdirSync } = require('fs');
try { mkdirSync(config.DATA_DIR, { recursive: true }); } catch {}

// 主文件启动时注进来（这些值在主文件原位、按原顺序算出来；模块里只在函数被调用时才用到）
let roomsData, channelHub, CODEX_AVAILABLE;
function init(deps) {
  ({ roomsData, channelHub, CODEX_AVAILABLE } = deps);
}

const CWD = config.CLAUDE_CWD;
const STATE_FILE = `${config.DATA_DIR}/state.json`;
const ROOMS_FILE = `${config.DATA_DIR}/chat-rooms.json`;
const HISTORY_FILE = `${config.DATA_DIR}/chat-history.jsonl`;
const FINGERTIPS_FILE = `${config.DATA_DIR}/fingertips-state.json`;
// 图库放在网页根目录外：只能经过网关（建议在反向代理上加登录）拿到
const GALLERY_DIR = `${config.DATA_DIR}/gallery`;
const GALLERY_INDEX = `${config.DATA_DIR}/gallery.json`;
// 聊天里收到的图片在 stream-json 里是 base64，Claude 看得见但手里没有文件。这里滚动留一份副本并告诉它路径。
const INBOX_DIR = `${config.DATA_DIR}/inbox`;
const INBOX_KEEP = 12;
const COL_DIR = `${config.DATA_DIR}/collections`;
const COL_ITEM_MAX = 1024 * 1024;

// Model catalog: grouped for the frontend picker, flattened for validation.
const MODEL_CATALOG = [
  { group: 'Opus', items: [
    { id: 'claude-opus-5-5[1m]', label: 'Opus 5.5 · 1M', note: '百万上下文' },
    { id: 'claude-opus-5-5', label: 'Opus 5.5', note: '' },
    { id: 'claude-opus-5', label: 'Opus 5', note: '最强旗舰' },
    { id: 'claude-opus-4-8', label: 'Opus 4.8', note: '' },
    { id: 'claude-opus-4-7', label: 'Opus 4.7', note: '' },
    { id: 'claude-opus-4-6[1m]', label: 'Opus 4.6 · 1M', note: '百万上下文' },
    { id: 'claude-opus-4-6', label: 'Opus 4.6', note: '200K 上下文' },
  ] },
  { group: 'Sonnet', items: [
    { id: 'claude-sonnet-5', label: 'Sonnet 5', note: '快而聪明' },
    { id: 'claude-sonnet-4-5', label: 'Sonnet 4.5', note: '' },
    { id: 'claude-sonnet-4-20250514', label: 'Sonnet 4', note: '' },
  ] },
  { group: 'Fable', items: [
    { id: 'claude-fable-5-1', label: 'Fable 5.1', note: '新版' },
    { id: 'claude-fable-5', label: 'Fable 5', note: 'Mythos 级新旗舰' },
  ] },
  { group: 'Haiku', items: [
    { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', note: '轻快简洁' },
  ] },
];
const ALLOWED_MODELS = new Set(MODEL_CATALOG.flatMap(g => g.items.map(item => item.id)));
const DEFAULT_MODEL = 'claude-opus-5-5[1m]';
const DEFAULT_CHANNEL = 'claude-subscription';
const CHANNEL_IDS = new Set(['claude-subscription', 'claude-api', 'claude-openrouter', 'codex', 'deepseek', 'chatgpt']);
const CODEX_MODELS = [
  { id: 'codex-default', label: '订阅默认', note: '跟随 CLI' },
  { id: 'gpt-5.4', label: 'GPT-5.4', note: '' },
  { id: 'gpt-5.3-codex', label: 'GPT-5.3 Codex', note: '' },
  { id: 'gpt-5.2-codex', label: 'GPT-5.2 Codex', note: '' },
];
const ALLOWED_EFFORTS = new Set(['low', 'medium', 'high', 'max']);
// Claude Code 权限模式（每个房间单独存 room.permission_mode）
const PERMISSION_MODES = new Set(['default', 'acceptEdits', 'plan', 'bypassPermissions']);
const defaultPermissionMode = () => (PERMISSION_MODES.has(config.PERMISSION_MODE) ? config.PERMISSION_MODE : 'default');

// fingertips: rhythm only, never message content.
const FINGERTIPS = { orphanAfter: 600, minNote: 20, pauseGap: 15, maxPings: 300 };
function readFingertips() {
  try {
    const value = JSON.parse(readFileSync(FINGERTIPS_FILE, 'utf8'));
    return { pings: Array.isArray(value.pings) ? value.pings.filter(Number.isFinite) : [], orphan: value.orphan || null };
  } catch { return { pings: [], orphan: null }; }
}
function writeFingertips(state) {
  writeFileSync(FINGERTIPS_FILE, JSON.stringify({ pings: state.pings.slice(-FINGERTIPS.maxPings), orphan: state.orphan || null }), 'utf8');
}
function settleFingertips(state, now = Date.now() / 1000) {
  if (state.pings.length && now - state.pings[state.pings.length - 1] > FINGERTIPS.orphanAfter) {
    if (state.pings[state.pings.length - 1] - state.pings[0] >= 5) {
      state.orphan = { start: state.pings[0], end: state.pings[state.pings.length - 1] };
    }
    state.pings = [];
  }
  return state;
}
function pingFingertips() {
  const now = Date.now() / 1000;
  const state = settleFingertips(readFingertips(), now);
  state.pings.push(now);
  writeFingertips(state);
  return { ok: true };
}
function popFingertipsNote() {
  const now = Date.now() / 1000;
  const state = settleFingertips(readFingertips(), now);
  const notes = [];
  if (state.orphan) {
    const minutes = Math.max(0, Math.floor((now - state.orphan.end) / 60));
    const duration = Math.max(0, Math.floor(state.orphan.end - state.orphan.start));
    notes.push(`TA ${minutes} 分钟前打过 ${duration} 秒的字，那条没有发出来（打了什么无人知晓，包括系统）`);
    state.orphan = null;
  }
  if (state.pings.length) {
    const duration = Math.max(0, Math.floor(state.pings[state.pings.length - 1] - state.pings[0]));
    let pauses = 0;
    for (let i = 1; i < state.pings.length; i += 1) if (state.pings[i] - state.pings[i - 1] > FINGERTIPS.pauseGap) pauses += 1;
    if (duration >= FINGERTIPS.minNote || pauses) {
      notes.push(`这条消息 TA 打了 ${duration} 秒${pauses ? `，中途停下来想了 ${pauses} 次` : ''}`);
    }
    state.pings = [];
  }
  writeFingertips(state);
  return notes.join('；');
}

function tzOffsetMinutes(date, tz) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date);
    const g = t => Number(parts.find(p => p.type === t)?.value || 0);
    const asUTC = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
    return Math.round((asUTC - Math.floor(date.getTime() / 1000) * 1000) / 60000);
  } catch { return 0; }
}
function chinaISOString(date = new Date()) {
  const off = tzOffsetMinutes(date, config.TZ);
  const shifted = new Date(date.getTime() + off * 60 * 1000);
  const sign = off >= 0 ? '+' : '-', a = Math.abs(off);
  return shifted.toISOString().replace('Z', `${sign}${String(Math.floor(a / 60)).padStart(2, '0')}:${String(a % 60).padStart(2, '0')}`);
}

// --- Rooms store ---
// Each room owns its own Claude session. Group rooms additionally keep one
// session per member (member_sessions) so group talk never pollutes the
// member's private direct-chat session — the exact bug that broke the first
// rooms build (one shared process, sessions crosstalking).

function defaultRooms() {
  return {
    active_room: 'home',
    rooms: [
      { id: 'home', title: config.AI_NAME, type: 'direct', agent: 'claude', model: DEFAULT_MODEL, effort: 'high', session_id: null, workspace: CWD, created_at: chinaISOString() },
      { id: 'group', title: '群聊', type: 'group', agent: null, model: null, effort: null, member_sessions: {}, created_at: chinaISOString() },
    ],
  };
}

function readRooms() {
  let data;
  try { data = JSON.parse(readFileSync(ROOMS_FILE, 'utf8')); } catch { data = null; }
  if (!data || !Array.isArray(data.rooms)) data = defaultRooms();
  if (!data.rooms.some(room => room.id === 'home')) data.rooms.unshift(defaultRooms().rooms[0]);
  if (!data.rooms.some(room => room.id === 'group')) data.rooms.push(defaultRooms().rooms[1]);
  for (const room of data.rooms) {
    if (room.type !== 'group') {
      if (!ALLOWED_MODELS.has(room.model)) room.model = DEFAULT_MODEL;
      if (!ALLOWED_EFFORTS.has(room.effort)) room.effort = 'high';
      if (!PERMISSION_MODES.has(room.permission_mode)) room.permission_mode = defaultPermissionMode();
      if (!room.agent) room.agent = 'claude';
      if (!CHANNEL_IDS.has(room.channel)) room.channel = room.agent === 'codex' ? 'codex' : DEFAULT_CHANNEL;
      if (!room.channel_models || typeof room.channel_models !== 'object') room.channel_models = {};
      if (!room.channel_models['claude-subscription']) room.channel_models['claude-subscription'] = room.model;
      if (room.channel === 'codex' && !room.channel_models.codex) room.channel_models.codex = 'codex-default';
    } else if (!room.member_sessions || typeof room.member_sessions !== 'object') {
      room.member_sessions = {};
    }
  }
  // Legacy migration: the home session used to live in state.json only.
  const home = data.rooms.find(room => room.id === 'home');
  if (home && !home.session_id) {
    try { home.session_id = JSON.parse(readFileSync(STATE_FILE, 'utf8')).session_id || null; } catch {}
  }
  return data;
}

function writeRooms(data) {
  try { writeFileSync(ROOMS_FILE, JSON.stringify(data, null, 2), 'utf8'); } catch (error) { console.error('[rooms] write failed:', error.message); }
}

function getRoom(roomId) {
  return roomsData.rooms.find(room => room.id === String(roomId || 'home')) || null;
}

function directRooms() {
  return roomsData.rooms.filter(room => room.type === 'direct' && !room.hidden);
}

function slugId(title) {
  const base = String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  const id = base || `room-${randomUUID().slice(0, 6)}`;
  return getRoom(id) ? `${id}-${randomUUID().slice(0, 4)}` : id;
}

// --- History (single JSONL, room-tagged; legacy lines without room_id are home) ---

// ── Bark 推送（可选）：回复推到 iOS 的 Bark。地址在设置里填（或环境变量 BARK_URL），空 = 不推；BARK_PUSH=0 也能临时关。
// 不 await（绝不拖慢回复）、失败静默、同房间 3 秒内不重复推。
const BARK_HOME_URL = config.PUBLIC_URL;
const barkLastAt = new Map();
function pushBark(text, roomId = 'home') {
  try {
    const BARK_URL = require('./integrations').current().bark.url;
    if (!config.BARK_PUSH || !BARK_URL || !text) return;
    const now = Date.now();
    if (now - (barkLastAt.get(roomId) || 0) < 3000) return;
    barkLastAt.set(roomId, now);
    const body = String(text)
      .replace(/```[\s\S]*?```/g, '［代码］')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '［图］')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 90);
    if (!body) return;
    fetch(BARK_URL + '/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: config.AI_NAME, body, group: 'Perigee', ...(BARK_HOME_URL ? { url: BARK_HOME_URL } : {}) }),
    }).catch(error => console.log('[bark] push failed:', error.message));
  } catch (error) { console.log('[bark] skipped:', error.message); }
}

/** 提醒用：标题自定，不做节流。返回是否真的发出去了（没配 Bark / 暂停推送 = false） */
function pushBarkRaw(title, body) {
  const BARK_URL = require('./integrations').current().bark.url;
  if (!config.BARK_PUSH || !BARK_URL || !body) return false;
  fetch(BARK_URL + '/', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, body: String(body).slice(0, 180), group: 'Perigee', ...(BARK_HOME_URL ? { url: BARK_HOME_URL } : {}) }),
  }).catch(error => console.log('[bark] push failed:', error.message));
  return true;
}

function appendHistory(message) {
  const record = {
    ts: chinaISOString(),
    room_id: String(message.room_id || 'home'),
    role: message.role === 'assistant' ? 'assistant' : message.role === 'system' ? 'system' : 'user',
    ...(message.role === 'system' && message.kind ? { kind: String(message.kind) } : {}),
    text: String(message.text || ''),
    image: typeof message.image === 'string' ? message.image : null,
    ...(Array.isArray(message.images) ? { images: message.images.filter(u => typeof u === 'string').slice(0, 20) } : {}),
    thinking: typeof message.thinking === 'string' && message.thinking ? message.thinking : null,
    ...(message.audio ? { audio: String(message.audio), audio_seconds: Math.max(0, Number(message.audio_seconds) || 0) } : {}),
    ...(message.author ? { author: String(message.author), author_title: String(message.author_title || message.author) } : {}),
    ...(CHANNEL_IDS.has(message.channel) ? { channel: message.channel } : {}),
    ...(Array.isArray(message.tools) && message.tools.length
      ? { tools: message.tools.slice(0, 100).map(t => ({ name: String(t?.name || 'tool').slice(0, 80), ok: t?.ok !== false })) } : {}),
  };
  appendFileSync(HISTORY_FILE, JSON.stringify(record) + '\n', 'utf8');
  return record;
}

function readAllHistory() {
  try {
    return readFileSync(HISTORY_FILE, 'utf8').split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch { return []; }
}

// 读不出来就抛错，绝不当成"没有记录"去覆盖；解析不了的行原样留着；
// 先写临时文件、落盘、再整体替换，上一版留成 .bak。mutate 收到 [{line, rec}]，返回要留下的行。
function rewriteHistory(mutate) {
  let text;
  try { text = readFileSync(HISTORY_FILE, 'utf8'); }
  catch (e) { if (e.code !== 'ENOENT') throw e; text = ''; }
  const rows = text.split('\n').filter(Boolean).map(line => {
    try { return { line, rec: JSON.parse(line) }; } catch { return { line, rec: null }; }
  });
  const out = mutate(rows);
  if (!Array.isArray(out)) return;
  const body = out.map(row => row.rec ? JSON.stringify(row.rec) : row.line).join('\n') + (out.length ? '\n' : '');
  const tmp = `${HISTORY_FILE}.tmp-${process.pid}`;
  const fd = openSync(tmp, 'w');
  try { writeSync(fd, body); fsyncSync(fd); } finally { closeSync(fd); }
  try { copyFileSync(HISTORY_FILE, `${HISTORY_FILE}.bak`); } catch {}
  renameSync(tmp, HISTORY_FILE);
}

function channelCatalog() {
  return channelHub.channels(CODEX_AVAILABLE).map(channel => {
    if (channel.id === 'claude-subscription' || channel.id === 'claude-api') {
      return { ...channel, models: MODEL_CATALOG.flatMap(group => group.items.map(item => ({ ...item, note: item.note || group.group }))) };
    }
    if (channel.id === 'codex') return { ...channel, models: CODEX_MODELS };
    return { ...channel, models: Array.isArray(channel.models) ? channel.models : [] };
  });
}

function selectedChannelModel(room, channel, requested) {
  const models = channelCatalog().find(item => item.id === channel)?.models || [];
  const ids = new Set(models.map(item => item.id));
  const remembered = room?.channel_models?.[channel];
  if (ids.has(requested)) return requested;
  if (ids.has(remembered)) return remembered;
  if (channel === DEFAULT_CHANNEL && ids.has(room?.model)) return room.model;
  return models[0]?.id || '';
}

function readHistory(before, limit = 50, roomId = 'home') {
  limit = Math.min(200, Math.max(1, Number(limit) || 50));
  let messages = readAllHistory();
  if (roomId && roomId !== 'all') {
    messages = messages.filter(message => String(message.room_id || 'home') === String(roomId));
  }
  if (before) messages = messages.filter(message => String(message.ts || '') < before);
  const hasMore = messages.length > limit;
  return { messages: messages.slice(-limit), hasMore };
}

function historyStats() {
  const stats = {};
  let total = 0;
  for (const message of readAllHistory()) {
    const id = String(message.room_id || 'home');
    if (!stats[id]) stats[id] = { count: 0, last_ts: null, last_text: '' };
    stats[id].count += 1;
    stats[id].last_ts = message.ts || stats[id].last_ts;
    stats[id].last_text = String(message.text || '').slice(0, 60);
    total += 1;
  }
  return { stats, total };
}

// --- Gallery ---

const GALLERY_MIME = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif',
  'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
};
const GALLERY_MIME_BY_EXT = Object.fromEntries(Object.entries(GALLERY_MIME).map(([mime, ext]) => [ext, mime]));

function readGallery() {
  try {
    const items = JSON.parse(readFileSync(GALLERY_INDEX, 'utf8'));
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}

function writeGallery(items) {
  writeFileSync(GALLERY_INDEX, JSON.stringify(items, null, 2), 'utf8');
}

function galleryAdd(body) {
  const match = String(body.image || '').match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error('需要 dataURL 格式的图片');
  const mime = match[1].toLowerCase();
  const ext = GALLERY_MIME[mime];
  if (!ext) throw new Error('不支持的图片格式：' + mime);
  const data = Buffer.from(match[2], 'base64');
  if (!data.length) throw new Error('图片是空的');
  const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  writeFileSync(`${GALLERY_DIR}/${id}.${ext}`, data);
  const item = {
    id, ext, mime,
    name: String(body.name || '').slice(0, 120) || null,
    caption: String(body.caption || '').slice(0, 300) || null,
    by: body.by === 'ai' ? 'ai' : 'user',
    ts: chinaISOString(),
    size: data.length,
  };
  const items = readGallery();
  items.unshift(item);
  writeGallery(items);
  return item;
}

function galleryDelete(id) {
  const items = readGallery();
  const item = items.find(entry => entry.id === id);
  if (!item) return false;
  writeGallery(items.filter(entry => entry.id !== id));
  try { unlinkSync(`${GALLERY_DIR}/${item.id}.${item.ext}`); } catch {}
  return true;
}

function serveGalleryFile(res, id) {
  const safe = String(id).match(/^([a-z0-9-]+)\.([a-z0-9]+)$/i);
  const path = safe ? `${GALLERY_DIR}/${safe[1]}.${safe[2]}` : null;
  if (!path || !existsSync(path)) { json(res, 404, { error: { message: 'not found' } }); return; }
  const mime = GALLERY_MIME_BY_EXT[safe[2].toLowerCase()] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': statSync(path).size,
    'Cache-Control': 'private, max-age=31536000, immutable',
  });
  require('stream').pipeline(createReadStream(path), res, () => {});
}

// --- Collections (shared store for the room pages) ---

function readCol(name) {
  try {
    const items = JSON.parse(readFileSync(`${COL_DIR}/${name}.json`, 'utf8'));
    return Array.isArray(items) ? items : [];
  } catch { return []; }
}

function writeCol(name, items) {
  writeFileSync(`${COL_DIR}/${name}.json`, JSON.stringify(items, null, 2), 'utf8');
}

function stickerNote() {
  const items = readCol('stickers').filter(s => s && s.name);
  if (!items.length) return '';
  const list = items.slice(0, 200).map(s => {   // 柜子是新的在前
    const tags = Array.isArray(s.tags) ? s.tags.join('/') : String(s.tags || '');
    return tags ? `${s.name}（${tags}）` : s.name;
  }).join('、');
  return `[表情包] 你和对方共用一个表情包库。消息里的 [sticker:名字] 是一张表情包。想发的时候单独起一段写 [sticker:名字]，名字只能从这里挑：${list}`;
}

function colAdd(name, body) {
  const raw = JSON.stringify(body || {});
  if (raw.length > COL_ITEM_MAX) throw new Error('条目太大了');
  const item = { ...JSON.parse(raw) };
  delete item.id;
  item.id = `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  if (!item.ts) item.ts = chinaISOString();
  if (name === 'moments' || name === 'moment_comments') {
    const actor = String(item.author || item.actor || item.by || '').trim().toLowerCase();
    item.author = ['user', 'ai'].includes(actor) ? actor : 'user';
    item.by = item.author;
    delete item.actor;
  } else {
    item.by = item.by === 'ai' ? 'ai' : 'user';
  }
  const items = readCol(name);
  items.unshift(item);
  writeCol(name, items);
  return item;
}

function colPatch(name, id, body) {
  const items = readCol(name);
  const item = items.find(entry => entry.id === id);
  if (!item) return null;
  const patch = JSON.parse(JSON.stringify(body || {}));
  delete patch.id; delete patch.ts;
  Object.assign(item, patch);
  writeCol(name, items);
  return item;
}

function colDelete(name, id) {
  const items = readCol(name);
  if (!items.some(entry => entry.id === id)) return false;
  writeCol(name, items.filter(entry => entry.id !== id));
  return true;
}

// Stash incoming chat images as files and return note blocks telling Claude
// where the copies live. Mutating nothing: returns extra text blocks to inject.
function stashInboxImages(contentArray) {
  const notes = [];
  try {
    for (const block of contentArray) {
      if (block.type !== 'image' || !block.source?.data) continue;
      const ext = GALLERY_MIME[String(block.source.media_type || '').toLowerCase()] || 'png';
      const name = `${Date.now().toString(36)}-${randomUUID().slice(0, 6)}.${ext}`;
      writeFileSync(`${INBOX_DIR}/${name}`, Buffer.from(block.source.data, 'base64'));
      notes.push({ type: 'text', text: `[这张图片的文件副本在 ${INBOX_DIR}/${name} ——对方要你存进图库时再处理（网关 POST /gallery，body {image: dataURL, caption}）；没让存就不要存。]` });
    }
    if (notes.length) {
      const { readdirSync } = require('fs');
      const files = readdirSync(INBOX_DIR).sort();
      for (const stale of files.slice(0, Math.max(0, files.length - INBOX_KEEP))) {
        try { unlinkSync(`${INBOX_DIR}/${stale}`); } catch {}
      }
    }
  } catch (error) { console.error('[inbox] stash failed:', error.message); }
  return notes;
}

module.exports = {
  init,
  CWD,
  STATE_FILE,
  HISTORY_FILE,
  GALLERY_DIR,
  INBOX_DIR,
  COL_DIR,
  MODEL_CATALOG,
  ALLOWED_MODELS,
  DEFAULT_MODEL,
  DEFAULT_CHANNEL,
  CHANNEL_IDS,
  ALLOWED_EFFORTS,
  PERMISSION_MODES,
  defaultPermissionMode,
  readFingertips,
  writeFingertips,
  settleFingertips,
  pingFingertips,
  popFingertipsNote,
  chinaISOString,
  defaultRooms,
  readRooms,
  writeRooms,
  getRoom,
  directRooms,
  slugId,
  pushBark,
  pushBarkRaw,
  appendHistory,
  readAllHistory,
  rewriteHistory,
  channelCatalog,
  selectedChannelModel,
  readHistory,
  historyStats,
  readGallery,
  writeGallery,
  galleryAdd,
  galleryDelete,
  serveGalleryFile,
  readCol,
  writeCol,
  stickerNote,
  colAdd,
  colPatch,
  colDelete,
  stashInboxImages,
};

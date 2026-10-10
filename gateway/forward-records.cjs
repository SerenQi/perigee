// Private, immutable chat snapshots. No transcript is embedded in history cards.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const marker = id => `[合并聊天记录 #${id}]`;
const recordId = text => String(text || '').match(/^\[合并聊天记录 #([a-f0-9-]{36})\]/)?.[1] || null;
const clean = (v, n) => String(v || '').replace(/\r/g, '').slice(0, n);
const config = require('./lib/config');
const stamp = ts => new Intl.DateTimeFormat('zh-CN', { timeZone: config.TZ, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ts));
function safeUrl(url) {
  if (typeof url !== 'string') return null;
  try {
    const decoded = decodeURIComponent(url);
    const api = config.API_PUBLIC_BASE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return (new RegExp('^' + api + '/(?:gallery/file|audio)/[^/\\\\?#\\u0000-\\u001f]+$').test(decoded) || /^\/crew-api\/api\/group\/attachments\/[^/\\?#\u0000-\u001f]+$/.test(decoded)) && !decoded.includes('..') ? url : null;
  } catch { return null; }
}
function assetPath(url) {
  const u = safeUrl(url); if (!u) return '';
  const name = decodeURIComponent(u.split('/').at(-1));
  const root = u.includes('/gallery/file/') ? `${config.DATA_DIR}/gallery` : u.includes('/audio/') ? `${config.DATA_DIR}/audio` : `${config.DATA_DIR}/crew-attachments`;
  return path.join(root, name);
}
function createForwardStore({ dir, getRoom, history, groupHistory, userName: nameOf = () => config.USER_NAME }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = id => { if (!UUID.test(id)) throw new Error('记录编号无效'); return path.join(dir, id + '.json'); };
  const load = id => JSON.parse(fs.readFileSync(file(id), 'utf8'));
  const save = r => { const p = file(r.id); fs.writeFileSync(p + '.tmp', JSON.stringify(r), { mode: 0o600 }); fs.renameSync(p + '.tmp', p); };
  const permitted = (r, room) => r.source === room || r.target === room;
  const get = (id, room, root, depth = 0) => {
    const r = load(id);
    if (permitted(r, room)) return r;
    if (root && depth < 8) {
      const parent = get(root, room, null, depth + 1);
      const walk = (record, n, seen) => {
        if (n > 8 || seen.has(record.id)) return false;
        seen.add(record.id);
        return record.messages.some(m => m.recordId === id || (m.recordId && walk(load(m.recordId), n + 1, seen)));
      };
      if (walk(parent, 0, new Set())) return r;
    }
    throw new Error('这个会话没有收到该记录');
  };
  async function create(body) {
    if (!UUID.test(body.id || '')) throw new Error('缺少有效的发送编号');
    const source = getRoom(body.source), target = getRoom(body.target);
    if (!source || !target || target.type !== 'direct') throw new Error('请选择现有私聊会话');
    if (!Array.isArray(body.messages) || !body.messages.length || body.messages.length > 20) throw new Error('请选择 1–20 条消息');
    const fingerprint = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
    if (fs.existsSync(file(body.id))) {
      const old = load(body.id);
      if (old.fingerprint !== fingerprint) throw new Error('发送编号已使用，请重新选择');
      return old;
    }
    const rows = source.type === 'group' ? await groupHistory() : history().filter(m => (m.room_id || 'home') === source.id);
    const used = new Set();
    const selected = body.messages.map(selector => {
      // Client timestamps differ slightly from the server for newly sent messages.
      // Prefer exact IDs/timestamps, then require content + role + a narrow time window.
      let index = rows.findIndex((r, i) => !used.has(i) && (source.type === 'group' ? String(r.id) === String(selector.id) : r.ts === selector.ts && r.role === selector.role));
      if (index < 0 && source.type !== 'group') {
        const matches = rows.map((r, i) => ({ r, i, delta: Math.abs(Date.parse(r.ts) - Date.parse(selector.ts)) }))
          .filter(({r,i,delta}) => !used.has(i) && r.role === selector.role && r.text === (selector.content || '[图片]') && delta < 30 * 60000).sort((a,b) => a.delta - b.delta);
        if (matches.length && (matches.length === 1 || matches[0].delta < matches[1].delta)) index = matches[0].i;
      }
      if (index < 0) throw new Error('有消息尚未保存或已经删除，请刷新后重新选择');
      used.add(index);
      const r = rows[index];
      let meta = {}; try { meta = typeof (r.meta ?? r.metadata) === 'string' ? JSON.parse(r.meta ?? r.metadata) : (r.meta ?? r.metadata ?? {}); } catch {}
      const text = String(r.text ?? r.content ?? '');
      const nested = recordId(text);
      if (nested) get(nested, source.id);
      const attachments = (Array.isArray(meta.attachments) ? meta.attachments : []).map(a => ({ name: clean(a.name, 200), mime: clean(a.mime, 100), url: safeUrl('/crew-api' + a.url) })).filter(a => a.url);
      const images = [...new Set([...(Array.isArray(r.images) ? r.images : []), r.image].map(safeUrl).filter(Boolean))];
      const audio = r.audio ? config.API_PUBLIC_BASE + '/audio/' + encodeURIComponent(r.audio) : null;
      return { index, who: clean(source.type === 'group' ? meta.displayName || meta.sender || (r.role === 'user' ? nameOf() : '未知发言人') : r.author_title || (r.role === 'user' ? nameOf() : source.title), 100), role: r.role, ts: r.ts, text, images, audio, attachments, recordId: nested };
    }).sort((a, b) => a.index - b.index);
    if (JSON.stringify(selected).length > 1000000) throw new Error('记录太长，请减少选择的消息');
    const r = { id: body.id, fingerprint, source: source.id, target: target.id, title: source.type === 'group' ? `${source.title}的聊天记录` : `${nameOf()}和${source.title}的聊天记录`, sourceTitle: source.title, topic: clean(body.topic, 120).trim(), comment: clean(body.comment, 4000).trim(), createdAt: new Date().toISOString(), messages: selected, count: selected.length };
    const heading = `${r.title}\n转自「${r.sourceTitle}」 · ${r.count} 条 · ${nameOf()} 合并转发\n关于：${r.topic || '未填写'}\n`;
    const transcript = heading + selected.map(m => `\n[${stamp(m.ts)}] ${m.who}：${m.text}\n${m.images.map(u => `[图片] ${u}\n[本机图片文件] ${assetPath(u)}`).join('\n')}${m.attachments.map(a => `\n[文件 ${a.name}] ${a.url}\n[本机附件文件] ${assetPath(a.url)}`).join('')}${m.audio ? `\n[语音原音] ${m.audio}` : ''}${m.recordId ? `\n[嵌套记录，按需读取] ${path.join(dir, m.recordId + '.txt')}` : ''}`).join('\n');
    fs.writeFileSync(path.join(dir, r.id + '.txt'), transcript, { mode: 0o600 });
    save(r);
    return r;
  }
  function cardText(r) { return `${marker(r.id)}\n${r.title}${r.comment ? '\n\n' + r.comment : ''}`; }
  function summary(r) { return { id: r.id, title: r.title, sourceTitle: r.sourceTitle, topic: r.topic, count: r.count, start: r.messages[0]?.ts, end: r.messages.at(-1)?.ts, lines: r.messages.slice(0, 3).map(m => ({ who: m.who, text: m.recordId ? '[聊天记录]' : m.text.slice(0,180) || (m.images.length ? '[图片]' : '[附件]') })) }; }
  function shelf(room) {
    const ids = [...new Set(history().filter(m => (m.room_id || 'home') === room).map(m => recordId(m.text)).filter(Boolean))].slice(-20);
    return ids.map(id => { try { const r = get(id, room); return `#${id} ${r.title}${r.topic ? '【' + r.topic + '】' : ''} · ${r.count} 条；路径 ${path.join(dir, id + '.txt')}`; } catch { return ''; } }).filter(Boolean).join('\n');
  }
  const pending = new Map();
  const serialCreate = body => {
    const task = (pending.get(body.id) || Promise.resolve()).catch(() => {}).then(() => create(body));
    pending.set(body.id, task);
    task.finally(() => { if (pending.get(body.id) === task) pending.delete(body.id); }).catch(() => {});
    return task;
  };
  return { create: serialCreate, get, save, cardText, summary, shelf, filePath: id => { file(id); return path.join(dir, id + '.txt'); } };
}
module.exports = { createForwardStore, marker, recordId, safeUrl };

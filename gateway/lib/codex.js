// 下面每一段都是 server.js 里的原文，一个字没动；只多了开头的 require、init 注入和结尾的导出。
const { randomUUID } = require('crypto');
const { statSync, readFileSync, readdirSync } = require('fs');
const config = require('./config');
const { spawn } = require('child_process');
const { CWD, appendHistory, galleryAdd, getRoom, writeRooms } = require('./store');

// 主文件启动时注进来（这些值在主文件原位、按原顺序算出来；模块里只在函数被调用时才用到）
let CODEX_AVAILABLE, roomsData;
function init(deps) {
  ({ CODEX_AVAILABLE, roomsData } = deps);
}

const CODEX = config.CODEX_BIN;
const CODEX_CWD = config.CODEX_CWD;
const codexChildren = new Map();
const codexEventClients = new Map();
function broadcastCodex(roomId, event) {
  const packet = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of [...(codexEventClients.get(roomId) || [])]) {
    try { client.write(packet); } catch { codexEventClients.get(roomId)?.delete(client); }
  }
}

// --- Codex adapter ---

function codexOfflineReply(res, headersSent, speaker) {
  if (!headersSent) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
  }
  const id = `chatcmpl-${randomUUID().slice(0, 8)}`;
  const chunk = fields => res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: 'codex', ...(speaker ? { speaker } : {}), choices: [{ index: 0, delta: fields, finish_reason: null }] })}\n\n`);
  chunk({ role: 'assistant' });
  const text = 'Codex 暂时离线：请检查服务器上的 Codex CLI 安装与登录状态，然后重启 gateway。';
  chunk({ content: text });
  res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: 'codex', ...(speaker ? { speaker } : {}), choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
  return text;
}

const CODEX_IMG_DIR = require('os').homedir() + '/.codex/generated_images';
function collectCodexImages(sinceMs) {
  try {
    const files = readdirSync(CODEX_IMG_DIR)
      .filter(f => /\.(png|jpe?g|webp)$/i.test(f))
      .map(f => ({ f, path: `${CODEX_IMG_DIR}/${f}`, mtime: statSync(`${CODEX_IMG_DIR}/${f}`).mtimeMs }))
      .filter(x => x.mtime >= sinceMs)
      .sort((a, b) => a.mtime - b.mtime);
    const urls = [];
    for (const x of files.slice(0, 6)) {  // 单回合最多带6张，防刷屏
      const data = readFileSync(x.path);
      const mime = /\.png$/i.test(x.f) ? 'image/png' : /\.webp$/i.test(x.f) ? 'image/webp' : 'image/jpeg';
      const item = galleryAdd({
        image: `data:${mime};base64,${data.toString('base64')}`,
        name: x.f, caption: 'Codex 生成', by: 'ai',
      });
      urls.push(`${config.API_PUBLIC_BASE}/gallery/file/${item.id}.${item.ext}`);
    }
    return urls;
  } catch { return []; }
}

// 两轮同时 resume 同一个线程会把它劈成两半。和 Claude 那边的 ClaudeProcess 一样排队。
const codexQueues = new Map();
async function codexSend(room, contentArray, res, ctx) {
  const key = ctx.roomId;
  const prev = codexQueues.get(key) || Promise.resolve();
  let release;
  const mine = new Promise(r => { release = r; });
  const tail = prev.then(() => mine);
  codexQueues.set(key, tail);
  await prev;
  try { await codexTurn(room, contentArray, res, ctx); }
  finally {
    release();
    if (codexQueues.get(key) === tail) codexQueues.delete(key);
  }
}

// Per-turn Codex adapter: spawn `codex exec --json`, resume by thread id.
// 返回的 Promise 在这一轮真正结束（进程退出）时才 resolve，排队靠它。
async function codexTurn(room, contentArray, res, ctx) {
  const speaker = ctx.speaker || null;
  const visibleText = contentArray.filter(block => block.type === 'text').map(block => block.text || '').join('\n');
  // persist:false = 不进这个房间的聊天记录
  const keep = ctx.persist !== false;
  const text = visibleText;
  if (!CODEX_AVAILABLE) {
    const reply = codexOfflineReply(res, ctx.headersSent, speaker);
    const codexImgs = collectCodexImages(Date.now());
    if (codexImgs.length) {
      for (const [i, u] of codexImgs.entries()) if (keep) appendHistory({ role: 'assistant', text: i === 0 ? reply : '', image: u, room_id: ctx.roomId, channel: 'codex', author: ctx.author, author_title: ctx.authorTitle });
    } else if (keep) {
      appendHistory({ role: 'assistant', text: reply, room_id: ctx.roomId, channel: 'codex', author: ctx.author, author_title: ctx.authorTitle });
    }
    if (ctx.endOnResult === false) { ctx.resolve?.({ reply, thinking: '', aborted: false }); return; }
    res.write('data: [DONE]\n\n');
    res.end();
    return;
  }
  if (!ctx.headersSent) {
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' });
    ctx.headersSent = true;
  }
  const id = `chatcmpl-${randomUUID().slice(0, 8)}`;
  const chunk = fields => { try { res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: 'codex', ...(speaker ? { speaker } : {}), choices: [{ index: 0, delta: fields, finish_reason: null }] })}\n\n`); } catch {} };
  chunk({ role: 'assistant' });
  broadcastCodex(ctx.roomId, { type: 'user_message', text: visibleText, source: 'chat' });
  const workspace = room.workspace || CODEX_CWD;
  // --approve-for-me uses the workspace-write sandbox and routes any elevated
  // action through Codex's automatic safety review.
  const args = ['exec', '--json', '--approve-for-me', '--skip-git-repo-check', '-C', workspace];
  if (ctx.model && ctx.model !== 'codex-default') args.push('--model', ctx.model);
  const record = getRoom(ctx.roomId);
  // Codex 自己的房间：新字段 channel_sessions.codex 还空着时接回老字段 session_id 里的那条线程——
  const threadId = ctx.groupMemberId
    ? record?.member_sessions?.[ctx.groupMemberId]
    : (ctx.channelSessionKey
      ? (record?.channel_sessions?.[ctx.channelSessionKey] || (record?.agent === 'codex' ? record?.session_id : undefined))
      : record?.session_id);
  if (threadId) args.push('resume', threadId);
  args.push(text || '(空消息)');
  const turnStartMs = Date.now();
  const child = spawn(CODEX, args, { cwd: workspace, stdio: ['ignore', 'pipe', 'pipe'] });
  codexChildren.set(ctx.roomId, child);
  const finished = new Promise(resolve => { child.once('close', resolve); child.once('error', resolve); });
  let reply = '';
  let buf = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', data => {
    buf += data;
    const lines = buf.split('\n');
    buf = lines.pop() || '';
    for (const line of lines) {
      let ev;
      try { ev = JSON.parse(line); } catch { continue; }
      const type = ev.type || ev.msg?.type || '';
      if (type === 'thread.started' || type === 'session_configured') {
        const tid = ev.thread_id || ev.session_id || ev.msg?.session_id;
        if (tid && record) {
          if (ctx.groupMemberId) { record.member_sessions = record.member_sessions || {}; record.member_sessions[ctx.groupMemberId] = tid; }
          else if (ctx.channelSessionKey) {
            record.channel_sessions = record.channel_sessions || {}; record.channel_sessions[ctx.channelSessionKey] = tid;
            if (record.agent === 'codex') record.session_id = tid;   // 两个字段保持一致，谁读都是同一条线程
          }
          else record.session_id = tid;
          writeRooms(roomsData);
        }
      }
      if (type === 'item.started') {
        const item = ev.item || {};
        if (item.type === 'command_execution' || item.type === 'mcp_tool_call') broadcastCodex(ctx.roomId, { type: 'tool_start', id: item.id, name: item.command || item.server || item.type });
      }
      const deltaText = type === 'item.output_text.delta' ? (ev.delta || '') : (type === 'agent_message_delta' ? (ev.msg?.delta || '') : '');
      if (deltaText) { reply += deltaText; chunk({ content: deltaText }); broadcastCodex(ctx.roomId, { type: 'assistant_delta', text: deltaText }); }
      if ((type === 'item.completed' && ev.item?.type === 'agent_message' && !reply) || (type === 'agent_message' && !reply)) {
        const full = ev.item?.text || ev.msg?.message || '';
        if (full) { reply += full; chunk({ content: full }); broadcastCodex(ctx.roomId, { type: 'assistant_delta', text: full }); }
      }
      if (type === 'item.completed' && ['command_execution', 'mcp_tool_call'].includes(ev.item?.type)) broadcastCodex(ctx.roomId, { type: 'tool_done', id: ev.item.id, name: ev.item.command || ev.item.server || ev.item.type });
    }
  });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', data => console.log(`[codex:${ctx.roomId}]`, data.trim()));
  child.on('close', code => {
    if (codexChildren.get(ctx.roomId) === child) codexChildren.delete(ctx.roomId);
    if (!reply && code) reply = `（Codex 本次运行失败，退出码 ${code}。请查看网关日志。）`;
    if (!reply) { reply = '（Codex 没有返回内容）'; chunk({ content: reply }); }
    if (keep) appendHistory({ role: 'assistant', text: reply, room_id: ctx.roomId, channel: 'codex', author: ctx.author, author_title: ctx.authorTitle });
    try { res.write(`data: ${JSON.stringify({ id, object: 'chat.completion.chunk', model: 'codex', ...(speaker ? { speaker } : {}), choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`); } catch {}
    broadcastCodex(ctx.roomId, { type: 'turn_done', session_id: record?.session_id || null });
    if (ctx.endOnResult === false) { ctx.resolve?.({ reply, thinking: '', aborted: false }); return; }
    try { res.write('data: [DONE]\n\n'); res.end(); } catch {}
  });
  return finished;
}

// Persistent real shell per room. `script` provides a PTY while keeping the
// gateway dependency-free; each room gets isolated cwd/output/input state.
const shells = new Map();
function shellFor(room) {
  if (shells.has(room.id)) return shells.get(room.id);
  const clients = new Set();
  const cwd = room.agent === 'codex' ? (room.workspace || CODEX_CWD) : CWD;
  const proc = spawn('/usr/bin/script', ['-qfec', 'bash --noprofile --norc', '/dev/null'], { cwd, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, TERM: 'xterm-256color' } });
  const shell = { proc, clients, cwd };
  const emit = data => { const packet = `data: ${JSON.stringify({ type: 'output', text: data.toString() })}\n\n`; for (const c of [...clients]) { try { c.write(packet); } catch { clients.delete(c); } } };
  proc.stdout.on('data', emit); proc.stderr.on('data', emit);
  proc.on('close', code => { emit(`\r\n[终端已退出 · ${code ?? ''}]\r\n`); shells.delete(room.id); });
  shells.set(room.id, shell);
  return shell;
}

module.exports = {
  init,
  CODEX,
  CODEX_CWD,
  codexChildren,
  codexEventClients,
  broadcastCodex,
  codexOfflineReply,
  collectCodexImages,
  codexSend,
  shellFor,
};

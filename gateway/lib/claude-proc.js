// 下面每一段都是 server.js 里的原文，一个字没动；只多了开头的 require、init 注入和结尾的导出。
const { readFileSync, writeFileSync, statSync, existsSync } = require('fs');
const { spawnSync, spawn } = require('child_process');
const { randomUUID } = require('crypto');
const config = require('./config');
const { PERMISSION_MODES, defaultPermissionMode, ALLOWED_EFFORTS, ALLOWED_MODELS, CHANNEL_IDS, CWD, DEFAULT_CHANNEL, DEFAULT_MODEL, STATE_FILE, appendHistory, readAllHistory, getRoom, popFingertipsNote, pushBark, stickerNote, writeRooms } = require('./store');

// 主文件启动时注进来（这些值在主文件原位、按原顺序算出来；模块里只在函数被调用时才用到）
let CLI_SUPPORTS_EFFORT, roomsData;

const USAGE_FILE = `${config.DATA_DIR}/context-usage.json`;
function readUsage() { try { return JSON.parse(readFileSync(USAGE_FILE, 'utf8')) || {}; } catch { return {}; } }
function writeUsage(key, v) {
  try { const all = readUsage(); all[key] = v; writeFileSync(USAGE_FILE, JSON.stringify(all)); }
  catch (e) { console.error('[usage] save', e.message); }
}
function init(deps) {
  ({ CLI_SUPPORTS_EFFORT, roomsData } = deps);
}

const CLAUDE = config.CLAUDE_BIN;
// 以前没人接。账号级的，所有房间共用一份；落盘，重启不丢。设置 › 此刻 从 /status 的 rate_limit 读。
const RATE_LIMIT_FILE = `${config.DATA_DIR}/rate-limit.json`;
let RATE_LIMIT = (() => { try { return JSON.parse(readFileSync(RATE_LIMIT_FILE, 'utf8')); } catch { return null; } })();
function noteRateLimit(info) {
  if (!info) return;
  RATE_LIMIT = { ...info, seen_at: Date.now() };
  try { writeFileSync(RATE_LIMIT_FILE, JSON.stringify(RATE_LIMIT)); } catch { /* 写不下就只在内存里 */ }
}
const HEARTBEAT_MS = 10_000;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const CONTEXT_WINDOW_TOKENS = 1_000_000;

// ── 自动换窗（forge）────────────────────────────────────────────
// 默认关（设置 › Claude 会话 里开）。上下文水位到设定值且空闲时：让会话内的 Claude 写完交接包（硬门槛）→ 备份 →
// forge-reload.js 剪切原文（保留最近 N token 的原文）+ 注入交接包 → switchSession 无感续接。
// 剪切脚本：gateway/tools/forge-reload/forge-reload.js（第三方 MIT，见同目录 README）。
// 开关和阈值在设置里改（config 的 getter，改完立刻生效）
// 超过这个字符数的工具输出在剪切时降采样（头60%+尾25%）——text/thinking 一字不动。0 = 关闭。
const FORGE_DIR = config.FORGE_DIR;
const FORGE_HANDOFF_FILE = FORGE_DIR + '/handoff.md';
const FORGE_HISTORY_FILE = require('os').homedir() + '/.claude/forge_history.json';
const FORGE_PROJ_DIR = require('os').homedir() + '/.claude/projects/' + config.CLAUDE_CWD.replace(/[^A-Za-z0-9]/g, '-');
const FORGE_HANDOFF_PROMPT = [
  '【自动换窗·交接】上下文快满了，马上要换到新窗口（最近的原文原封保留，你写的交接包会注入新窗）。',
  '现在做两件事，做完后只回复"交接完毕"四个字：',
  '① 增量更新 ' + FORGE_DIR + '/rolling-summary.md：近段细写、远段粗写，在原文档上演化，不从零重写。',
  '② 重写 ' + FORGE_DIR + '/handoff.md，固定格式——『对方此刻：…』『进行中：…（一件一件，停在哪一步）』『对方最后一句：（原文）』『我答应了还没做的：…』。',
].join('\n');

// 从那里开始到结尾都不是我说的话——落盘、推送前截掉。
const FAKE_USER_RE = /\n[ \t]*\n?[ \t]*user[ \t]*\[Request interrupted/;
const FAKE_USER_HEAD = '\nuser[Request interrupted';
function cutFakeUser(text) {
  const s = String(text || '');
  const i = s.search(FAKE_USER_RE);
  return i >= 0 ? s.slice(0, i) : s;
}
// 流式推送时：结尾那一截如果可能是假用户轮的开头（还没吐完），先扣着不推。返回可以安全推出去的长度。
function safeTextLen(text) {
  for (let i = Math.max(0, text.length - FAKE_USER_HEAD.length - 4); i < text.length; i++) {
    if (text[i] !== '\n') continue;
    const tail = text.slice(i).replace(/^\n[ \t]*\n?[ \t]*/, '\n');
    if (FAKE_USER_HEAD.startsWith(tail)) return i;
  }
  return text.length;
}
function isSubagentEvent(ev) {
  return Boolean(ev && (ev.parent_tool_use_id || ev.message?.parent_tool_use_id));
}

function maskSecrets(text) {
  return String(text || '')
    .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, 'eyJ…')
    .replace(/([?&](?:token|key|secret|auth|apikey|access_token)=)[^&\s]+/gi, '$1…')
    .replace(/\/([A-Za-z0-9_-]{28,})(?=[\/\s?]|$)/g, (m, seg) => '/' + seg.slice(0, 4) + '…');
}

// 改成后台 spawn：有缓存先给缓存，旧了就后台刷新；头一回才等。
// MCP 状态：房间会话真正挂的是 config.MCP_CONFIG（--strict-mcp-config），所以列表以这份配置为准；
// 每个服务连没连上，取最近一次 Claude 会话启动时 init 事件里报的状态（还没起过会话就是"未知"）。
// 不用 `claude mcp list`：它列的是这台机器全局的 MCP，和房间实际用的不是一回事。
const MCP_STATUS = new Map();   // name → { status, at }
function noteMcpStatus(list) {
  if (!Array.isArray(list)) return;
  for (const s of list) if (s && s.name) MCP_STATUS.set(String(s.name), { status: String(s.status || ''), at: Date.now() });
}
async function listMcpServers() {
  let conf = {};
  try { conf = JSON.parse(readFileSync(config.MCP_CONFIG, 'utf8')); } catch { return { ok: true, servers: [], raw: '', error: null, note: '还没有 MCP 配置文件，在这里添加一个服务就会创建' }; }
  const servers = Object.entries(conf.mcpServers || {}).map(([name, s]) => {
    const st = MCP_STATUS.get(name)?.status || '';
    const status = /connected|ready|running/i.test(st) ? 'connected' : /fail|error|needs-auth|disconnected/i.test(st) ? 'error' : 'unknown';
    const where = maskSecrets(String(s.url || [s.command, ...(s.args || [])].filter(Boolean).join(' ') || ''));
    return { name, status, detail: st ? `${where}${status === 'connected' ? '' : ' · ' + st}` : `${where} · 还没有会话连过` };
  });
  return { ok: true, servers, raw: '', error: null };
}


// --- Long-running Claude process manager (one instance per room / per group member) ---

class ClaudeProcess {
  // opts: { key, label, getSession, setSession, permissionMode, getPermissionMode, autoDenyPermissions }
  constructor(opts) {
    this.key = opts.key;
    this.label = opts.label || opts.key;
    this.getSession = opts.getSession;
    this.setSession = opts.setSession;
    this.permissionMode = opts.permissionMode || defaultPermissionMode();
    this.getPermissionMode = opts.getPermissionMode || null;
    // 群聊成员：没人盯着审批，等审批会把整轮群聊卡死——直接拒绝并说明
    this.autoDenyPermissions = Boolean(opts.autoDenyPermissions);
    this.proc = null;
    this.sessionId = this.getSession();
    this.busy = false;
    this.queue = [];
    this.currentRes = null;
    this.currentId = null;
    this.currentHeartbeat = null;
    this.idleTimer = null;
    this.buf = '';
    this.model = DEFAULT_MODEL;
    this.effort = 'high';
    this.currentHadDelta = false;
    this.currentReply = '';
    this.currentThinking = '';
    this.currentPersist = true;
    this.currentRoomId = 'home';
    this.currentChannel = DEFAULT_CHANNEL;
    this.currentAuthor = null;
    this.currentAuthorTitle = null;
    this.currentSpeaker = null;
    this.currentEndOnResult = true;
    this.currentResolve = null;
    this.activeToolIds = [];
    this.currentTools = [];
    this.eventClients = new Set();
    this.pendingPermissions = new Map();
    this.resumeSessionId = this.sessionId;
    this.recentSessions = [];
    this.startedAt = Date.now();
    this.contextTokens = 0;
    this.contextPercent = 0;
    { const u = readUsage()[this.key];                              // 网关重启后接着显示上一轮的用量（同一个会话才算）
      if (u && u.session_id && u.session_id === this.sessionId) { this.contextTokens = u.tokens || 0; this.contextPercent = u.percent || 0; } }
    this.forging = false;
    this.forgeProbation = null;
    this.controlInitialized = false;
    this.controlInitId = null;
    this.pendingUserPayload = null;
    this.currentSentLen = 0;       // currentReply 里已经推给前端的长度（假用户轮扣留用）
    this.currentFakeCut = false;   // 这一轮已经撞见假用户轮，之后的正文全丢
    this.currentOrphan = false;    // busy=false 时 CLI 自发的一轮（后台任务通知等），独立成条
    this.lastPersistCtx = null;    // 上一条要落盘的轮次在哪个房间/通道——自发轮照着它落
    this.inflight = null;          // 已写进（或待写进）stdin、还没拿到 result 的那条消息
    this.switching = false;        // 切模型/通道：旧进程在关，新消息先排队，别插到前面
  }

  _saveSessionId() {
    try { this.setSession(this.sessionId); } catch {}
  }

  isAlive() {
    return this.proc && this.proc.exitCode === null && this.proc.signalCode === null;
  }

  _spawn() {
    const args = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--include-partial-messages',
      '--thinking-display', 'summarized',
      '--verbose',
      '--permission-mode', this.permissionMode,
      '--permission-prompt-tool', 'stdio',
      '--model', this.model,
    ];
    if (CLI_SUPPORTS_EFFORT) args.push('--effort', this.effort);
    if (this.resumeSessionId) args.push('--resume', this.resumeSessionId);
    if (existsSync(config.MCP_CONFIG)) args.push('--strict-mcp-config', '--mcp-config', config.MCP_CONFIG);
    console.log(`[spawn:${this.key}] ${this.resumeSessionId ? `resume ${this.resumeSessionId}` : 'fresh session'} model=${this.model}`);
    // Keep the 1M context window, but leave compaction under the user's control.
    // DISABLE_AUTO_COMPACT does not disable the manual /compact command.
    const claudeEnv = { ...process.env };
    delete claudeEnv.CLAUDE_CODE_DISABLE_1M_CONTEXT;
    delete claudeEnv.DISABLE_COMPACT;
    delete claudeEnv.CLAUDE_CODE_AUTO_COMPACT_WINDOW;
    delete claudeEnv.ANTHROPIC_API_KEY;
    if (this.billing === 'api') {
      const key = anthropicApiKey();
      if (key) { claudeEnv.ANTHROPIC_API_KEY = key; console.log(`[spawn:${this.key}] billing=api`); }
      else console.log(`[spawn:${this.key}] billing=api 但没有 key，退回订阅`);
    }
    claudeEnv.PERIGEE_GATEWAY = '1';   // 让你自己的 hooks 能认出这是网关开的会话
    this.proc = spawn(CLAUDE, args, { cwd: CWD, stdio: ['pipe', 'pipe', 'pipe'], env: claudeEnv });
    this.buf = '';

    this.proc.stdout.setEncoding('utf8');
    this.proc.stdout.on('data', chunk => this._onStdout(chunk));

    this.proc.stderr.setEncoding('utf8');
    this.proc.stderr.on('data', chunk => {
      console.log(`[stderr:${this.key}]`, chunk.trim());
      if (chunk.includes('No conversation found')) {
        if (this.forgeProbation && this.resumeSessionId === this.forgeProbation.newSid) {
          this._forgeRollback('No conversation found');
          return;
        }
        console.log(`[stderr:${this.key}] session expired, clearing session_id`);
        this.sessionId = null;
        this.needLedger = true;   // 下一句话给新会话补一段账本，别让新的我两眼一抹黑
        this._saveSessionId();
        this.proc.kill('SIGKILL');
      }
    });

    this.proc.on('close', (code, signal) => {
      console.log(`[close:${this.key}] code=${code} signal=${signal}`);
      this.proc = null;
      // forge 试用期内异常退出且从未收到 init（resumeSessionId 仍指着新剪的会话）= resume 失败
      if (this.forgeProbation && this.resumeSessionId === this.forgeProbation.newSid && code !== 0 && !signal) {
        this._forgeRollback('exit code ' + code);
      }
      // Every future process must resume the same conversation. Without this,
      // an idle/model/MCP restart silently creates a fresh session and the
      // Terminal appears detached from Chat even though both share this class.
      if (this.sessionId) this.resumeSessionId = this.sessionId;
      this._finishTurn(null, true);
      this.controlInitialized = false;
      this.controlInitId = null;
      this.pendingUserPayload = null;
      if (this.pendingPermissions.size) {
        for (const requestId of this.pendingPermissions.keys()) this.broadcast({ type: 'permission_cancelled', request_id: requestId });
        this.pendingPermissions.clear();
      }
      this.switching = false;
      this._processQueue();
    });

    // Match the Agent SDK bidirectional control protocol. Without this
    // initialize handshake the CLI does not route can_use_tool requests to
    // `stdio`, so a remote UI can never render an approval prompt.
    this.controlInitialized = false;
    this.controlInitId = `init-${randomUUID().slice(0, 8)}`;
    this.proc.stdin.write(JSON.stringify({
      type: 'control_request',
      request_id: this.controlInitId,
      request: { subtype: 'initialize', hooks: null },
    }) + '\n');

    this._resetIdleTimer();
  }

  _onStdout(chunk) {
    this.buf += chunk;
    const lines = this.buf.split('\n');
    this.buf = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      let ev;
      try { ev = JSON.parse(t); } catch { continue; }
      this._handleEvent(ev);
    }
  }

  // Ends the current turn: persists, notifies group waiter, optionally closes
  // the HTTP stream (a group fan-out keeps one response open across members).
  _finishTurn(usage, aborted) {
    if (this.currentHeartbeat) { clearInterval(this.currentHeartbeat); this.currentHeartbeat = null; }
    this.inflight = null;
    this._flushText();
    this.currentReply = cutFakeUser(this.currentReply);
    // The [挂断] marker is a control signal for the call UI, not prose — keep it out of the archive.
    this.currentReply = this.currentReply.replace(/\s*\[挂断\]\s*$/, '');
    if (this.currentOrphan) {
      // 自发轮：只回了 [[静默]] 或什么都没说的，不进聊天
      if (/\[\[静默\]\]/.test(this.currentReply) || !this.currentReply.trim()) this.currentPersist = false;
      console.log(`[orphan:${this.key}] 自发轮结束 ${this.currentPersist ? '独立落一条' : '静默丢弃'}（${this.currentReply.length} 字）`);
      this.currentOrphan = false;
    }
    if (this.currentWakeStrip) {
      const silent = /\[\[静默\]\]/.test(this.currentReply) || !this.currentReply.trim();
      if (silent) { this.currentPersist = false; console.log(`[wake:${this.key}] 静默，不进聊天：${this.currentWakeStrip.slice(0, 40)}`); }
      else {
        try {
          const record = appendHistory({ role: 'system', kind: 'wake', text: this.currentWakeStrip, room_id: this.currentRoomId });
          this.broadcast({ type: 'wake_strip', text: this.currentWakeStrip, ts: record.ts, room_id: this.currentRoomId });
        } catch (error) { console.error(`[history:${this.key}] wake strip append failed:`, error.message); }
      }
      this.currentWakeStrip = null;
    }
    if (this.currentPersist && (this.currentReply || this.currentThinking)) {
      try {
        appendHistory({
          role: 'assistant', text: this.currentReply, thinking: this.currentThinking,
          tools: this.currentTools.map(t => ({ name: t.name, ok: t.ok })),
          room_id: this.currentRoomId, channel: this.currentChannel, author: this.currentAuthor, author_title: this.currentAuthorTitle,
        });
      } catch (error) { console.error(`[history:${this.key}] assistant append failed:`, error.message); }
      if (!this.currentNoBark) pushBark(this.currentReply, this.currentRoomId);
      this.currentPersist = false;
    }
    if (this.currentQuiet) { this.currentQuiet = false; console.log(`[keepalive:${this.key}] 续上了缓存`); }
    if (this.currentRes && this.currentEndOnResult) {
      this.currentRes.write('data: [DONE]\n\n');
      this.currentRes.end();
    }
    this.currentRes = null;
    const resolve = this.currentResolve;
    this.currentResolve = null;
    this.busy = false;
    if (resolve) resolve({ reply: this.currentReply, thinking: this.currentThinking, aborted: Boolean(aborted) });
  }

  _handleEvent(ev) {
    this.lastEventAt = Date.now();
    this.broadcast({ type: 'cli_event', event: ev.type, subtype: ev.subtype || ev.event?.type || null });
    if (ev.type === 'control_response' && ev.response?.request_id === this.controlInitId) {
      if (ev.response.subtype === 'success') {
        this.controlInitialized = true;
        console.log(`[control:${this.key}] initialized`);
        this.broadcast({ type: 'control_ready' });
        if (this.pendingUserPayload && this.isAlive()) {
          this.proc.stdin.write(JSON.stringify(this.pendingUserPayload) + '\n');
          this.pendingUserPayload = null;
        }
      } else {
        console.error(`[control:${this.key}] initialization failed:`, ev.response.error || 'unknown error');
        this.broadcast({ type: 'control_error', message: ev.response.error || '权限控制初始化失败' });
      }
      return;
    }
    if (ev.type === 'rate_limit_event') { noteRateLimit(ev.rate_limit_info); return; }
    if (ev.type === 'system' && ev.subtype === 'init') noteMcpStatus(ev.mcp_servers);
    if (ev.type === 'system' && ev.subtype === 'init' && ev.session_id) {
      if (this.forgeProbation) {
        console.log(`[forge:${this.key}] 新会话验活通过 (${ev.session_id})`);
        this.forgeProbation = null;
      }
      this.sessionId = ev.session_id;
      this.resumeSessionId = null;
      this._saveSessionId();
      this.recentSessions = [ev.session_id, ...this.recentSessions.filter(id => id !== ev.session_id)].slice(0, 12);
      console.log(`[init:${this.key}] session_id:`, this.sessionId);
    }

    const fromSubagent = isSubagentEvent(ev);
    // 不拼进上一轮已落盘的回复，另起一条独立的；落在上一条落盘轮次的房间里，只回 [[静默]]/空的就丢。
    if (!this.busy && !this.currentOrphan && !fromSubagent
        && (ev.type === 'stream_event' || ev.type === 'content_block_delta' || ev.type === 'assistant' || ev.type === 'result')) {
      this._startOrphanTurn();
    }

    const emitDelta = delta => {
      if (delta?.type === 'text_delta' && delta.text) {
        this.currentHadDelta = true;
        this._appendText(delta.text);
      } else if (delta?.type === 'thinking_delta' && delta.thinking) {
        this.currentThinking += delta.thinking;
        this._sendSSE({ reasoning_content: delta.thinking });
        this.broadcast({ type: 'thinking_delta', text: delta.thinking });
      }
    };
    if (!fromSubagent) {
      if (ev.type === 'content_block_delta') emitDelta(ev.delta);
      if (ev.type === 'stream_event' && ev.event?.type === 'content_block_delta') emitDelta(ev.event.delta);
    }

    const startEvent = fromSubagent ? null : ev.type === 'content_block_start' ? ev : (ev.type === 'stream_event' && ev.event?.type === 'content_block_start' ? ev.event : null);
    if (startEvent) {
      const block = startEvent.content_block;
      if (block?.type === 'tool_use') {
        this.activeToolIds.push(block.id || `tool-${Date.now()}`);
        if (this.currentTools.length < 100) this.currentTools.push({ id: block.id || null, name: String(block.name || 'tool'), ok: true });
        if (this.currentRes) this._sendSSE({ tool_use: { id: block.id || null, name: block.name || 'tool', status: 'start' } });
        this.broadcast({ type: 'tool_start', id: block.id || null, name: block.name || 'tool', input: block.input || null });
      }
    }

    const stopEvent = fromSubagent ? null : ev.type === 'content_block_stop' ? ev : (ev.type === 'stream_event' && ev.event?.type === 'content_block_stop' ? ev.event : null);
    if (stopEvent && this.activeToolIds.length) {
      const toolId = this.activeToolIds.pop();
      if (this.currentRes) this._sendSSE({ tool_use_done: { id: toolId } });
      this.broadcast({ type: 'tool_done', id: toolId });
    }

    if (!fromSubagent && ev.type === 'user' && Array.isArray(ev.message?.content)) {
      for (const b of ev.message.content) {
        if (b?.type !== 'tool_result' || !b.is_error) continue;
        const t = this.currentTools.find(x => x.id && x.id === b.tool_use_id);
        if (t) t.ok = false;
      }
    }

    if (ev.type === 'control_request' && ev.request?.subtype === 'can_use_tool') {
      const request = { request_id: ev.request_id, tool_name: ev.request.tool_name || 'tool', input: ev.request.input || {}, description: ev.request.description || '', permission_suggestions: ev.request.permission_suggestions || [], tool_use_id: ev.request.tool_use_id || null, title: ev.request.title || '', display_name: ev.request.display_name || '' };
      if (this.autoDenyPermissions && this.permissionMode !== 'bypassPermissions' && this.isAlive()) {
        this.proc.stdin.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: ev.request_id, response: { behavior: 'deny', message: '群聊里没法审批工具调用；需要用工具请到单聊房间里做，或把这个房间的权限模式改成全放行。' } } }) + '\n');
      } else {
        this.pendingPermissions.set(ev.request_id, request);
        this.broadcast({ type: 'permission_request', request });
      }
    }

    if (ev.type === 'control_cancel_request' && ev.request_id) {
      this.pendingPermissions.delete(ev.request_id);
      this.broadcast({ type: 'permission_cancelled', request_id: ev.request_id });
    }

    // API/rate-limit messages can arrive as a complete assistant event with
    // no content_block_delta. Forward it once so the UI shows the real cause.
    if (ev.type === 'assistant' && !fromSubagent && !this.currentHadDelta) {
      const blocks = Array.isArray(ev.message?.content) ? ev.message.content : [];
      const text = blocks.filter(block => block.type === 'text').map(block => block.text || '').join('');
      if (text) { this.currentHadDelta = true; this._appendText(text); }
    }

    // result 事件里的 usage 是这一轮所有调用的累加——一轮里调 N 次工具，整份上下文就被重复算 N 遍，
    // （子代理的 usage 是它自己那份小上下文，不算主窗水位）
    if (ev.type === 'assistant' && !fromSubagent && ev.message?.usage) this.lastCallUsage = ev.message.usage;

    if (ev.type === 'result') {
      const usage = this.lastCallUsage || ev.usage || {};
      this.lastCallUsage = null;
      this.contextTokens = (usage.input_tokens || 0)
        + (usage.cache_read_input_tokens || 0)
        + (usage.cache_creation_input_tokens || 0)
        + (usage.output_tokens || 0);
      this.contextPercent = Math.min(100, Math.round(this.contextTokens / CONTEXT_WINDOW_TOKENS * 1000) / 10);
      writeUsage(this.key, { tokens: this.contextTokens, percent: this.contextPercent, session_id: ev.session_id || this.sessionId, at: Date.now() });
      this.broadcast({
        type: 'usage',
        context_tokens: this.contextTokens,
        context_window_tokens: CONTEXT_WINDOW_TOKENS,
        context_percent: this.contextPercent,
      });
      if (config.FORGE_ENABLED && this.contextPercent >= config.FORGE_SOFT_PCT && !this.forging) {
        setTimeout(() => this._maybeAutoForge().catch(e => console.error('[forge] ' + e.message)), 5000);
      }
      if (ev.session_id) {
        this.sessionId = ev.session_id;
        this._saveSessionId();
      }
      if (!this.currentHadDelta && ev.result) {
        this.currentHadDelta = true;
        this._appendText(String(ev.result));
      }
      this._flushText();
      if (this.currentRes) this._sendSSE({ }, 'stop', ev.usage);
      this._finishTurn(ev.usage, false);
      this.broadcast({ type: 'turn_done', session_id: this.sessionId });
      this._resetIdleTimer();
      this._processQueue();
    }
  }

  addEventClient(res) {
    this.eventClients.add(res);
    res.write(`data: ${JSON.stringify({ type: 'connected', session_id: this.sessionId, pending: [...this.pendingPermissions.values()] })}\n\n`);
  }

  removeEventClient(res) { this.eventClients.delete(res); }

  broadcast(event) {
    // 保活那一轮（quiet）只为续缓存：不转播到终端页，权限类事件照常
    if (this.currentQuiet && /^(user_message|assistant_delta|thinking_delta|tool_start|tool_done|turn_done|cli_event)$/.test(event.type)) return;
    const packet = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of [...this.eventClients]) {
      try { client.write(packet); } catch { this.eventClients.delete(client); }
    }
  }

  answerPermission(requestId, behavior) {
    const pending = this.pendingPermissions.get(requestId);
    if (!pending) return { ok: false, status: 404, message: '审批请求已失效或不存在' };
    if (!this.isAlive()) return { ok: false, status: 409, message: 'Claude 进程已断开' };
    const response = behavior === 'allow' ? { behavior: 'allow', updatedInput: pending.input || {} } : { behavior: 'deny', message: 'Denied by user from Perigee' };
    this.proc.stdin.write(JSON.stringify({ type: 'control_response', response: { subtype: 'success', request_id: requestId, response } }) + '\n');
    this.pendingPermissions.delete(requestId);
    this.broadcast({ type: 'permission_resolved', request_id: requestId, behavior });
    return { ok: true, request_id: requestId, behavior };
  }

  _appendText(text) {
    if (this.currentFakeCut || !text) return;
    this.currentReply += text;
    const cut = cutFakeUser(this.currentReply);
    if (cut.length < this.currentReply.length) {
      console.log(`[fake-user:${this.key}] 截掉幻写的用户轮（${this.currentReply.length - cut.length} 字）`);
      this.currentReply = cut;
      this.currentFakeCut = true;
    }
    this._releaseText(this.currentFakeCut ? this.currentReply.length : safeTextLen(this.currentReply));
  }

  _flushText() { this._releaseText(cutFakeUser(this.currentReply).length); }

  _releaseText(upto) {
    if (upto <= this.currentSentLen) return;
    const chunk = this.currentReply.slice(this.currentSentLen, upto);
    this.currentSentLen = upto;
    this._sendSSE({ content: chunk });
    this.broadcast({ type: 'assistant_delta', text: chunk });
  }

  // busy=false 时 CLI 自发的一轮：清空累加器，独立成条（落在上一条落盘轮次的房间）
  _startOrphanTurn() {
    console.log(`[orphan:${this.key}] busy=false 时 CLI 自发了一轮，单独处理`);
    this.currentOrphan = true;
    this.currentRes = null;
    this.currentResolve = null;
    this.currentHadDelta = false;
    this.currentReply = '';
    this.currentThinking = '';
    this.currentSentLen = 0;
    this.currentFakeCut = false;
    this.currentQuiet = false;
    this.currentWakeStrip = null;
    this.activeToolIds = [];
    this.currentTools = [];
    const last = this.lastPersistCtx;
    this.currentPersist = Boolean(last);
    if (last) {
      this.currentRoomId = last.roomId;
      this.currentChannel = last.channel;
      this.currentAuthor = last.author;
      this.currentAuthorTitle = last.authorTitle;
      this.currentNoBark = last.noBark;
    }
  }

  // 自发轮卡住（两分钟没任何事件）就不等了：把它当结束，放排队的消息走
  _watchOrphan() {
    if (this._orphanWatch) return;
    this._orphanWatch = setTimeout(() => {
      this._orphanWatch = null;
      if (this.currentOrphan && !this.busy) {
        if (Date.now() - (this.lastEventAt || 0) < 120_000) return this._watchOrphan();
        console.log(`[orphan:${this.key}] 自发轮两分钟没动静，按结束处理`);
        this._finishTurn(null, true);
      }
      if (!this.busy && !this.switching && !this.currentOrphan) this._processQueue();
    }, 30_000);
    this._orphanWatch.unref?.();
  }

  _sendSSE(deltaFields, finishReason, usage) {
    if (!this.currentRes) return;
    const obj = {
      id: this.currentId,
      object: 'chat.completion.chunk',
      model: this.model,
      effort: this.effort,
      cli_supports_effort: CLI_SUPPORTS_EFFORT,
      ...(this.currentSpeaker ? { speaker: this.currentSpeaker } : {}),
      choices: [{ index: 0, delta: deltaFields, finish_reason: finishReason || null }],
    };
    if (usage) {
      obj.usage = {
        prompt_tokens: (usage.input_tokens || 0)
          + (usage.cache_read_input_tokens || 0)
          + (usage.cache_creation_input_tokens || 0),
        completion_tokens: usage.output_tokens || 0,
        context_tokens: this.contextTokens,
        context_window_tokens: CONTEXT_WINDOW_TOKENS,
        context_percent: this.contextPercent,
      };
    }
    this.currentRes.write(`data: ${JSON.stringify(obj)}\n\n`);
  }

  _resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      if (this.isAlive() && !this.busy) {
        console.log(`[idle:${this.key}] 30min idle, killing process (session_id preserved)`);
        this.proc.kill('SIGTERM');
      }
    }, IDLE_TIMEOUT_MS);
  }

  // ctx: { res, model, effort, persist, roomId, author, authorTitle, speaker,
  //        endOnResult (default true), resolve, headersSent, timeInjected }
  send(contentArray, ctx) {
    const id = `chatcmpl-${randomUUID().slice(0, 8)}`;
    let model = ctx.model;
    let effort = ctx.effort;
    if (!ALLOWED_MODELS.has(model) || !ALLOWED_EFFORTS.has(effort)) {
      const room = ctx.roomId ? getRoom(ctx.roomId) : null;
      if (!ALLOWED_MODELS.has(model)) {
        const roomModel = room?.channel_models?.[DEFAULT_CHANNEL] || room?.model;
        model = ALLOWED_MODELS.has(roomModel) ? roomModel : DEFAULT_MODEL;
      }
      if (!ALLOWED_EFFORTS.has(effort)) effort = ALLOWED_EFFORTS.has(room?.effort) ? room.effort : 'high';
    }

    // CLI 正在自发一轮（currentOrphan）时也先排队：等它的 result 再发，免得两轮的字和 result 串在一起
    if (this.busy || this.switching || this.currentOrphan || (this.forging && !ctx.forgeHandoff)) {
      console.log(`[queue:${this.key}] request queued${this.forging ? ' (forging)' : this.switching ? ' (switching)' : this.currentOrphan ? ' (orphan turn)' : ''}`);
      this.queue.push({ contentArray, ctx });
      if (this.currentOrphan && !this.busy) this._watchOrphan();
      return;
    }

    // 唤醒、保活这类入口不带通道：跟房间设定走；连房间都查不到就保持现状，免得一个保活把我切回去
    const chan = ctx.channel || (ctx.roomId ? getRoom(ctx.roomId)?.channel : null);
    const billing = chan ? (chan === 'claude-api' ? 'api' : 'sub') : (this.billing || 'sub');
    const wantPerm = (() => { const m = this.getPermissionMode?.(); return PERMISSION_MODES.has(m) ? m : this.permissionMode; })();
    if (this.isAlive() && (this.model !== model || this.billing !== billing || this.permissionMode !== wantPerm || (CLI_SUPPORTS_EFFORT && this.effort !== effort))) {
      console.log(`[process:${this.key}] switching ${this.model}/${this.effort} -> ${model}/${effort}`);
      this.queue.unshift({ contentArray, ctx });
      this.switching = true;   // close 事件里复位并 _processQueue
      const old = this.proc;
      old.kill('SIGTERM');
      setTimeout(() => { if (old.exitCode === null && old.signalCode === null) old.kill('SIGKILL'); }, 15_000).unref?.();
      return;
    }

    this.busy = true;
    this.permissionMode = wantPerm;
    this.model = model;
    this.billing = billing;
    this.effort = effort;
    if (!this.isAlive()) this._spawn();

    this.currentRes = (ctx.res && (ctx.res.destroyed || ctx.res.writableEnded)) ? null : ctx.res;
    this.currentId = id;
    this.currentHadDelta = false;
    this.currentReply = '';
    this.currentThinking = '';
    this.currentSentLen = 0;
    this.currentFakeCut = false;
    this.currentOrphan = false;
    this.inflight = { contentArray, ctx };
    this.currentPersist = ctx.persist !== false;
    this.currentNoBark = ctx.noBark === true;
    this.currentQuiet = ctx.quiet === true;
    this.lastSendAt = Date.now();
    this.currentWakeStrip = ctx.wake ? (ctx.wakeStrip || '【唤醒】') : null;
    this.currentRoomId = String(ctx.roomId || 'home');
    this.currentChannel = CHANNEL_IDS.has(ctx.channel) ? ctx.channel : DEFAULT_CHANNEL;
    this.currentAuthor = ctx.author || null;
    this.currentAuthorTitle = ctx.authorTitle || null;
    this.currentSpeaker = ctx.speaker || null;
    this.currentEndOnResult = ctx.endOnResult !== false;
    this.currentResolve = ctx.resolve || null;
    if (this.currentPersist) this.lastPersistCtx = { roomId: this.currentRoomId, channel: this.currentChannel, author: this.currentAuthor, authorTitle: this.currentAuthorTitle, noBark: this.currentNoBark };
    this.activeToolIds = [];
    this.currentTools = [];
    const visibleText = contentArray.filter(block => block.type === 'text').map(block => block.text || '').join('\n');
    this.broadcast({ type: 'user_message', text: visibleText, source: ctx.wake ? 'wake' : ctx.persist === false ? 'terminal' : 'chat' });
    this._resetIdleTimer();

    if (!ctx.headersSent) {
      ctx.res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      ctx.headersSent = true;
    }
    this._sendSSE({ role: 'assistant' });
    this.currentHeartbeat = setInterval(() => {
      if (this.currentRes) this.currentRes.write(': heartbeat\n\n');
    }, HEARTBEAT_MS);

    const timeContext = new Intl.DateTimeFormat('zh-CN', {
      timeZone: config.TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'long', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(new Date());
    const rhythmNote = (this.currentPersist && this.currentRoomId === 'home' && !ctx.wake) ? popFingertipsNote() : '';
    const stickers = stickerNote();
    const contentWithTime = ctx.timeInjected ? [...contentArray] : [   // 拷一份：下面会 unshift，别改到原数组（重放时会叠两遍）
      { type: 'text', text: `[当前时间上下文] 现在是 ${timeContext}（${config.TZ}）。` },
      ...(config.HOME_API_DOC ? [{ type: 'text', text: `[工具速查] 图库/记账/日记/语音等家里工具的用法在 ${config.HOME_API_DOC}——要用的时候先读它，不要凭记忆猜接口。` }] : []),
      ...(ctx.roomId && getRoom(ctx.roomId)?.note ? [{ type: 'text', text: `[房间须知]\n${getRoom(ctx.roomId).note}` }] : []),
      ...(rhythmNote ? [{ type: 'text', text: `[指尖的语气——TA 打这条消息的节奏，供你感受，不要复述数字]\n${rhythmNote}` }] : []),
      ...(!CLI_SUPPORTS_EFFORT ? [{ type: 'text', text: `[思考力度: ${effort}]` }] : []),
      ...(stickers ? [{ type: 'text', text: stickers }] : []),
      { type: 'text', text: '当你想让对方做选择时，在回复末尾使用格式：[choices: "问题内容"]\n- A: 选项一\n- B: 选项二\n[/choices]\n不要每次都用，只在真的需要对方选择时使用。\n想正式约对方一起做件事（看月亮、听歌、散步、打游戏…）时，可以在回复里单独放一行邀请卡：[invite: 标题 | 时间 | 一句话]（时间、一句话可省），对方那边会出现一张小卡片，点"接受/拒绝"会回你【接受邀请】或【婉拒邀请】开头的话。别滥用，真想约才发。\n对方也会给你发邀请卡（对方的消息就是一行 [invite: 标题 | 时间 | 一句话]）：回复第一行必须写【接受邀请】标题 或【婉拒邀请】标题（标题原样照抄，卡片靠这行盖章），第二行起再正常说话。\n想推一首歌，可以单独写一行 [song:歌名|歌手]，对方那边是一张歌曲卡片。' },
      ...contentArray,
    ];
    // 会话丢了（No conversation found）以后的第一句：从聊天记录里取这个房间最近的对话垫在前面
    // （学 aru-host 的 ledger replay；breath 管长期记忆，这段只管"刚才说到哪了"）
    if (this.needLedger && this.currentPersist && this.key.startsWith('room:')) {
      this.needLedger = false;
      try {
        const rows = readAllHistory().filter(r => String(r.room_id || 'home') === this.currentRoomId && (r.role === 'user' || r.role === 'assistant'));
        if (rows.length && rows[rows.length - 1].role === 'user' && String(rows[rows.length - 1].text || '').trim() === visibleText.trim()) rows.pop();
        const lines = [];
        let total = 0;
        for (const r of rows.slice(-40).reverse()) {
          const who = r.role === 'user' ? config.USER_NAME : (r.author_title || '我');
          const body = String(r.text || '').replace(/\s+/g, ' ').slice(0, 300);
          const line = `[${String(r.ts || '').slice(5, 16).replace('T', ' ')}] ${who}：${body}`;
          if (total + line.length > 6000) break;
          lines.unshift(line); total += line.length;
        }
        if (lines.length) contentWithTime.unshift({ type: 'text', text: `[会话重建] 原来的会话找不到了，这是新开的会话。下面是聊天记录里这个房间最近的对话，不是对方刚发的新消息，不要复述，接着往下聊就好。\n${lines.join('\n')}` });
      } catch (e) { console.log(`[ledger:${this.key}] skipped:`, e.message); }
    }
    // 每轮固定附言（config.TURN_NOTE，可空），比如"这一轮的思考请用简体中文"
    if (!this.currentQuiet && config.TURN_NOTE) contentWithTime.unshift({ type: 'text', text: config.TURN_NOTE });
    const userPayload = {
      type: 'user',
      message: { role: 'user', content: contentWithTime },
    };
    if (this.controlInitialized) this.proc.stdin.write(JSON.stringify(userPayload) + '\n');
    else this.pendingUserPayload = userPayload;

    ctx.res.on('close', () => {
      if (this.currentRes === ctx.res) {
        if (this.currentHeartbeat) { clearInterval(this.currentHeartbeat); this.currentHeartbeat = null; }
        this.currentRes = null;
      }
    });
  }

  sendAwait(contentArray, ctx) {
    return new Promise(resolve => {
      this.send(contentArray, { ...ctx, endOnResult: false, resolve });
    });
  }

  interrupt() {
    if (!this.isAlive() || !this.busy) return false;
    console.log(`[interrupt:${this.key}] killing process (session_id preserved)`);
    this.proc.kill('SIGKILL');
    return true;
  }

  status() {
    return {
      ok: true,
      key: this.key,
      alive: this.isAlive(),
      busy: this.busy,
      model: this.model,
      context_window_tokens: CONTEXT_WINDOW_TOKENS,
      auto_compact: false,
      manual_compact: true,
      context_tokens: this.contextTokens,
      context_percent: this.contextPercent,
      effort: this.effort,
      cli_supports_effort: CLI_SUPPORTS_EFFORT,
      session_id: this.sessionId,
      resume_session_id: this.resumeSessionId,
      shared_session: true,
      permission_control: this.controlInitialized ? 'ready' : (this.isAlive() ? 'initializing' : 'offline'),
      pending_permissions: this.pendingPermissions.size,
      sessions: this.recentSessions,
      queued: this.queue.length,
      uptime_ms: Date.now() - this.startedAt,
      rate_limit: RATE_LIMIT,
    };
  }

  async _maybeAutoForge(manual = false) {
    if (!config.FORGE_ENABLED) return { ok: false, message: '自动换窗没开（设置 › Claude 会话）' };
    if (this.forging) return { ok: false, message: '已在过隧道中' };
    if (!manual && this.contextPercent < config.FORGE_SOFT_PCT) return { ok: false, message: '水位未到 ' + config.FORGE_SOFT_PCT + '%' };
    if (!this.sessionId) return { ok: false, message: '当前没有会话' };
    if (this.busy || this.queue.length) {
      if (!manual) setTimeout(() => this._maybeAutoForge().catch(() => {}), 60_000);
      return { ok: false, message: '会话忙，稍后自动重试' };
    }
    this.forging = true;
    try { require('fs').mkdirSync(FORGE_DIR, { recursive: true }); } catch {}   // 交接包要写在这里
    const oldSid = this.sessionId;
    const t0 = Date.now();
    console.log(`[forge:${this.key}] 过隧道启动 session=${oldSid} pct=${this.contextPercent}${manual ? ' (手动)' : ''}`);
    try {
      const stubRes = { write() {}, end() {}, on() {} };
      const handoff = this.sendAwait(
        [{ type: 'text', text: FORGE_HANDOFF_PROMPT }],
        { res: stubRes, headersSent: true, persist: false, roomId: 'home', forgeHandoff: true }
      );
      await Promise.race([handoff, new Promise((_, rej) => setTimeout(() => rej(new Error('交接超时(15min)')), 900_000))]);
      const st = statSync(FORGE_HANDOFF_FILE);
      if (st.mtimeMs < t0) throw new Error('handoff.md 没有更新——硬门槛，中止');
      // 备份旧 jsonl（军规第一条）
      const jsonl = FORGE_PROJ_DIR + '/' + oldSid + '.jsonl';
      spawnSync('cp', [jsonl, jsonl + '.bak-forge-' + Math.floor(t0 / 1000)]);
      // 万一有已写入未回的，放回队列头，切到新进程后重放）
      this._requeueInflight();
      if (this.isAlive()) this.proc.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 2000));
      // 剪切 + 注入交接包
      const forgeArgs = [config.FORGE_SCRIPT, oldSid, '--retain', String(config.FORGE_RETAIN), '--inject', FORGE_HANDOFF_FILE];
      if (config.FORGE_SQUASH > 0) forgeArgs.push('--squash-tools', String(config.FORGE_SQUASH));
      const run = spawnSync('node', forgeArgs, { cwd: CWD, encoding: 'utf8', timeout: 180_000 });
      if (run.status !== 0) throw new Error('forge-reload 失败: ' + String(run.stderr || run.stdout).slice(-300));
      console.log('[forge] ' + String(run.stdout).trim().split('\n').slice(-5).join(' | '));
      // 新 id 以 forge_history 为准
      const hist = JSON.parse(readFileSync(FORGE_HISTORY_FILE, 'utf-8'));
      const last = hist[hist.length - 1];
      if (!last || last.old_sid !== oldSid || !last.new_sid) throw new Error('forge_history 未记录本次剪切');
      this.switchSession(last.new_sid);
      // 试用期：下一次 spawn 若 resume 不动这份新 jsonl（进程异常退出/找不到会话），
      // 自动回滚旧会话——旧 jsonl 从不删除，last-good 永远在。init 事件到达即验活通过。
      this.forgeProbation = { oldSid, newSid: last.new_sid };
      this.broadcast({ type: 'forge', old_session: oldSid, new_session: last.new_sid, retain: config.FORGE_RETAIN });
      console.log(`[forge:${this.key}] 过隧道完成 ${oldSid} -> ${last.new_sid}（试用期开启，失败自动回滚）`);
      return { ok: true, old_session: oldSid, new_session: last.new_sid };
    } catch (e) {
      console.error(`[forge:${this.key}] 过隧道失败: ${e.message}（旧会话不受影响，继续可用）`);
      return { ok: false, message: e.message };
    } finally {
      this.forging = false;
      setImmediate(() => this._processQueue());
    }
  }

  // 把它从当前轮摘下来：close 时的 _finishTurn 不落半截、不结束它的 res、不 resolve——重放那一轮接着用。
  _requeueInflight() {
    if (!this.busy || !this.inflight) return;
    const it = this.inflight;
    this.inflight = null;
    console.log(`[queue:${this.key}] kill 前有未回完的消息，放回队列头重放`);
    if (this.currentHeartbeat) { clearInterval(this.currentHeartbeat); this.currentHeartbeat = null; }
    this.currentPersist = false;
    this.currentWakeStrip = null;
    this.currentRes = null;
    this.currentResolve = null;
    this.queue.unshift({ contentArray: it.contentArray, ctx: { ...it.ctx, headersSent: true } });
  }

  newSession() {
    this._requeueInflight();
    this.sessionId = null;
    this.resumeSessionId = null;
    this._saveSessionId();
    if (this.isAlive()) this.proc.kill('SIGKILL');
    return { ok: true, message: '已准备新会话' };
  }

  // forge 验活失败时回滚到旧会话（旧 jsonl 一直保留，随时可续）
  _forgeRollback(reason) {
    const p = this.forgeProbation;
    if (!p) return;
    this.forgeProbation = null;
    console.error(`[forge:${this.key}] 新会话验活失败（${reason}），回滚 ${p.newSid} -> ${p.oldSid}`);
    this.switchSession(p.oldSid);
    this.broadcast({ type: 'forge_rollback', bad_session: p.newSid, restored_session: p.oldSid, reason });
  }

  switchSession(sessionId) {
    if (!sessionId || typeof sessionId !== 'string') throw new Error('缺少 session_id');
    this._requeueInflight();
    this.contextTokens = 0;
    this.contextPercent = 0;
    this.sessionId = sessionId;
    this.resumeSessionId = sessionId;
    this._saveSessionId();
    if (this.isAlive()) this.proc.kill('SIGKILL');
    return { ok: true, session_id: sessionId, message: '将在下一条指令恢复此会话' };
  }

  reconnectMcp() {
    if (this.busy) return { ok: false, busy: true, message: 'Claude 正在回复，暂时不能重连 MCP' };
    this.resumeSessionId = this.sessionId;
    if (this.isAlive()) this.proc.kill('SIGTERM');
    return { ok: true, session_id: this.sessionId, message: 'MCP 将在下一条消息时重新连接，并继续当前会话' };
  }

  shutdown() {
    this.queue = [];
    if (this.idleTimer) clearTimeout(this.idleTimer);
    if (this.isAlive()) this.proc.kill('SIGTERM');
  }

  _processQueue() {
    if (this.forging || this.busy || this.switching || this.currentOrphan) return;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      this.send(next.contentArray, next.ctx);
    }
  }
}

// --- Process registry ---

const procs = new Map();

function sessionHooksForRoom(room) {
  return {
    getSession: () => (getRoom(room.id) || {}).session_id || null,
    setSession: id => {
      const current = getRoom(room.id);
      if (current) { current.session_id = id; writeRooms(roomsData); }
      // Legacy mirror so older tooling that reads state.json keeps working.
      if (room.id === 'home') { try { writeFileSync(STATE_FILE, JSON.stringify({ session_id: id })); } catch {} }
    },
  };
}

function sessionHooksForGroupMember(group, member) {
  return {
    getSession: () => {
      const current = getRoom(group.id);
      return current && current.member_sessions ? current.member_sessions[member.id] || null : null;
    },
    setSession: id => {
      const current = getRoom(group.id);
      if (current) {
        if (!current.member_sessions) current.member_sessions = {};
        current.member_sessions[member.id] = id;
        writeRooms(roomsData);
      }
    },
  };
}

// Claude 官方 API 的 key：设置页存的优先，没有就用环境变量 PERIGEE_ANTHROPIC_API_KEY
const PROVIDER_SETTINGS_PATH = `${config.DATA_DIR}/provider-settings.json`;
function anthropicApiKey() {
  try {
    const saved = JSON.parse(readFileSync(PROVIDER_SETTINGS_PATH, 'utf8'));
    if (saved?.anthropic && String(saved.anthropic.apiKey || '').trim()) return String(saved.anthropic.apiKey).trim();
  } catch {}
  return config.ANTHROPIC_API_KEY;
}

function procForRoom(room) {
  const key = `room:${room.id}`;
  if (!procs.has(key)) {
    procs.set(key, new ClaudeProcess({ key, label: room.title, getPermissionMode: () => getRoom(room.id)?.permission_mode, ...sessionHooksForRoom(room) }));
  }
  return procs.get(key);
}

// 备忘桥的运输段：把一句话静默送进房间的会话。persist:false = 我的回应
//   唤醒这件事本身落一条 system 小条（kind:wake，前端画成浅色小字条，不是气泡）；
//   我醒来这一轮正常落聊天记录、正常显示、正常推 Bark。注入的原文不落记录，小条只写 strip。
function bridgeInject(text, roomId = 'home', opts = {}) {
  const room = getRoom(roomId);
  if (!room || room.type === 'group') throw new Error('这个房间不通桥');
  const stub = { write() {}, end() {}, on() {} };
  const wake = opts.mode === 'wake';
  const strip = wake ? String(opts.strip || text.split('\n')[0] || '【唤醒】').replace(/\s+/g, ' ').trim().slice(0, 120) : null;
  const body = wake ? text + '\n\n（只是"知道了"、不用跟对方说的，就只回 [[静默]] 这四个字——这一轮不会出现在聊天里。真做了事、想说，再正常回。）' : text;
  procForRoom(room)
    .sendAwait([{ type: 'text', text: body }], { res: stub, headersSent: true, persist: wake, wake, wakeStrip: strip, roomId: room.id, noBark: opts.bark === false })
    .catch(e => console.error('[bridge] ' + e.message));
}

// 群聊成员沿用它单聊房间的权限模式；不是全放行时，工具审批一律自动拒绝（见 autoDenyPermissions）
// 群聊扇出时没人盯着单个成员的审批弹窗，挂着不答会卡死整轮。
function procForGroupMember(group, member) {
  const key = `group:${group.id}:${member.id}`;
  if (!procs.has(key)) {
    procs.set(key, new ClaudeProcess({ key, label: `${group.title}·${member.title}`, getPermissionMode: () => getRoom(member.id)?.permission_mode, autoDenyPermissions: true, ...sessionHooksForGroupMember(group, member) }));
  }
  return procs.get(key);
}

function dropRoomProcs(roomId) {
  for (const [key, proc] of [...procs.entries()]) {
    if (key === `room:${roomId}` || key.startsWith(`group:${roomId}:`) || key.endsWith(`:${roomId}`)) {
      proc.shutdown();
      procs.delete(key);
    }
  }
}
// 拆分接线：RATE_LIMIT 会被重新赋值，别的文件经这个函数读当前值（直接导出的是拷贝）
function getRateLimit() { return RATE_LIMIT; }


// 缓存一小时不用就过期，回来第一句要把三四十万 token 整段重写。闲满 50 分钟，悄悄发一个"·"续上。
function startKeepalive(roomId = 'home') {
  // 设置里「缓存保活」分钟数（0 = 关）每轮现读，改了不用重启
  setInterval(() => {
    const minutes = Number(config.KEEPALIVE_MINUTES) || 0;
    if (minutes <= 0) return;
    const room = getRoom(roomId);
    const proc = room && procs.get(`room:${room.id}`);
    if (!proc || proc.busy || !proc.sessionId || !proc.lastSendAt) return;
    if (Date.now() - proc.lastSendAt < minutes * 60 * 1000) return;
    const stub = { write() {}, end() {}, on() {} };
    proc.sendAwait([{ type: 'text', text: '【缓存保活】这是网关的定时保活，不是对方说的话，也不用做任何事。只回一个字符：·' }],
      { res: stub, headersSent: true, persist: false, noBark: true, quiet: true, roomId: room.id })
      .catch(e => console.error('[keepalive] ' + e.message));
  }, 60 * 1000).unref?.();
}

module.exports = {
  init,
  CLAUDE,
  getRateLimit,
  noteRateLimit,
  HEARTBEAT_MS,
  listMcpServers,
  ClaudeProcess,
  procs,
  sessionHooksForRoom,
  sessionHooksForGroupMember,
  procForRoom,
  bridgeInject,
  startKeepalive,
  procForGroupMember,
  dropRoomProcs,
};

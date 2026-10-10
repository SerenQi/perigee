// lib/config.js —— Perigee 网关的全部配置项，都从环境变量读（见 gateway/.env.example）。
// 本文件不读 .env 文件本身：用 systemd 的 EnvironmentFile、`node --env-file=.env server.js`（Node 20.6+）或任何你习惯的方式注入。
const path = require('path');
const os = require('os');

const env = (k, d = '') => (process.env[k] ?? '').toString().trim() || d;
const num = (k, d) => { const v = Number(process.env[k]); return Number.isFinite(v) && String(process.env[k] ?? '').trim() !== '' ? v : d; };
const bool = (k, d = false) => { const v = String(process.env[k] ?? '').trim().toLowerCase(); return v ? ['1', 'true', 'yes', 'on'].includes(v) : d; };

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.resolve(env('PERIGEE_DATA_DIR', path.join(ROOT, 'data')));

// 设置页存的服务器设置（DATA_DIR/settings.json，600 权限）。下面带 ☆ 的项：设置页填了就用它，没填才退回环境变量/默认值。
const fs = require('fs');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
let _cache = { at: -1, data: {} };
function readSettings() {
  let mtime = 0;
  try { mtime = fs.statSync(SETTINGS_FILE).mtimeMs; } catch { return (_cache = { at: 0, data: {} }).data; }
  if (mtime !== _cache.at) {
    try { _cache = { at: mtime, data: JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {} }; } catch { _cache = { at: mtime, data: {} }; }
  }
  return _cache.data;
}
function writeSettings(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = SETTINGS_FILE + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, SETTINGS_FILE);
  try { fs.chmodSync(SETTINGS_FILE, 0o600); } catch {}
  _cache = { at: -1, data: {} };
}
const pick = (section, key) => { const v = readSettings()?.[section]?.[key]; return v === undefined || v === null || v === '' ? undefined : v; };

const config = {
  ROOT,
  DATA_DIR,
  SETTINGS_FILE,
  readSettings,
  writeSettings,
  HOST: env('PERIGEE_HOST', '127.0.0.1'),
  PORT: num('PERIGEE_PORT', 3003),


  // Claude Code CLI 与工作目录
  CLAUDE_BIN: env('CLAUDE_BIN', 'claude'),
  CLAUDE_CWD: path.resolve(env('CLAUDE_CWD', os.homedir())),
  // 给每个 Claude 会话挂的 MCP 配置（claude --mcp-config 的 JSON），MCP 页面也读写它
  MCP_CONFIG: path.resolve(env('PERIGEE_MCP_CONFIG', path.join(DATA_DIR, 'mcp.json'))),
  // Claude Code 的项目状态文件（MCP 停用列表在这里）
  CLAUDE_JSON: path.resolve(env('CLAUDE_JSON', path.join(os.homedir(), '.claude.json'))),


  // Codex CLI（可选）
  CODEX_BIN: env('CODEX_BIN', 'codex'),
  CODEX_CWD: path.resolve(env('CODEX_CWD', os.homedir())),

  // API 通道的 key：设置页里填的优先；这里是没填时的兜底
  ANTHROPIC_API_KEY: env('PERIGEE_ANTHROPIC_API_KEY'),
  OPENROUTER_API_KEY: env('PERIGEE_OPENROUTER_API_KEY'),
  DEEPSEEK_API_KEY: env('PERIGEE_DEEPSEEK_API_KEY'),
  OPENAI_API_KEY: env('PERIGEE_OPENAI_API_KEY'),
  // 前端的公网地址（OpenRouter 的 HTTP-Referer、推送里的跳转链接用），可空
  PUBLIC_URL: env('PERIGEE_PUBLIC_URL', ''),
  // 浏览器访问网关的路径前缀（要和前端 VITE_API_BASE 一致）；网关生成的图片链接会带上它
  API_PUBLIC_BASE: env('PERIGEE_API_PUBLIC_BASE', '/api').replace(/\/+$/, ''),

  // Bark 推送（iOS）：填完整的 https://你的bark服务/你的设备key ，空 = 不推
  BARK_URL: env('BARK_URL', '').replace(/\/+$/, ''),

  // 语音
  EDGE_TTS_BIN: env('EDGE_TTS_BIN', 'edge-tts'),
  MOSI_API_KEY: env('MOSI_API_KEY'),
  ELEVENLABS_API_KEY: env('ELEVENLABS_API_KEY'),
  // 语音转文字：一个接收原始音频字节、返回 {text} 的 HTTP 服务（比如自建 faster-whisper），空 = 关
  ASR_URL: env('PERIGEE_ASR_URL', ''),

  // mousecrew 群聊后端（可选）：合并转发群聊记录时去它那里取
  MOUSECREW_URL: env('MOUSECREW_URL', '').replace(/\/+$/, ''),
  MOUSECREW_TOKEN: env('MOUSECREW_TOKEN', ''),

  // 自动换窗（forge）：交接包和滚动摘要写在 FORGE_DIR；剪切脚本默认用仓库附带的 tools/forge-reload/forge-reload.js。开关和阈值在设置里
  FORGE_DIR: path.resolve(env('FORGE_DIR', path.join(DATA_DIR, 'forge'))),
  FORGE_SCRIPT: path.resolve(env('FORGE_SCRIPT', path.join(ROOT, 'tools', 'forge-reload', 'forge-reload.js'))),
};

// ☆ 设置页可改的项：getter，每次读都看一眼 settings.json（按 mtime 缓存）
const live = {
  USER_NAME: () => pick('general', 'userName') ?? env('PERIGEE_USER_NAME', '用户'),
  AI_NAME: () => pick('general', 'aiName') ?? env('PERIGEE_AI_NAME', 'Claude'),
  TZ: () => {
    const tz = pick('general', 'tz') ?? env('PERIGEE_TZ', Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz; } catch { return 'UTC'; }
  },
  TURN_NOTE: () => pick('general', 'turnNote') ?? env('PERIGEE_TURN_NOTE', ''),
  HOME_API_DOC: () => pick('general', 'homeApiDoc') ?? env('PERIGEE_HOME_API_DOC', ''),
  PERMISSION_MODE: () => pick('session', 'permissionMode') ?? env('PERIGEE_PERMISSION_MODE', 'default'),
  FORGE_ENABLED: () => { const v = pick('session', 'forgeEnabled'); return v === undefined ? bool('FORGE_ENABLED', false) : Boolean(v); },
  FORGE_SOFT_PCT: () => Number(pick('session', 'forgeSoftPct') ?? num('FORGE_SOFT_PCT', 80)),
  FORGE_RETAIN: () => Number(pick('session', 'forgeRetain') ?? num('FORGE_RETAIN', 100_000)),
  FORGE_SQUASH: () => Number(pick('session', 'forgeSquash') ?? num('FORGE_SQUASH', 4000)),
  SIDE_MODEL: () => pick('session', 'sideModel') ?? env('PERIGEE_SIDE_MODEL', 'claude-sonnet-5'),
  KEEPALIVE_MINUTES: () => Number(pick('session', 'keepaliveMinutes') ?? num('KEEPALIVE_MINUTES', 0)),
  BARK_PUSH: () => { const v = pick('bark', 'push'); return v === undefined ? process.env.BARK_PUSH !== '0' : Boolean(v); },
};
for (const [k, get] of Object.entries(live)) Object.defineProperty(config, k, { get, enumerable: true });

module.exports = config;

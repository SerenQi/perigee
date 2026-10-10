// lib/avatars.js —— 头像（用户 / 每个房间的 AI / 群聊成员）。图片存在 DATA_DIR/avatars/，不进仓库。
// key 约定：user（我，全局默认）· room:<房间id>（这个房间的 AI）· room:<房间id>:user（我在这个房间里换的头像）
//           group:user（我在群聊里的头像）· crew:<成员id>（群聊成员）
// 前端上传前已压成小图；这里再卡一道：只收 png/jpeg/webp，解码后 ≤ 512KB。
const { readFileSync, writeFileSync, mkdirSync, unlinkSync, existsSync, statSync, createReadStream } = require('fs');
const config = require('./config');
const { json } = require('./util');

const DIR = `${config.DATA_DIR}/avatars`;
const INDEX = `${DIR}/index.json`;
const MAX = 512 * 1024;
const EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };
const MIME = Object.fromEntries(Object.entries(EXT).map(([m, e]) => [e, m]));
const KEY_RE = /^(user|group:user|room:[A-Za-z0-9_-]{1,40}(:user)?|crew:[A-Za-z0-9_.-]{1,60})$/;

const load = () => { try { return JSON.parse(readFileSync(INDEX, 'utf8')) || {}; } catch { return {}; } };
const save = idx => { mkdirSync(DIR, { recursive: true }); writeFileSync(INDEX, JSON.stringify(idx, null, 1)); };
const fileOf = key => key.replace(/:/g, '__');

/** { key: url }，url 带版本号，换了图浏览器不会用旧缓存 */
function list() {
  const out = {};
  for (const [key, v] of Object.entries(load())) out[key] = `${config.API_PUBLIC_BASE}/avatars/file/${v.file}?v=${v.v}`;
  return out;
}

function put(key, dataUrl) {
  if (!KEY_RE.test(key)) throw Object.assign(new Error('头像位置不对'), { status: 400 });
  const m = String(dataUrl || '').match(/^data:(image\/(?:png|jpeg|webp));base64,(.+)$/s);
  if (!m) throw Object.assign(new Error('只收 png / jpeg / webp'), { status: 400 });
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > MAX) throw Object.assign(new Error('图片太大了（压缩后要小于 512KB）'), { status: 400 });
  const idx = load();
  if (idx[key]) try { unlinkSync(`${DIR}/${idx[key].file}`); } catch {}
  const file = `${fileOf(key)}.${EXT[m[1]]}`;
  mkdirSync(DIR, { recursive: true });
  writeFileSync(`${DIR}/${file}`, buf);
  idx[key] = { file, v: Date.now().toString(36) };
  save(idx);
  return list();
}

function del(key) {
  const idx = load();
  if (idx[key]) { try { unlinkSync(`${DIR}/${idx[key].file}`); } catch {} delete idx[key]; save(idx); }
  return list();
}

function serve(res, name) {
  const m = String(name).match(/^([A-Za-z0-9_.-]+)\.(png|jpg|webp)$/);
  const path = m ? `${DIR}/${m[0]}` : null;
  if (!path || !existsSync(path)) return json(res, 404, { error: { message: 'not found' } });
  res.writeHead(200, { 'Content-Type': MIME[m[2]], 'Content-Length': statSync(path).size, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  require('stream').pipeline(createReadStream(path), res, () => {});
}

module.exports = { list, put, del, serve };

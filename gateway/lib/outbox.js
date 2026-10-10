// Claude 在聊天里做好的文件放进 OUTBOX_DIR，回复里写 [[file:文件名]]，前端出一张文件卡。
// 跟相册一样放在网页根目录外，只能经过网关拿到（建议反向代理上加登录）。
const { mkdirSync, realpathSync, statSync, openSync, fstatSync, closeSync, createReadStream } = require('fs');
const { dirname } = require('path');
const { pipeline } = require('stream');
const { json } = require('./util');
const config = require('./config');

const OUTBOX_DIR = `${config.DATA_DIR}/outbox`;
try { mkdirSync(OUTBOX_DIR, { recursive: true }); } catch {}
let OUTBOX_REAL = OUTBOX_DIR;
try { OUTBOX_REAL = realpathSync(OUTBOX_DIR); } catch {}

// 只有这些类型允许在浏览器里直接打开；其余一律当下载（octet-stream + attachment），
// html/svg 这类能跑脚本的东西绝不在家门里内联渲染。
const INLINE = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg', m4a: 'audio/mp4', wav: 'audio/wav', mp4: 'video/mp4',
  txt: 'text/plain; charset=utf-8', md: 'text/plain; charset=utf-8',
  csv: 'text/plain; charset=utf-8', json: 'text/plain; charset=utf-8',
};

function resolveOutbox(name) {
  const base = String(name || '');
  if (!base || base.length > 160 || base.startsWith('.') || /[\/\\\0]/.test(base)) return null;
  let real;
  try { real = realpathSync(`${OUTBOX_DIR}/${base}`); } catch { return null; }
  if (dirname(real) !== OUTBOX_REAL) return null; // 符号链接指到箱子外面的，不认
  let st;
  try { st = statSync(real); } catch { return null; }
  return st.isFile() ? { base, real, size: st.size } : null;
}

function serveOutboxFile(res, name, download, headOnly) {
  const hit = resolveOutbox(name);
  if (!hit) return json(res, 404, { error: { message: '发件箱里没有这个文件' } });
  const ext = (hit.base.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
  const inline = !download && INLINE[ext];
  // 先真的打开：读不了的（权限、刚被删）当场回 404，而不是等流报错把整个网关带倒
  let fd, size;
  try {
    fd = openSync(hit.real, 'r');
    const st = fstatSync(fd);
    if (!st.isFile()) throw new Error('not a file');
    size = st.size;
  } catch {
    if (fd !== undefined) try { closeSync(fd); } catch {}
    return json(res, 404, { error: { message: '发件箱里没有这个文件' } });
  }
  const ascii = hit.base.replace(/[^\x20-\x7e]|["\\]/g, '_');
  const headers = {
    'Content-Type': inline || 'application/octet-stream',
    'Content-Length': size,
    'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(hit.base)}`,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-cache',
  };
  // 图片/音频/视频是纯媒体、不会执行脚本——sandbox 会把直接打开的媒体页判成无源(opaque origin)，
  // 'self' 永远匹配不上导致播不出来。sandbox 只留给文本类。
  const MEDIA = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'mp3', 'm4a', 'wav', 'mp4']);
  if (MEDIA.has(ext)) headers['Content-Security-Policy'] = "default-src 'none'; img-src 'self'; media-src 'self'";
  else if (ext !== 'pdf') headers['Content-Security-Policy'] = "sandbox; default-src 'none'";
  res.writeHead(200, headers);
  if (headOnly) { try { closeSync(fd); } catch {} return res.end(); }
  // pipeline：任一头出错或对方中途断开，另一头一起收掉，不漏文件句柄
  pipeline(createReadStream(null, { fd }), res, () => {});
}

module.exports = { OUTBOX_DIR, serveOutboxFile };

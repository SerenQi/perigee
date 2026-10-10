// lib/reminders.js —— 待办 / 计划表的到点提醒（网关内置，每分钟扫一遍）。
// 条目带 due（前端存的本地时间 YYYY-MM-DDTHH:MM，按设置里的时区解读）、没做完、还没提醒过 → Bark 推一条，标 notified。
// 条目勾了"也告诉 Claude"（share）→ 到点经备忘桥静默递进主房间一次，状态记在 bridge 字段；错过 10 分钟以上不补发。
// 没配 Bark 就只走备忘桥；都没有就什么也不做。
const config = require('./config');

const COLS = ['todos', 'plans'];
const STALE_MIN = 10;

function tzOffsetMs(date, tz) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }).formatToParts(date);
  const g = t => Number(p.find(x => x.type === t)?.value || 0);
  return Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second')) - Math.floor(date.getTime() / 1000) * 1000;
}
/** "2026-01-02T08:30"（没有时区）按 config.TZ 解读成时间戳；自带时区的照原样 */
function parseDue(due) {
  const s = String(due || '').trim();
  if (!s) return NaN;
  if (/[zZ]|[+-]\d\d:?\d\d$/.test(s)) return Date.parse(s);
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
  if (!m) return NaN;
  const asUTC = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 9), +(m[5] || 0));
  return asUTC - tzOffsetMs(new Date(asUTC), config.TZ);
}

function start({ readCol, colPatch, bridgeInject, pushBarkRaw }) {
  const hm = () => new Intl.DateTimeFormat('zh-CN', { timeZone: config.TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const sweep = () => {
    const now = Date.now();
    for (const col of COLS) {
      let items = [];
      try { items = readCol(col); } catch { continue; }
      for (const item of items) {
        if (item.done || !item.due) continue;
        const when = parseDue(item.due);
        if (!Number.isFinite(when) || when > now) continue;
        const text = String(item.text || '').trim().slice(0, 80);
        const late = Math.floor((now - when) / 60000);
        if (item.share && !item.bridge) {
          let state;
          if (late > STALE_MIN) state = { state: 'skipped_stale', at: hm(), reason: `错过时间超过${STALE_MIN}分钟，不补发` };
          else {
            try {
              bridgeInject(`【备忘桥】${config.USER_NAME}设的共享备忘到点了：「${text}」。看情况提醒或关心一句。不用特意回这条。`);
              state = { state: 'sent', at: hm() };
            } catch (e) { state = { state: 'failed', at: hm(), reason: String(e.message).slice(0, 120) }; }
          }
          try { colPatch(col, item.id, { bridge: state }); } catch {}
        }
        if (!item.notified) {
          const sent = pushBarkRaw(`${config.AI_NAME} · 到点了`, text + (late < 6 ? '' : `（${late} 分钟前的事）`));
          if (sent) try { colPatch(col, item.id, { notified: true }); } catch {}
        }
      }
    }
  };
  setInterval(sweep, 60 * 1000).unref?.();
  setTimeout(sweep, 15 * 1000).unref?.();
}

module.exports = { start, parseDue };

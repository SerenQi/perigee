import { aiAvatarFor, useAvatars } from '../../lib/avatars'
import { userAvatar, groupAvatar, getIdentity } from '../../lib/identity'
import { motion } from 'framer-motion'
import type { Room } from '../../lib/api'
import { ANNIVERSARY, calculateDaysTogether } from '../../lib/anniversary'
import { longPress } from '../../shell/RoomActions'
import { IconChevron } from '../../shell/icons'


function stamp(ts?: string) {
  if (!ts) return ''
  const d = new Date(ts)
  if (isNaN(+d)) return ''
  const now = new Date()
  if (d.toDateString() === now.toDateString())
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

function Face({ r, size = 46 }: { r: Room; size?: number }) {
  useAvatars()
  if (r.type === 'direct')
    return <img src={aiAvatarFor(r.id, r.title)} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
  if (r.type === 'group')
    return <img src={groupAvatar()} alt="" style={{ width: size, height: size }} className="shrink-0 rounded-full object-cover" />
  const label = r.type === 'group' ? '群' : (r.title?.[0] ?? '?')
  return (
    <span style={{ width: size, height: size, fontSize: size * 0.36 }}
      className="grid shrink-0 place-items-center rounded-full bg-white font-medium text-[color:var(--color-ink)]">{label}</span>
  )
}

function dayMath(now = new Date()) {
  const y0 = new Date(now.getFullYear(), 0, 1)
  const doy = Math.floor((+now - +y0) / 86400000) + 1
  const yearLen = new Date(now.getFullYear(), 1, 29).getMonth() === 1 ? 366 : 365
  const monLen = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const t = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7))
  const week = Math.ceil(((+t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)
  return { doy, week, year: doy / yearLen, mon: now.getDate() / monLen }
}

const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const rise = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 },
  transition: { delay: 0.045 * i, type: 'spring' as const, stiffness: 300, damping: 30 } })

export default function LoopChatList({ rooms, onMenu, onEnter, onCreate, onEdit }: {
  rooms: Room[]; onMenu: () => void; onEnter: (id: string, title: string) => void
  onCreate: () => void; onEdit: (r: Room) => void
}) {
  const now = new Date()
  const m = dayMath(now)
  const together = calculateDaysTogether(ANNIVERSARY.startDate, now)
  const recent = [...rooms].filter((r) => r.last_ts && r.last_text).sort((a, b) => +new Date(b.last_ts!) - +new Date(a.last_ts!))
  const latest = recent[0]

  return (
    <div className="absolute inset-0 overflow-y-auto pb-[180px]">
      {/* 右上：名字 + 头像 */}
      <div className="flex items-center justify-end gap-2.5 px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="text-[14px] font-semibold tracking-[.02em]">{ANNIVERSARY.usName}</span>
        <button onClick={onMenu} aria-label="世界" className="loop-ring-thin rounded-full p-[3px]">
          <img src={userAvatar()} alt="" className="h-[34px] w-[34px] rounded-full object-cover" />
        </button>
      </div>

      <motion.div {...rise(0)} className="px-5 pt-3">
        <h1 className="text-[36px] font-bold leading-none tracking-tight" style={{ fontFamily: 'var(--font-sans)' }}>Chats</h1>
        <p className="ml-0.5 mt-1.5 text-[11.5px] font-medium">Your rooms ({rooms.length})</p>
      </motion.div>

      {/* 一排头像圈，最前面一张叠放的方卡 */}
      <motion.div {...rise(1)} className="flex items-center gap-2.5 overflow-x-auto px-5 pb-1 pt-3">
        <span className="relative mr-1 h-[58px] w-[52px] shrink-0">
          <span className="absolute left-[5px] top-0 h-[52px] w-[46px] rounded-[10px] bg-[#c9c9cc]" />
          <span className="absolute left-0 top-[4px] grid h-[52px] w-[46px] place-items-center rounded-[10px] bg-gradient-to-br from-[#5a5a5e] to-[#1c1c1f] text-[11px] italic text-white/80"
                style={{ fontFamily: 'ScriptEn, serif' }}>us</span>
          {ANNIVERSARY.startDate && <span className="absolute bottom-0 left-[9px] rounded-full bg-[#2a2a2d] px-1.5 text-[8.5px] leading-[14px] text-white">{together}+</span>}
        </span>
        {rooms.map((r) => (
          <motion.button key={r.id} whileTap={{ scale: 0.9 }} onClick={() => onEnter(r.id, r.title)}
            {...longPress(() => onEdit(r))} aria-label={r.title}
            className="loop-ring-thick shrink-0 rounded-full p-[4px]">
            <Face r={r} size={50} />
          </motion.button>
        ))}
      </motion.div>

      {/* 时间轴 + 日期（不装卡） */}
      <motion.section {...rise(2)} className="mt-6 grid grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-4 px-5">
        <ol className="relative flex min-w-0 flex-col gap-3.5 pl-5 text-[11.5px]">
          <span className="absolute bottom-3 left-[4px] top-2 border-l border-dashed border-[var(--color-ink-3)]" />
          {recent.slice(1, 2).map((r) => (
            <li key={r.id} className="relative truncate text-[color:var(--color-ink-3)] line-through decoration-[var(--color-ink-4)]">
              <span className="absolute -left-5 top-[3px] h-[9px] w-[9px] rounded-full bg-[#111]" />{r.last_text}</li>
          ))}
          {latest && (
            <li className="relative truncate font-medium"><span className="absolute -left-5 top-[3px] h-[9px] w-[9px] rounded-full bg-[#111]" />{latest.last_text}</li>
          )}
          <li className="relative truncate text-[color:var(--color-ink-3)]">
            <span className="absolute -left-5 top-[3px] h-[9px] w-[9px] rounded-full border border-[var(--color-ink-3)] bg-white" />{ANNIVERSARY.startDate ? `${getIdentity().usName} · 第 ${together} 天` : getIdentity().usName}</li>
        </ol>
        <div>
          <div className="flex items-start gap-3">
            <b className="text-[26px] font-bold leading-none">{now.getDate()}</b>
            <span className="pt-0.5 text-[10.5px] leading-snug text-[color:var(--color-ink-2)]">{now.getMonth() + 1}月 · 周{WEEK[now.getDay()]}<br />
              <span className="text-[color:var(--color-ink-3)]">今天的日子也在走</span></span>
          </div>
          <p className="mt-3 text-[9px] tracking-[.2em] text-[color:var(--color-ink-3)]">WEEK {m.week} / DAY {m.doy}</p>
          {([['YEAR', m.year], ['MON', m.mon]] as const).map(([k, v]) => (
            <div key={k} className="mt-2 flex items-center gap-2 text-[8px] tracking-[.18em] text-[color:var(--color-ink-3)]">
              <span className="w-7">{k}</span>
              <span className="h-[2px] flex-1 bg-[#e3e3e5]">
                <motion.span initial={{ width: 0 }} animate={{ width: `${Math.round(v * 100)}%` }} transition={{ duration: 1.1, ease: [0.2, 0.8, 0.2, 1] }}
                  className="block h-full bg-[#111]" />
              </span>
            </div>
          ))}
        </div>
      </motion.section>

      {/* 房间：一行一行 */}
      <div className="mt-7 flex flex-col gap-1 px-4">
        {rooms.map((r, i) => (
          <motion.button key={r.id} {...rise(3 + i)} whileTap={{ scale: 0.98 }}
            onClick={() => onEnter(r.id, r.title)}
            {...longPress(() => onEdit(r))}
            className="loop-roomrow flex w-full items-center gap-3.5 rounded-[20px] px-1.5 py-2.5 text-left active:bg-black/[.03]">
            <span className="loop-ring-thin shrink-0 rounded-full p-[3px]"><Face r={r} size={48} /></span>
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="flex items-center gap-2">
                {r.id === 'home'
                  ? <span className="flex items-center gap-1 rounded-full bg-[#111] px-2 py-[1px] text-[9.5px] text-white"><span className="h-[5px] w-[5px] rounded-full bg-white" />Online</span>
                  : <span className="rounded-full border border-[var(--color-ink-4)] px-2 py-[0.5px] text-[9.5px] text-[color:var(--color-ink-2)]">{r.type === 'group' ? 'group' : r.agent === 'codex' ? 'codex' : 'room'}</span>}
                <b className="min-w-0 flex-1 truncate text-[14.5px] font-semibold">{r.title}</b>
                <span className="shrink-0 text-[10px] text-[color:var(--color-ink-4)]">{stamp(r.last_ts)}</span>
              </span>
              <span className="truncate text-[12px] text-[color:var(--color-ink-3)]">{r.last_text || '还没说过话'}</span>
            </span>
          </motion.button>
        ))}
        {rooms.length === 0 && <p className="py-8 text-center text-[13px] text-[color:var(--color-ink-3)]">加载中…</p>}
      </div>

      {/* 一排文字动作 */}
      <div className="mt-4 flex items-center justify-around px-4 text-[12.5px]">
        <button onClick={onCreate} className="flex items-center gap-1.5 text-[color:var(--color-ink-2)]"><span className="text-[15px] leading-none">＋</span>新建房间</button>
        <button onClick={onMenu} className="flex items-center gap-1.5 font-semibold"><span className="h-2 w-2 rounded-full border-[1.5px] border-[#111]" />去世界看看</button>
        <span className="text-[color:var(--color-ink-3)]">长按房间 · 改名 / 删除</span>
      </div>

      {/* 浮着的 New message 卡 */}
      {latest && (
        <motion.button initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, type: 'spring', stiffness: 260, damping: 26 }}
          onClick={() => onEnter(latest.id, latest.title)}
          className="loop-card fixed inset-x-4 bottom-[calc(max(0.6rem,env(safe-area-inset-bottom))+72px)] z-20 flex items-center gap-3 rounded-[26px] py-2.5 pl-2.5 pr-4 text-left">
          <Face r={latest} size={46} />
          <span className="min-w-0 flex-1">
            <b className="block text-[15px] font-semibold tracking-[.08em]">New message</b>
            <span className="block truncate text-[11.5px] text-[color:var(--color-ink-2)]">{latest.title}：{latest.last_text}</span>
          </span>
          <span className="text-[color:var(--color-ink-2)]"><IconChevron /></span>
        </motion.button>
      )}
    </div>
  )
}

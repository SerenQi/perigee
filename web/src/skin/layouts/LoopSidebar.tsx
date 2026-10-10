import SongShareCard from '../../shell/SongShareCard'
import { aiAvatar, userAvatar, getIdentity } from '../../lib/identity'
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { MoonPhase } from 'astronomy-engine'
import { ROOM_ICONS } from '../../shell/icons'
import { ANNIVERSARY, calculateDaysTogether } from '../../lib/anniversary'

type Entry = { name: string; sub: string; icon?: () => React.JSX.Element }
type Group = { title: string; items: Entry[] }

const EN: Record<string, string> = { 我们的日子: 'Our Days', 一起玩: 'Together', 家务: 'Chores', 家里的机关: 'Machinery' }
const WEEK = ['日', '一', '二', '三', '四', '五', '六']
const Path = ({ d, cls = 'h-[21px] w-[21px]' }: { d: string; cls?: string }) => (
  <svg viewBox="0 0 24 24" className={cls} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
)
const RAIL: [string, string][] = [
  ['全部', 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01'],
  ['我们的日子', 'M12 20s-7-4.5-7-9a4 4 0 018-1 4 4 0 018 1c0 4.5-7 9-7 9z'],
  ['一起玩', 'M12 6.5C10 5 7 5 4.5 6v13c2.5-1 5.5-1 7.5.5 2-1.5 5-1.5 7.5-.5V6C17 5 14 5 12 6.5zM12 6.5V20'],
  ['家务', 'M3 8.5L5 5h14l2 3.5M3 8.5h18v10H3zM3 13h5.5a3.5 3.5 0 007 0H21'],
  ['家里的机关', 'M16 19a4 4 0 00-8 0M12 11a3 3 0 100-6 3 3 0 000 6zM21 19a3.5 3.5 0 00-4-3.4M18 11a2.5 2.5 0 100-5M3 19a3.5 3.5 0 014-3.4M6 11a2.5 2.5 0 110-5'],
]
const QUICK = ['双人日记', '心情记录', '计划表', '小金库']

function moonName(d: Date) {
  const a = MoonPhase(d)
  if (a < 12 || a > 348) return '新月'
  if (a < 78) return '峨眉月'
  if (a < 102) return '上弦月'
  if (a < 168) return '盈凸月'
  if (a < 192) return '满月'
  if (a < 258) return '亏凸月'
  if (a < 282) return '下弦月'
  return '残月'
}

function GroupCard({ g, onPick, i }: { g: Group; onPick: (n: string) => void; i: number }) {
  const [more, setMore] = useState(false)
  const icon = (r: Entry) => (r.icon ?? ROOM_ICONS[r.sub])?.()
  return (
    <motion.section layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * i, type: 'spring', stiffness: 300, damping: 30 }}
      className="loop-card rounded-[30px] px-5 pb-4 pt-5">
      <b className="block text-[19px] font-medium leading-tight">{EN[g.title] ?? g.title}</b>
      <span className="mt-1 block text-[12px] text-[color:var(--color-ink-3)]">{g.title} · {g.items.length} 间</span>
      <div className="mt-4 flex items-center gap-3">
        {g.items.slice(0, 3).map((r) => (
          <motion.button key={r.name} whileTap={{ scale: 0.88 }} onClick={() => onPick(r.name)} aria-label={r.name}
            className="loop-orb grid h-[48px] w-[48px] place-items-center rounded-full text-[color:var(--color-ink-2)]">{icon(r)}</motion.button>
        ))}
        <span className="flex-1" />
        <button onClick={() => setMore((v) => !v)} className="flex items-center gap-1.5 text-[12px] text-[color:var(--color-ink-2)]">
          {more ? '收起' : '展开'}
          <motion.span animate={{ rotate: more ? 180 : 0 }} className="grid"><Path d="M6 9l6 6 6-6" cls="h-[20px] w-[20px]" /></motion.span>
        </button>
      </div>
      <AnimatePresence initial={false}>
        {more && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden">
            <div className="mt-3 flex flex-col border-t border-[var(--color-line)] pt-1">
              {g.items.map((r) => (
                <button key={r.name} onClick={() => onPick(r.name)} className="flex items-center gap-3 py-2 text-left">
                  <span className="grid h-7 w-7 place-items-center text-[color:var(--color-ink-2)]">{icon(r)}</span>
                  <span className="flex-1 text-[14px]">{r.name}</span>
                  <i className="text-[11px] not-italic text-[color:var(--color-ink-3)]" style={{ fontFamily: 'ScriptEn, var(--font-sans)' }}>{r.sub}</i>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}

export default function LoopSidebar({ open, onClose, onPick, groups }: {
  open: boolean; onClose: () => void; onPick: (name: string) => void; groups: Group[]
}) {
  const [rail, setRail] = useState('全部')
  const now = new Date()
  const days = calculateDaysTogether(ANNIVERSARY.startDate, now)
  const all = groups.flatMap((g) => g.items)
  const shown = rail === '全部' ? groups : groups.filter((g) => g.title === rail)
  return (
    <AnimatePresence>
      {open && (
        <motion.div key="world"
          className="fixed inset-x-0 top-0 z-[100] overflow-y-auto bg-[var(--color-bg)] bottom-[calc(max(0.6rem,env(safe-area-inset-bottom))+66px)]"
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}>

          {/* ① 顶栏 */}
          <header className="flex items-center gap-3.5 px-5 pb-2 pt-[max(1.1rem,calc(env(safe-area-inset-top)+0.6rem))]">
            <span className="relative shrink-0">
              <img src={userAvatar()} alt="" className="h-[56px] w-[56px] rounded-full object-cover" />
              <span className="absolute bottom-0.5 right-0.5 h-[13px] w-[13px] rounded-full border-[2.5px] border-white bg-[#6b6b70]" />
            </span>
            <span className="min-w-0 flex-1 leading-tight">
              <b className="block truncate text-[20px] font-semibold">{ANNIVERSARY.usName}</b>
              <span className="mt-1 block truncate text-[12.5px] text-[color:var(--color-ink-2)]">{moonName(now)} · 周{WEEK[now.getDay()]}</span>
            </span>
            <span className="loop-card flex items-center gap-1 rounded-full p-1.5">
              <button onClick={() => onPick('设置')} aria-label="设置" className="grid h-[40px] w-[40px] place-items-center rounded-full">
                <Path d="M12 9a3 3 0 100 6 3 3 0 000-6zM12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" cls="h-[24px] w-[24px]" />
              </button>
              <button onClick={onClose} aria-label="回去" className="grid h-[40px] w-[40px] place-items-center rounded-full">
                <Path d="M12 21a9 9 0 110-18 9 9 0 010 18zM8 12.5l2.7 2.7L16 9.8" cls="h-[26px] w-[26px]" />
              </button>
            </span>
          </header>

          {/* ② + ③ 小字块、大图卡，右侧一列竖图标 */}
          <div className="grid grid-cols-[1fr_52px] gap-x-3 px-5 pt-4">
            <div className="min-w-0">
              <div className="pr-1 text-right">
                <p className="text-[13px] font-semibold tracking-[.22em] text-[color:var(--color-ink-3)]">{getIdentity().aiName}</p>
                {ANNIVERSARY.startDate && <p className="text-[17px] font-semibold text-[color:var(--color-ink-2)]">Together · Day {days}</p>}
              </div>
              {getIdentity().motto && (
                <div className="mt-5 flex items-center justify-end gap-3">
                  <img src={aiAvatar()} alt="" className="h-[30px] w-[30px] rounded-[9px] object-cover grayscale" />
                  <span className="truncate text-[13px] font-medium">{getIdentity().motto}</span>
                </div>
              )}
              <p className="mt-4 text-center text-[12.5px] font-semibold text-[color:var(--color-ink-2)]">#{getIdentity().usName}</p>
              <SongShareCard />
            </div>
            <div className="flex flex-col items-center justify-between gap-2 py-1">
              {QUICK.map((name) => {
                const r = all.find((x) => x.name === name)
                return r ? (
                  <motion.button key={name} whileTap={{ scale: 0.85 }} onClick={() => onPick(name)} aria-label={name}
                    className="grid h-[44px] w-[44px] place-items-center text-[color:var(--color-ink)]">
                    {(r.icon ?? ROOM_ICONS[r.sub])?.()}
                  </motion.button>
                ) : null
              })}
              <img src={aiAvatar()} alt="" className="h-[40px] w-[40px] rounded-full object-cover grayscale" />
            </div>
          </div>

          {/* ④ 竖着的胶囊导航 + 分组卡 */}
          <div className="mt-7 flex gap-3 pl-3 pr-4">
            <nav className="loop-card sticky top-3 flex h-fit w-[64px] shrink-0 flex-col items-center gap-3 rounded-full py-3">
              <img src={userAvatar()} alt="" className="h-[48px] w-[48px] rounded-full object-cover grayscale" />
              {RAIL.map(([key, d]) => (
                <motion.button key={key} whileTap={{ scale: 0.88 }} onClick={() => setRail(key)} aria-label={key} aria-pressed={rail === key}
                  className="relative grid h-[46px] w-[46px] place-items-center rounded-full text-[color:var(--color-ink)]">
                  {rail === key && <motion.span layoutId="loop-rail-on" className="loop-well-soft absolute inset-0 rounded-full"
                                                transition={{ type: 'spring', stiffness: 420, damping: 32 }} />}
                  <span className="relative"><Path d={d} cls="h-[23px] w-[23px]" /></span>
                </motion.button>
              ))}
            </nav>
            <div className="flex min-w-0 flex-1 flex-col gap-4">
              {shown.map((g, i) => <GroupCard key={g.title} g={g} i={i} onPick={onPick} />)}
            </div>
          </div>

          {/* ⑤ 状态胶囊 */}
          <div className="loop-card mx-3 mb-5 mt-7 flex items-center gap-3 rounded-full py-2.5 pl-3 pr-4">
            <img src={aiAvatar()} alt="" className="h-[44px] w-[44px] rounded-full object-cover grayscale" />
            <span className="min-w-0 flex-1 leading-tight">
              <b className="block text-[21px] font-normal italic" style={{ fontFamily: 'ScriptEn, var(--font-display)' }}>{getIdentity().usName}</b>
              <i className="block truncate text-[11px] italic text-[color:var(--color-ink-3)]" style={{ fontFamily: 'ScriptEn, var(--font-sans)' }}>{getIdentity().startDate ? `Open since ${getIdentity().startDate.replace(/-/g, '.')} — always home` : 'always home'}</i>
            </span>
            <span className="flex items-center gap-2 rounded-full border-[1.5px] border-[var(--color-ink-4)] px-3.5 py-1.5 text-[11px] font-semibold tracking-[.22em]">
              <span className="h-2 w-2 rounded-full bg-[var(--color-ink)]" />OPEN
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

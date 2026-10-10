import { getIdentity } from '../lib/identity'
import { IconChevron, ROOM_ICONS } from './icons'
import { useSkin } from '../skin/useSkin'
import LoopSidebar from '../skin/layouts/LoopSidebar'

type Entry = { name: string; sub: string; icon?: () => React.JSX.Element }

const Gear = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
  </svg>
)
const Spark = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px]">
    <rect x="4" y="4" width="16" height="16" rx="3" /><path d="M12 8v8M8 12h8" />
  </svg>
)

const GROUPS: { title: string; items: Entry[] }[] = [
  { title: '我们的日子', items: [
    { name: '双人日记', sub: 'Diary' }, { name: '心情记录', sub: 'Mood' },
  ] },
  { title: '一起玩', items: [
    { name: '共读小屋', sub: 'Books' },
  ] },
  { title: '家务', items: [
    { name: '项目小屋', sub: 'Studio' }, { name: '计划表', sub: 'Plans' },
    { name: '图库', sub: 'Gallery' }, { name: '小金库', sub: 'Treasury' },
  ] },
  { title: '家里的机关', items: [
    { name: 'MCP 连接', sub: 'Servers' },
    { name: 'Skills', sub: 'Skills', icon: Spark },
    { name: '设置', sub: 'Settings', icon: Gear },
  ] },
]

export const ROOMS = GROUPS.flatMap((g) => g.items)

export default function Sidebar({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (name: string) => void }) {
  const skin = useSkin()
  if (skin === 'loop') return <LoopSidebar open={open} onClose={onClose} onPick={onPick} groups={GROUPS} />
  return (
    <>
      <div onClick={onClose}
        className={`fixed inset-0 z-[90] bg-black/25 backdrop-blur-[2px] transition-opacity duration-300
                    ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`} />
      <aside
        className={`fixed inset-y-0 left-0 z-[100] flex w-[292px] max-w-[80vw] flex-col bg-[var(--color-bg)]
                    shadow-[0_0_40px_rgba(0,0,0,.1)] transition-transform duration-[400ms]
                    ${open ? 'visible translate-x-0' : 'invisible -translate-x-[102%]'}`}>
        <header className="flex shrink-0 items-center justify-between px-4 pb-3 pt-[max(1.125rem,calc(env(safe-area-inset-top)+0.625rem))]">
          <h2 className="text-[length:var(--text-title)] font-bold tracking-[2px]">世界</h2>
          <button onClick={onClose}
            className="grid h-[38px] w-[38px] place-items-center rounded-full border border-[var(--color-line)]
                       bg-[var(--color-surface)] text-[15px] shadow-[var(--shadow-xs)]">✕</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {GROUPS.map((g) => (
            <section key={g.title} className="mb-4">
              <h3 className="mb-1.5 px-2 text-[10.5px] tracking-[2px] text-[color:var(--color-ink-3)]">{g.title}</h3>
              <div className="overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-surface)] shadow-[var(--shadow-xs)]">
                {g.items.map((r, i) => (
                  <button key={r.name} onClick={() => onPick(r.name)}
                    className="relative flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors active:bg-[var(--color-card)]">
                    {i > 0 && <span className="absolute left-[58px] right-0 top-0 h-px bg-[var(--color-line)]" />}
                    <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-[10px] bg-[var(--color-card)] text-[color:var(--color-ink-2)]">
                      {(r.icon ?? ROOM_ICONS[r.sub])?.()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] leading-tight">{r.name}</span>
                      <span className="block text-[10.5px] leading-tight text-[color:var(--color-ink-3)]">{r.sub}</span>
                    </span>
                    <span className="shrink-0 text-[color:var(--color-ink-4)]"><IconChevron /></span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </div>
        <footer className="shrink-0 border-t border-[var(--color-line)] px-5 py-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))]">
          <p className="text-center text-[10px] tracking-[1px] text-[color:var(--color-ink-3)]">{[getIdentity().usName, getIdentity().startDate.replace(/-/g, '.')].filter(Boolean).join(' · ')}</p>
        </footer>
      </aside>
    </>
  )
}

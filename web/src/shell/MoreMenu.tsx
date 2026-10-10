import { API_BASE } from '../lib/config'
import { useEffect, useRef, useState } from 'react'
import {
  fetchStatus, EFFORTS, getEffort, setEffort, effortLabel, type Status, getRoom,
} from '../lib/api'

let forgeState: { s: 'idle' | 'run' | 'ok' | 'fail'; msg?: string } = { s: 'idle' }
function startForge(onChange: () => void) {
  forgeState = { s: 'run' }; onChange()
  fetch(`${API_BASE}/forge?room=${encodeURIComponent(getRoom())}`, { method: 'POST' })
    .then(async (r) => {
      // nginx 只等 130 秒，交接写得久会先 504——那是后台还在换，不是失败
      if (r.status === 504 || r.status === 502) { forgeState = { s: 'ok', msg: '后台在换' }; return }
      const j = await r.json(); forgeState = j.ok ? { s: 'ok' } : { s: 'fail', msg: j.message }
    })
    .catch(() => { forgeState = { s: 'fail', msg: '网断了' } })
    .finally(onChange)
}
const IconSwap = () => (
  <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
  </svg>
)
import { IconPhone, IconSearch, IconGauge } from './icons'

function Row({ icon, label, value, onClick }:
  { icon: React.ReactNode; label: string; value?: string; onClick?: () => void }) {
  return (
    <button onClick={onClick}
      className="flex w-full items-center gap-3 rounded-[var(--radius-md)] px-3 py-3 text-left active:bg-[var(--color-card)]">
      <span className="shrink-0 text-[color:var(--color-ink-2)]">{icon}</span>
      <span className="flex-1 text-[17px]">{label}</span>
      {value && <span className="shrink-0 text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">{value}</span>}
      <span className="shrink-0 text-[color:var(--color-ink-4)]">›</span>
    </button>
  )
}

export default function MoreMenu({ onSearch, onCall }: { onSearch: () => void; onCall: () => void }) {
  const [open, setOpen] = useState(false)
  const [st, setSt] = useState<Status | null>(null)
  const [eff, setEff] = useState(getEffort())
  const [sub, setSub] = useState(false)
  const [, bump] = useState(0)
  const [armed, setArmed] = useState(false)
  const EFFORT_NOTE: Record<string, string> = {
    low: '简单问题快速回答', medium: '日常对话平衡模式',
    high: '复杂详细的回答', max: '最难的问题，耗时最长',
  }
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const pull = () => void fetchStatus().then(setSt)
    pull()
    const t = setInterval(pull, 3000)
    return () => clearInterval(t)
  }, [open])
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (!document.contains(t)) return          // 元素刚被重渲染换掉，不算点外面
      if (!box.current?.contains(t)) { setOpen(false); setSub(false) }
    }
    document.addEventListener('click', away)
    return () => document.removeEventListener('click', away)
  }, [open])

  const pct = st?.context_percent ?? 0

  return (
    <div ref={box} className="relative">
      <button onClick={(e) => { e.stopPropagation(); setSub(false); setOpen((v) => !v) }}
        className="grid h-9 w-9 place-items-center rounded-full text-[color:var(--color-ink-2)]">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor">
          <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-[40px] z-[120] w-[224px] rounded-[var(--radius-md)]
                        bg-[var(--color-surface)] p-2 shadow-[0_10px_40px_rgba(0,0,0,.14)]">
          <Row icon={<IconPhone />} label="语音通话" onClick={() => { setOpen(false); onCall() }} />
          {getRoom() !== 'group' && <Row icon={<IconSwap />}
            label={forgeState.s === 'run' ? '换窗中…' : armed ? '再点一次，换窗' : '换窗'}
            value={forgeState.s === 'ok' ? (forgeState.msg || '换好了') : forgeState.s === 'fail' ? (forgeState.msg || '没换成').slice(0, 10) : undefined}
            onClick={() => {
              if (forgeState.s === 'run') return
              if (!armed) { setArmed(true); window.setTimeout(() => setArmed(false), 4000); return }
              setArmed(false); startForge(() => bump((n) => n + 1))
            }} />}

          <div className="px-3 pb-3 pt-1">
            <div className="mb-1.5 text-[17px]">{pct}%</div>
            <div className="h-[3px] w-full overflow-hidden rounded-full bg-[var(--color-card)]">
              <div className="h-full rounded-full bg-[var(--color-ink-3)]" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>

          <Row icon={<IconGauge />} label="力度" value={effortLabel(eff)} onClick={() => setSub(true)} />
          <Row icon={<IconSearch />} label="搜索聊天" onClick={() => { setOpen(false); onSearch() }} />
          {sub && (
            <div className="absolute inset-2 z-[2] rounded-[var(--radius-xs)] bg-[var(--color-surface)] p-1.5">
              {EFFORTS.map((e) => (
                <button key={e} onClick={() => { setEff(e); setEffort(e); setSub(false) }}
                  className={`flex w-full items-baseline justify-between gap-2 rounded-[var(--radius-xs)]
                              px-2.5 py-2 text-left ${e === eff ? 'bg-[var(--color-card)]' : ''}`}>
                  <span className="text-[13px]">{effortLabel(e)}</span>
                  <small className="whitespace-nowrap text-[8px] text-[color:var(--color-ink-3)]">{EFFORT_NOTE[e]}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

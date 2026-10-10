import { useEffect, useState } from 'react'
import { useReducedMotion } from '../shell/anim'
import { API_BASE } from '../lib/config'

/* 涨落 · Ebb —— 一页"此刻状态"的空模板。数据全部由你自己的程序或 Claude 推给网关（见 docs/涨落.md）：
   ① 最上面一行小字（天色 / sky）② 一组细条指标（几条、叫什么、说明是什么都由数据决定）
   ③ 最近几天的活动分段计数条 ④ 整页的重心：一块面板，时间线列出每一次做了什么。
   版式：字小、线细、数值淡；上面三段都是配角，只有下面的面板是重心。 */

type Metric = { key: string; label: string; desc?: string; value: number; at?: string }
type EbbEvent = { id: string; kind: string; text: string; note?: string; at: string }
type EbbData = { sky: { text: string; at: string } | null; metrics: Metric[]; events: EbbEvent[]; counts: { days: number; total: number; by_kind: Record<string, number> } }

const SERIF = "'Cormorant Garamond', 'New York', ui-serif, Georgia, 'Songti SC', serif"
const LABEL = 'text-[10px] font-medium uppercase tracking-[.26em] text-[color:var(--color-ink-3)]'
const MONO: React.CSSProperties = { fontFamily: "'SF Mono', ui-monospace, Menlo, monospace", fontVariantNumeric: 'tabular-nums' }
const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
// 分段条的墨色：由深到浅（跟下面的面板一个色系），种类多于五个就循环
const INKS = ['#1d1e22', '#55575e', '#8b8d94', '#b9bbc1', '#dcdde1']
const TIME_W = 58, LINE_X = 70, CARD_X = 84
const p2 = (n: number) => String(n).padStart(2, '0')
const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`
const ago = (iso?: string) => {
  const t = iso ? Date.parse(iso) : NaN
  if (Number.isNaN(t)) return ''
  const m = Math.max(0, (Date.now() - t) / 60000)
  return m < 1 ? '刚刚' : m < 60 ? `${Math.round(m)} 分钟前` : m < 1440 ? `${Math.round(m / 60)} 小时前` : `${Math.round(m / 1440)} 天前`
}

/* 时间线图标：按 kind 选一个中性的线条图标，不认识的用一个小圆点 */
const ICON_PATHS: Record<string, string> = {
  message: 'M21 12a8 8 0 01-8 8H7l-4 3V12a8 8 0 018-8h2a8 8 0 018 8z',
  code: 'M8 8l-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14',
  read: 'M12 6.5C10 5 7 5 4.5 6v13c2.5-1 5.5-1 7.5.5 2-1.5 5-1.5 7.5-.5V6C17 5 14 5 12 6.5zM12 6.5V20',
  music: 'M9 18V6l10-2v12M9 18a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0zM19 16a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z',
  out: 'M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11zM12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  study: 'M3 9l9-4 9 4-9 4-9-4zM7 11v4.5c1.5 1.5 3 2 5 2s3.5-.5 5-2V11',
  memory: 'M6 4h12v16l-6-4-6 4z',
  wake: 'M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4L7 17M17 7l1.4-1.4M12 16a4 4 0 100-8 4 4 0 000 8z',
  sleep: 'M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z',
  skip: 'M5 12h14M13 6l6 6-6 6',
}
const ALIAS: Record<string, string> = { chat: 'message', reply: 'message', msg: 'message', book: 'read', play: 'out', travel: 'out', walk: 'out',
  learn: 'study', note: 'memory', remember: 'memory', listen: 'music', song: 'music', idle: 'sleep', later: 'skip', defer: 'skip' }
function KindIcon({ kind }: { kind: string }) {
  const d = ICON_PATHS[kind] || ICON_PATHS[ALIAS[kind]]
  return (
    <span className="grid h-[40px] w-[40px] shrink-0 place-items-center rounded-full bg-black/[.04] text-[color:var(--color-ink-2)]">
      {d ? <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>
         : <span className="h-[6px] w-[6px] rounded-full bg-current" />}
    </span>
  )
}

function Guide({ children }: { children: React.ReactNode }) {
  return <div className="text-[11.5px] leading-relaxed text-[color:var(--color-ink-3)]">{children}</div>
}

type Row = { kind: 'month'; label: string } | { kind: 'date'; label: string } | { kind: 'item'; it: EbbEvent; time: string }

export default function Ebb() {
  const reduced = useReducedMotion()
  const [data, setData] = useState<EbbData | null>(null)
  const [offline, setOffline] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)
  const [grown, setGrown] = useState(reduced)
  useEffect(() => {
    const load = async () => {
      const j = await fetch(`${API_BASE}/ebb?days=7`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      setOffline(!j)
      if (j) setData(j)
      requestAnimationFrame(() => setGrown(true))
    }
    void load()
    const i = setInterval(load, 45000)
    return () => clearInterval(i)
  }, [])

  const metrics = (data?.metrics || []).slice().sort((x, y) => y.value - x.value)
  const top = metrics[0]
  const sel = metrics.find((m) => m.key === picked) || top || null
  const counts = data?.counts
  const kinds = Object.entries(counts?.by_kind || {}).sort((a, b) => b[1] - a[1])
  const total = counts?.total || 0

  const rows: Row[] = []
  let lastDate = '', lastMonth = -1
  for (const it of data?.events || []) {
    const d = new Date(it.at)
    if (Number.isNaN(d.getTime())) continue
    const date = `${p2(d.getMonth() + 1)}.${p2(d.getDate())}`
    if (date !== lastDate) {
      if (lastMonth !== -1 && d.getMonth() !== lastMonth) rows.push({ kind: 'month', label: MONTHS[d.getMonth()] })
      rows.push({ kind: 'date', label: date })
      lastDate = date; lastMonth = d.getMonth()
    }
    rows.push({ kind: 'item', it, time: `${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}` })
  }

  return (
    <section className="absolute inset-0 overflow-y-auto px-5 pt-[max(1.25rem,env(safe-area-inset-top))]
                        pb-[calc(env(safe-area-inset-bottom)+112px)]">
      {/* ① 页头 + 一行小小的天色 */}
      <header className="mb-6 px-1">
        <h2 className="text-[28px] font-bold leading-none tracking-tight">Ebb</h2>
        <div className="mt-2 text-[11.5px] tabular-nums text-[color:var(--color-ink-3)]">
          {offline ? '网关暂时连不上。'
            : !data ? '读取中…'
            : data.sky ? <>{data.sky.text}<span className="text-[color:var(--color-ink-4)]"> · {ago(data.sky.at)}</span></>
            : '天色还没有人写。POST /ebb/sky 写一句此刻的状态。'}
        </div>
      </header>

      {/* ② 指标：两列细条，名字在前，数值淡；点一条看说明 */}
      <div className="mb-6 px-1">
        <div className="mb-3 flex items-baseline justify-between">
          <span className={LABEL}>Tides</span>
          {top && <span className="text-[11.5px] text-[color:var(--color-ink-3)]">此刻最高 <span className="text-[color:var(--color-ink)]">{top.label}</span></span>}
        </div>
        {metrics.length ? (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
              {metrics.map((m) => (
                <button key={m.key} onClick={() => setPicked(m.key)} className="flex min-w-0 items-center gap-2.5 text-left">
                  <span className={`max-w-[4.5em] shrink-0 truncate text-[12.5px] ${sel?.key === m.key ? 'text-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-2)]'}`}>{m.label}</span>
                  <span className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-black/[.06]">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--color-ink)] transition-[width,opacity] duration-1000 ease-out"
                      style={{ width: grown ? pct(m.value) : 0, opacity: sel?.key === m.key ? 0.9 : 0.3 }} />
                  </span>
                  <span className="w-[2.2em] shrink-0 text-right text-[10px] tabular-nums text-[color:var(--color-ink-4)]">{m.value.toFixed(2)}</span>
                </button>
              ))}
            </div>
            {sel && (
              <div className="mt-3 text-[12px] leading-relaxed text-[color:var(--color-ink-2)]">
                <span className="text-[13px] italic text-[color:var(--color-ink)]" style={{ fontFamily: SERIF }}>{sel.label}</span>
                {sel.desc && <><span className="mx-1.5 text-[color:var(--color-ink-4)]">—</span>{sel.desc}</>}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 opacity-60">
              {[0.62, 0.38, 0.5, 0.24].map((w, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <span className="w-[2.2em] shrink-0 text-[12.5px] text-[color:var(--color-ink-4)]">——</span>
                  <span className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-black/[.06]">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-black/[.08]" style={{ width: pct(w) }} />
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-3"><Guide>还没有指标。几条、叫什么、说明写什么都由你推的数据决定：POST /ebb/metrics。</Guide></div>
          </>
        )}
      </div>

      {/* ③ 最近几天的活动：一行数字 + 一根细分段条；下面的面板就从这根条底下接着 */}
      <div className="mb-3 px-1">
        <div className="mb-2.5 flex items-baseline justify-between">
          <span className={LABEL}>Activity · {counts?.days || 7} 天</span>
          <span className="text-[11.5px] text-[color:var(--color-ink-3)]">
            <span className="mr-0.5 text-[22px] leading-none tabular-nums text-[color:var(--color-ink)]" style={{ fontFamily: SERIF }}>{total}</span> 条
          </span>
        </div>
        <div className="flex h-[4px] gap-[2px] overflow-hidden rounded-full bg-black/[.05]">
          {kinds.map(([k, n], i) => (
            <div key={k} className="h-full rounded-full transition-[flex-grow] duration-1000 ease-out" style={{ flexGrow: grown ? n : 0.001, background: INKS[i % INKS.length] }} />
          ))}
        </div>
        {kinds.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[color:var(--color-ink-3)]">
            {kinds.map(([k, n], i) => (
              <span key={k} className="flex items-center gap-1.5">
                <span className="h-[6px] w-[6px] rounded-full" style={{ background: INKS[i % INKS.length] }} />
                {k}<span className="tabular-nums text-[color:var(--color-ink)]">{n}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ④ 每一次做了什么：整页的重心，一块浅色面板 + 时间线 */}
      {/* 浅色面板：经典主题是白底细边玻璃卡，灰阶浮雕下自动变成浮起的 loop-card */}
      <div className="loop-card relative overflow-hidden rounded-[26px] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 pb-5 pt-6 text-[color:var(--color-ink)] shadow-[var(--shadow-xs)]">
        <div className="flex items-center justify-center gap-2.5 text-[color:var(--color-ink-4)]">
          <span className="h-px w-5 bg-current" />
          <span className="text-[15px] tracking-[.08em] text-[color:var(--color-ink)]">每一次，做了什么</span>
          <span className="h-px w-5 bg-current" />
        </div>
        <div className="mt-1.5 text-center text-[11px] tracking-[.04em] text-[color:var(--color-ink-3)]">推进来的事件会按时间留在这里。</div>

        {!data ? (
          <div className="py-10 text-center text-[12px] text-[color:var(--color-ink-3)]">{offline ? '网关暂时连不上。' : '读取中…'}</div>
        ) : !rows.length ? (
          <div className="px-4 py-12 text-center">
            <div className="text-[13px] leading-loose text-[color:var(--color-ink-2)]">还没有记录。</div>
            <div className="mt-2 text-[11.5px] leading-relaxed text-[color:var(--color-ink-3)]">
              让 Claude 每次做完事 POST /ebb/events 一条，<br />或者用你自己的程序推。怎么接数据见
              <span className="mx-1 font-mono text-[11px] text-[color:var(--color-ink-2)]">docs/涨落.md</span>（仓库里）。
            </div>
          </div>
        ) : (
          <div className="relative mt-4">
            {rows.map((r, i) => {
              const prevItem = rows[i - 1]?.kind === 'item', nextItem = rows[i + 1]?.kind === 'item'
              if (r.kind === 'month') return (
                <div key={`m${i}`} className="relative h-[34px]">
                  <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[10.5px] font-medium tracking-[.34em] text-[color:var(--color-ink-3)]"
                    style={{ left: LINE_X + 4 }}>{r.label}</span>
                </div>
              )
              if (r.kind === 'date') return (
                <div key={`d${i}`} className="relative h-[34px]">
                  {prevItem && <span className="absolute top-0 h-[6px] w-px bg-black/[.10]" style={{ left: LINE_X }} />}
                  <span className="absolute bottom-0 h-[6px] w-px bg-black/[.10]" style={{ left: LINE_X }} />
                  <span className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 text-[17px] italic text-[color:var(--color-ink)]"
                    style={{ left: LINE_X + 1, fontFamily: SERIF }}>{r.label}</span>
                </div>
              )
              return (
                <div key={r.it.id || `i${i}`} className="relative py-[5px]" style={{ paddingLeft: CARD_X }}>
                  <span className="absolute w-px bg-black/[.10]" style={{ left: LINE_X, top: 0, bottom: nextItem || rows[i + 1] ? 0 : '50%' }} />
                  {!prevItem && <span className="absolute w-px bg-black/[.10]" style={{ left: LINE_X, top: 0, height: 6 }} />}
                  <span className="absolute top-1/2 -translate-y-1/2 text-[10.5px] text-[color:var(--color-ink-3)]" style={{ left: 0, width: TIME_W, ...MONO }}>{r.time}</span>
                  <span className="absolute top-1/2 h-[7px] w-[7px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-ink-2)] shadow-[0_0_0_3px_var(--color-surface)]"
                    style={{ left: LINE_X + 0.5 }} />
                  <div className="loop-tile flex min-h-[60px] items-center gap-3 rounded-[16px] border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2.5">
                    <KindIcon kind={r.it.kind} />
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold leading-snug text-[color:var(--color-ink)]">{r.it.text}</div>
                      {(r.it.note || '').trim() && <div className="mt-1 text-[12px] leading-relaxed text-[color:var(--color-ink-3)]">{r.it.note}</div>}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}

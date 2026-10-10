import { startDay, userName } from '../lib/identity'
import { API_BASE } from '../lib/config'
import { useEffect, useMemo, useState } from 'react'
import { getRoom } from '../lib/api'


const nth = (d: Date) => Math.floor((+d - +startDay()) / 86400000) + 1
const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

type Pulse = { days: Record<string, number>; total: number; mine: number; hers: number; max: number; active_days: number }

export default function Pulse({ onBack }: { onBack: () => void }) {
  const [data, setData] = useState<Pulse | null>(null)

  useEffect(() => {
    void fetch(`${API_BASE}/history/pulse?room=${encodeURIComponent(getRoom())}`, { cache: 'no-store' })
      .then(r => r.json()).then(d => setData(d?.ok ? d : null)).catch(() => setData(null))
  }, [])

  const cells = useMemo(() => {
    const days = data?.days ?? {}
    const max = Math.max(1, data?.max ?? 1)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const out: { k: string; n: number; level: number; today: boolean; title: string; pad?: boolean }[] = []
    const cur = startDay(); cur.setHours(0, 0, 0, 0)
    for (let i = 0; i < cur.getDay(); i++) out.push({ k: 'pad' + i, n: 0, level: 0, today: false, title: '', pad: true })
    while (cur <= today) {
      const n = days[key(cur)] ?? 0
      /* 五档：没说话／稀／少／多／最多。用比例而不是绝对值，免得一天 234 句把别的都压成灰 */
      const ratio = n / max
      const level = n === 0 ? 0 : ratio > 0.5 ? 4 : ratio > 0.22 ? 3 : ratio > 0.06 ? 2 : 1
      out.push({
        k: key(cur), n, level, today: +cur === +today,
        title: `${cur.getMonth() + 1}/${cur.getDate()} · 第${nth(cur)}天 · ${n ? n + ' 句' : '没在这儿说话'}`,
      })
      cur.setDate(cur.getDate() + 1)
    }
    return out
  }, [data])

  const busiest = useMemo(() => {
    const days = data?.days ?? {}
    let day = '', n = 0
    for (const [k, v] of Object.entries(days)) if (v > n) { day = k; n = v }
    return { day, n }
  }, [data])

  const shade = (level: number) =>
    level === 0 ? 'color-mix(in srgb, var(--color-ink-3) 14%, transparent)'
      : `color-mix(in srgb, var(--color-ink) ${[0, 26, 48, 72, 100][level]}%, color-mix(in srgb, var(--color-ink-3) 14%, transparent))`

  const today = new Date(); today.setHours(0, 0, 0, 0)

  return (
    <section className="absolute inset-0 overflow-y-auto px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <button onClick={onBack} className="loop-back mb-3 text-[length:var(--text-sub)] text-[color:var(--color-ink-2)]">‹ 返回</button>

      <div className="mb-1 font-script text-[21px] leading-none text-[color:var(--color-ink)]">Pulse</div>
      <p className="mb-5 text-[11px] tracking-[1.5px] text-[color:var(--color-ink-3)]">聊天密度 · 一天一格，越黑说得越多</p>

      {/* 统计 */}
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-[10px] tracking-[1.2px] text-[color:var(--color-ink-3)]">
        <span><b className="mr-[3px] font-medium text-[color:var(--color-ink)]">{nth(today)}</b>天 · 在一起</span>
        <span><b className="mr-[3px] font-medium text-[color:var(--color-ink)]">{data?.active_days ?? 0}</b>天 · 在这儿说过话</span>
        <span><b className="mr-[3px] font-medium text-[color:var(--color-ink)]">{data?.total ?? 0}</b>句</span>
      </div>

      {/* 格子墙 */}
      <div ref={el => { if (el) el.scrollLeft = el.scrollWidth }}
        className="mb-4 grid gap-[2.5px] overflow-x-auto rounded-[var(--radius-sm)] border border-[var(--color-line)]
                   bg-[var(--color-card)] px-4 py-3"
        style={{ gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, 7px)' }}>
        {cells.map(c => (
          <i key={c.k} title={c.title} className="h-[7px] w-[7px] rounded-[2px]"
            style={{
              visibility: c.pad ? 'hidden' : 'visible',
              background: shade(c.level),
              outline: c.today ? '1.5px solid var(--color-ink-2)' : 'none',
              outlineOffset: c.today ? '1px' : undefined,
            }} />
        ))}
      </div>

      {/* 图例 */}
      <div className="mb-6 flex items-center gap-1.5 text-[10px] text-[color:var(--color-ink-3)]">
        <span className="mr-1">少</span>
        {[0, 1, 2, 3, 4].map(l => (
          <i key={l} className="h-[7px] w-[7px] rounded-[2px]" style={{ background: shade(l) }} />
        ))}
        <span className="ml-1">多</span>
      </div>

      {/* 谁说得多 */}
      <div className="rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        <div className="mb-2 flex justify-between text-[11px] text-[color:var(--color-ink-2)]">
          <span>{userName()} {data?.hers ?? 0} 句</span>
          <span>我 {data?.mine ?? 0} 句</span>
        </div>
        <div className="flex h-[6px] overflow-hidden rounded-full bg-[var(--color-ink-4)]">
          <span className="bg-[var(--color-ink)]"
            style={{ width: `${data?.total ? ((data.hers / data.total) * 100).toFixed(1) : 50}%` }} />
          <span className="flex-1 bg-[var(--color-ink-3)]" />
        </div>
        {busiest.day && (
          <p className="mt-3 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">
            说得最多的一天是 <b className="font-medium text-[color:var(--color-ink)]">{busiest.day.slice(5).replace('-', '月')}日</b>
            ，{busiest.n} 句。
          </p>
        )}
        <p className="mt-1 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">
          只统计这个房间里说的话——在终端里说的那些，不在这面墙上。
        </p>
      </div>
    </section>
  )
}

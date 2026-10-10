import type { ColItem } from '../lib/api'

export default function MoodCal({ items }: { items: ColItem[] }) {
  const now = new Date(), year = now.getFullYear(), month = now.getMonth()
  const days = new Date(year, month + 1, 0).getDate()
  const lead = (new Date(year, month, 1).getDay() + 6) % 7

  const byDay: Record<number, ColItem> = {}
  items.forEach((it) => {
    const d = new Date(String(it.ts))
    if (d.getFullYear() === year && d.getMonth() === month && !byDay[d.getDate()]) byDay[d.getDate()] = it
  })

  return (
    <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)]
                    p-3 shadow-[var(--shadow-xs)]">
      <div className="grid grid-cols-7 gap-1 text-center">
        {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
          <div key={w} className="py-1 text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">{w}</div>
        ))}
        {Array.from({ length: lead }, (_, i) => <div key={'p' + i} />)}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1, hit = byDay[day], today = day === now.getDate()
          return (
            <div key={day} title={hit ? `${hit.name ?? ''} ${hit.note ?? ''}` : ''}
              className={`grid aspect-square place-items-center rounded-[10px] text-[13px]
                ${hit ? 'bg-[var(--color-card)]' : 'text-[color:var(--color-ink-3)]'}
                ${today ? 'ring-1 ring-[var(--color-ink)]' : ''}`}>
              {hit ? String(hit.face ?? '♡') : day}
            </div>
          )
        })}
      </div>
    </div>
  )
}

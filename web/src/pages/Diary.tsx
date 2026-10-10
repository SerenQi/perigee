import { startDay, userName, aiName } from '../lib/identity'
import { useEffect, useMemo, useState } from 'react'
import { colList, colAdd, colDel, type ColItem } from '../lib/api'


const WEEKS = ['日', '一', '二', '三', '四', '五', '六']
const SERIF = "'Noto Serif SC','Songti SC',Georgia,serif"
const nth = (d: Date) => Math.floor((+d - +startDay()) / 86400000) + 1
const s = (v: unknown) => (v == null ? '' : String(v))

export default function Diary({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ColItem[]>([])
  const [book, setBook] = useState<'user' | 'ai'>('user')
  const [reading, setReading] = useState<ColItem | null>(null)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [showHeat, setShowHeat] = useState(false)
  const [writing, setWriting] = useState(false)
  const nowKey = (() => { const n = new Date(); return n.getFullYear() + '-' + (n.getMonth() + 1) })()
  const [openMonths, setOpenMonths] = useState<Record<string, boolean>>({ [nowKey]: true })

  const load = () => colList('diary').then(setItems)
  useEffect(() => { load() }, [])

  const mine = useMemo(() =>
    items.filter(i => (s(i.by) || 'user') === book)
      .slice().sort((a, b) => +new Date(b.ts) - +new Date(a.ts)),
    [items, book])

  const months = useMemo(() => {
    const m: { key: string; label: string; items: ColItem[] }[] = []
    mine.forEach(i => {
      const d = new Date(i.ts)
      const key = isNaN(+d) ? '未知' : d.getFullYear() + '-' + (d.getMonth() + 1)
      const label = isNaN(+d) ? '未知' : (d.getMonth() + 1) + '月'
      const g = m.find(x => x.key === key)
      if (g) g.items.push(i); else m.push({ key, label, items: [i] })
    })
    return m
  }, [mine])

  const heat = useMemo(() => {
    const days = new Set(mine.map(i => new Date(i.ts).toDateString()))
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const cells: { key: string; on: boolean; today: boolean; title: string; pad?: boolean }[] = []
    const cur = startDay(); cur.setHours(0, 0, 0, 0)
    for (let i = 0; i < cur.getDay(); i++) cells.push({ key: 'pad' + i, on: false, today: false, title: '', pad: true })
    while (cur <= today) {
      cells.push({
        key: cur.toDateString(),
        on: days.has(cur.toDateString()),
        today: +cur === +today,
        title: `${cur.getMonth() + 1}/${cur.getDate()} · 第${nth(cur)}天`,
      })
      cur.setDate(cur.getDate() + 1)
    }
    return { cells, recorded: days.size, total: nth(today) }
  }, [mine])

  const write = async () => {
    const text = draft.trim()
    if (!text || saving) return
    setSaving(true)
    await colAdd('diary', { text, by: 'user' })
    setDraft(''); setSaving(false); setWriting(false); load()
  }

  /* ── 单篇（图2：杂志排版） ── */
  if (reading) {
    const d = new Date(reading.ts)
    const ok = !isNaN(+d)
    return (
      <section className="absolute inset-0 overflow-y-auto px-6 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <button onClick={() => setReading(null)} className="mb-6 text-[length:var(--text-sub)] text-[color:var(--color-ink-2)]">‹ 回到目录</button>
        <div className="mx-auto max-w-[460px] text-center">
          {ok && <div className="text-[10px] uppercase tracking-[4px] text-[color:var(--color-ink-3)]">
            {d.getFullYear()} · {String(d.getMonth() + 1).padStart(2, '0')}
          </div>}
          {ok && <h1 className="mt-4 text-[22px] font-normal tracking-[1px] text-[color:var(--color-ink)]" style={{ fontFamily: SERIF }}>
            {d.getMonth() + 1}月{d.getDate()}日，<em className="font-light italic">星期{WEEKS[d.getDay()]}</em>
          </h1>}
          <div className="mx-auto my-[18px] h-px w-14 bg-[var(--color-line)]" />
          {ok && <div className="text-[10.5px] tracking-[1.5px] text-[color:var(--color-ink-3)]">我们的第 {nth(d)} 天</div>}
          <div className="mt-6 whitespace-pre-wrap text-left text-[14.5px] leading-[2.1] tracking-[.4px] text-[color:var(--color-ink)]" style={{ fontFamily: SERIF }}>
            {s(reading.text)}
          </div>
          <div className="mt-7 text-[11px] tracking-[2px] text-[color:var(--color-ink-3)]">
            —— {s(reading.by) === 'ai' ? aiName() : userName()}
          </div>
          <button
            onClick={async () => { if (confirm('撕掉这一页吗？')) { await colDel('diary', reading.id); setReading(null); load() } }}
            className="mt-10 text-[10.5px] text-[color:var(--color-ink-4)]">撕掉这页</button>
        </div>
      </section>
    )
  }

  /* ── 目录（图1+图3） ── */
  return (
    <section className="absolute inset-0 overflow-y-auto px-5 pb-[110px] pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="loop-back text-[length:var(--text-sub)] text-[color:var(--color-ink-2)]">‹ 返回</button>
        <div className="flex items-center gap-2">
        {book === 'user' && (
          <button onClick={() => setWriting(v => !v)} aria-label="写日记"
            className={`grid h-[34px] w-[34px] place-items-center rounded-[10px] border transition-colors
              ${writing ? 'border-[var(--color-ink)] bg-[var(--color-ink)]' : 'border-[var(--color-line)] bg-[var(--color-surface)]'}`}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke={writing ? 'var(--color-surface)' : 'var(--color-ink)'} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M11.2 2.1l2.7 2.7L5.4 13.3l-3.2.5.5-3.2z" />
              <path d="M9.8 3.5l2.7 2.7" />
            </svg>
          </button>
        )}
        <button onClick={() => setShowHeat(v => !v)} aria-label="热力图"
          className={`grid h-[34px] w-[34px] place-items-center rounded-[10px] border transition-colors
            ${showHeat ? 'border-[var(--color-ink)] bg-[var(--color-ink)]' : 'border-[var(--color-line)] bg-[var(--color-surface)]'}`}>
          <span className="grid grid-cols-3 gap-[2px]">
            {Array.from({ length: 9 }).map((_, i) => (
              <i key={i} className="h-[3px] w-[3px] rounded-[1px]"
                style={{ background: showHeat ? 'var(--color-surface)' : (i % 2 ? 'var(--color-ink-3)' : 'var(--color-ink)') }} />
            ))}
          </span>
        </button>
        </div>
      </div>

      {/* 热力图（图3）：点右上角小图标展开 */}
      {showHeat && <div className="mb-4 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-4 py-3">
        <div className="mb-2 flex gap-4 text-[10px] tracking-[1.2px] text-[color:var(--color-ink-3)]">
          <span><b className="mr-[3px] font-medium text-[color:var(--color-ink)]">{heat.total}</b>天 · 在一起</span>
          <span><b className="mr-[3px] font-medium text-[color:var(--color-ink)]">{heat.recorded}</b>天 · 留了字</span>
          <span><b className="mr-[3px] font-medium text-[color:var(--color-ink)]">{mine.length}</b>篇</span>
        </div>
        <div ref={el => { if (el) el.scrollLeft = el.scrollWidth }}
          className="grid gap-[2.5px] overflow-x-auto pb-[2px]"
          style={{ gridAutoFlow: 'column', gridTemplateRows: 'repeat(7, 7px)' }}>
          {heat.cells.map(c => (
            <i key={c.key} title={c.title}
              className="h-[7px] w-[7px] rounded-[2px]"
              style={{
                visibility: c.pad ? 'hidden' : 'visible',
                background: c.on ? 'var(--color-ink)' : 'color-mix(in srgb, var(--color-ink-3) 16%, transparent)',
                outline: c.today ? '1.5px solid var(--color-ink-2)' : 'none',
                outlineOffset: c.today ? '1px' : undefined,
              }} />
          ))}
        </div>
      </div>}

      {/* 写作框：点小铅笔展开 */}
      {writing && book === 'user' && (
        <div className="mb-5 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
          <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)}
            placeholder="今天想留下什么…" rows={4} maxLength={8000}
            style={{ fontFamily: SERIF }}
            className="w-full resize-y bg-transparent text-[14px] leading-[1.9] outline-none placeholder:text-[color:var(--color-ink-4)]" />
          <div className="flex justify-end">
            <button onClick={write} disabled={saving || !draft.trim()}
              className="rounded-full bg-[var(--color-ink)] px-5 py-[7px] text-[12px] tracking-[2px] text-[color:var(--color-surface)] disabled:opacity-30">
              写下
            </button>
          </div>
        </div>
      )}

      {/* 时间轴目录（图1） */}
      {mine.length === 0 && <p className="mt-8 text-center text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">第一页还空着。</p>}
      <div>
        {months.map(g => (
          <div key={g.key}>
            <button onClick={() => setOpenMonths(o => ({ ...o, [g.key]: !o[g.key] }))}
              className="mb-3 mt-1 flex w-full items-center gap-2">
              <span style={{ fontFamily: SERIF }}
                className="rounded-[8px] bg-[var(--color-ink)] px-[9px] py-[3px] text-[11px] tracking-[1.5px] text-[color:var(--color-surface)]">
                {g.label}
              </span>
              <span className="h-px flex-1 bg-[var(--color-line)]" />
              <span className="text-[10.5px] tracking-[1px] text-[color:var(--color-ink-3)]">
                {g.items.length}篇 {openMonths[g.key] ? '▾' : '▸'}
              </span>
            </button>
            {openMonths[g.key] && g.items.map((item, idx) => {
          const d = new Date(item.ts)
          const lines = s(item.text).split('\n').filter(x => x.trim())
          return (
            <div key={item.id} onClick={() => setReading(item)} className="flex cursor-pointer gap-3">
              <div className="w-[52px] shrink-0 pt-[3px] text-right text-[10.5px] tracking-[.3px] text-[color:var(--color-ink-3)]">
                {isNaN(+d) ? '' : `${d.getMonth() + 1}月${d.getDate()}日`}
              </div>
              <div className="flex w-[10px] shrink-0 flex-col items-center">
                <div className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: book === 'ai' ? 'var(--color-ink-3)' : 'var(--color-ink)' }} />
                {idx < g.items.length - 1 && <div className="mt-[3px] w-px flex-1 bg-[var(--color-line)]" />}
              </div>
              <div className="min-w-0 flex-1 pb-[22px] pr-1">
                <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[13.5px] font-medium text-[color:var(--color-ink)]" style={{ fontFamily: SERIF }}>
                  {lines[0] || '（无字）'}
                </div>
                {lines.length > 1 && (
                  <div className="mt-1 text-[11.5px] leading-[1.7] text-[color:var(--color-ink-2)]"
                    style={{ fontFamily: SERIF, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {lines.slice(1).join(' ')}
                  </div>
                )}
              </div>
            </div>
          )
            })}
          </div>
        ))}
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-10 flex items-center justify-around border-t border-[var(--color-line)] bg-[var(--color-surface)] pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-[10px]">
        {([['user', userName()], ['ai', aiName()]] as const).map(([key, label]) => (
          <button key={key} onClick={() => { setBook(key); setWriting(false) }} className="flex flex-col items-center gap-[3px] px-8">
            <span className="h-[6px] w-[6px] rounded-full transition-colors"
              style={{ background: book === key ? 'var(--color-ink)' : 'transparent', outline: book === key ? 'none' : '1px solid var(--color-ink-4)' }} />
            <span style={{ fontFamily: SERIF }}
              className={`text-[13px] tracking-[3px] ${book === key ? 'font-medium text-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-3)]'}`}>
              {label}
            </span>
          </button>
        ))}
      </nav>
    </section>
  )
}

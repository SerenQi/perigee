import { useEffect, useMemo, useState } from 'react'
import { colList, colAdd, colPatch, colDel, type ColItem } from '../lib/api'


const s = (v: unknown) => (v == null ? '' : String(v))
const WEEK = ['一', '二', '三', '四', '五', '六', '日']

const FACES: [string, string, string][] = [
  ['happy', '开心', '#ffd45e'], ['shy', '甜', '#f8a9ac'], ['cozy', '舒服', '#c9e2ae'], ['calm', '平静', '#4ecb8d'], ['wink', '俏皮', '#ffa257'],
  ['worry', '担心', '#c3aee3'], ['down', '低落', '#7ba3c9'], ['tear', '想哭', '#7a8794'], ['wry', '无语', '#a58a6f'], ['angry', '生气', '#f2455c'],
]
const LEGACY: Record<string, string> = { '🥰': 'shy', '😊': 'happy', '😌': 'cozy', '😪': 'down', '😤': 'angry', '😢': 'tear', '🥺': 'worry' }
const faceColor = (k: string) => FACES.find(([f]) => f === k)?.[2] ?? '#d8d4c8'
type Shape = 'round' | 'square'

function MoodFace({ face, shape, size = 24 }: { face: string; shape: Shape; size?: number }) {
  const k = LEGACY[face] ?? face
  const ink = '#3d3a34'
  const st = { fill: 'none', stroke: ink, strokeWidth: 1.5, strokeLinecap: 'round' as const }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24">
      {shape === 'round'
        ? <circle cx="12" cy="12" r="10.2" fill={faceColor(k)} />
        : <rect x="1.8" y="1.8" width="20.4" height="20.4" rx="5.5" fill={faceColor(k)} />}
      <g {...st}>
        {k === 'happy' && <>
          <circle cx="8.6" cy="10" r="1" fill={ink} stroke="none" /><circle cx="15.4" cy="10" r="1" fill={ink} stroke="none" />
          <path d="M8 13.4q4 3.6 8 0" />
        </>}
        {k === 'shy' && <>
          <circle cx="8.8" cy="10.4" r="0.95" fill={ink} stroke="none" /><circle cx="15.2" cy="10.4" r="0.95" fill={ink} stroke="none" />
          <path d="M10.6 14q1.4 1.1 2.8 0" />
          <circle cx="6.6" cy="12.8" r="0.9" fill="#e87b80" stroke="none" opacity="0.75" />
          <circle cx="17.4" cy="12.8" r="0.9" fill="#e87b80" stroke="none" opacity="0.75" />
        </>}
        {k === 'cozy' && <>
          <path d="M7.2 10.4q1.4 1.2 2.8 0M14 10.4q1.4 1.2 2.8 0" />
          <circle cx="12.6" cy="14.2" r="1.1" />
          <circle cx="6.4" cy="13" r="0.9" fill="#e87b80" stroke="none" opacity="0.6" />
          <circle cx="17.6" cy="13" r="0.9" fill="#e87b80" stroke="none" opacity="0.6" />
        </>}
        {k === 'calm' && <>
          <circle cx="8.8" cy="10.2" r="0.95" fill={ink} stroke="none" /><circle cx="15.2" cy="10.2" r="0.95" fill={ink} stroke="none" />
          <path d="M9.4 14.4h5.2" />
        </>}
        {k === 'wink' && <>
          <circle cx="8.8" cy="10" r="0.95" fill={ink} stroke="none" />
          <path d="M13.9 10q1.3 1 2.6 0" />
          <path d="M8.6 13.6q3.4 3 6.8 0" />
        </>}
        {k === 'worry' && <>
          <path d="M6.8 8.8l2.6.9M17.2 8.8l-2.6.9" />
          <circle cx="9" cy="11.4" r="0.9" fill={ink} stroke="none" /><circle cx="15" cy="11.4" r="0.9" fill={ink} stroke="none" />
          <path d="M9.8 15.6q2.2-1.4 4.4 0" />
        </>}
        {k === 'down' && <>
          <path d="M7 9.4l2.6-.5M17 9.4l-2.6-.5" />
          <circle cx="9" cy="11.6" r="0.9" fill={ink} stroke="none" /><circle cx="15" cy="11.6" r="0.9" fill={ink} stroke="none" />
          <path d="M9.6 15.8q2.4-1.7 4.8 0" />
          <circle cx="8.2" cy="13.6" r="0.45" fill={ink} stroke="none" /><circle cx="10" cy="13.9" r="0.35" fill={ink} stroke="none" />
        </>}
        {k === 'tear' && <>
          <path d="M7.4 9.2h2.4M14.2 9.2h2.4" />
          <circle cx="8.9" cy="11.2" r="0.9" fill={ink} stroke="none" /><circle cx="15.1" cy="11.2" r="0.9" fill={ink} stroke="none" />
          <path d="M9.8 15.6q2.2-1.5 4.4 0" />
          <path d="M16.4 13q1 1.5 0 2.1q-1-.6 0-2.1z" fill="#eef4f8" stroke="none" />
        </>}
        {k === 'wry' && <>
          <path d="M7 9.2l3-.6M14 8.4l3 .6" />
          <circle cx="9" cy="11" r="0.85" fill={ink} stroke="none" /><circle cx="15" cy="11.2" r="0.85" fill={ink} stroke="none" />
          <path d="M9.6 15.2l4.6-.8" />
          <path d="M18.2 10.6q.9 1.4 0 2q-.9-.6 0-2z" fill="#eef4f8" stroke="none" />
        </>}
        {k === 'angry' && <>
          <path d="M6.8 8.4l3 1.4M17.2 8.4l-3 1.4" />
          <circle cx="9.2" cy="11.6" r="0.9" fill={ink} stroke="none" /><circle cx="14.8" cy="11.6" r="0.9" fill={ink} stroke="none" />
          <path d="M9.6 15.8l4.8-1" />
        </>}
      </g>
    </svg>
  )
}
const sameMonth = (d: Date, y: number, m: number) => d.getFullYear() === y && d.getMonth() === m
export default function Mood({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<ColItem[]>([])
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const now = new Date()
  const [ym, setYm] = useState<[number, number]>([now.getFullYear(), now.getMonth()])
  const [dayPick, setDayPick] = useState<number | null>(null)
  const [markDraft, setMarkDraft] = useState('')

  const load = () => colList('mood').then(setItems)
  useEffect(() => { void load() }, [])

  const moods = useMemo(() => items.filter(i => s(i.kind) !== 'mark')
    .slice().sort((a, b) => +new Date(s(b.ts)) - +new Date(s(a.ts))), [items])
  const marks = useMemo(() => {
    const m: Record<string, ColItem> = {}
    items.forEach(i => { if (s(i.kind) === 'mark' && s(i.date)) m[s(i.date)] = i })
    return m
  }, [items])

  const todayMine = useMemo(() => {
    const t = new Date().toDateString()
    return moods.find(i => (s(i.by) || 'user') === 'user' && new Date(s(i.ts)).toDateString() === t)
  }, [moods])

  const [year, month] = ym
  const byDay = useMemo(() => {
    const m: Record<number, { her?: ColItem; him?: ColItem }> = {}
    moods.forEach(i => {
      const d = new Date(s(i.ts))
      if (!sameMonth(d, year, month)) return
      const slot = (m[d.getDate()] ||= {})
      const k = (s(i.by) || 'user') === 'ai' ? 'him' : 'her'
      if (!slot[k]) slot[k] = i
    })
    return m
  }, [moods, year, month])

  /* 点脸：今天已记过就是改，没记过才新增 */
  const mark = async (face: string, name: string) => {
    if (busy) return
    setBusy(true)
    if (todayMine) await colPatch('mood', s(todayMine.id), { face, name, ...(note.trim() ? { note: note.trim() } : {}) })
    else await colAdd('mood', { face, name, note: note.trim(), by: 'user' })
    setNote(''); setBusy(false); void load()
  }
  /* 存一句话：写进今天的记录 */
  const saveNote = async () => {
    const t = note.trim()
    if (!t || busy) return
    if (!todayMine) return   /* 还没点脸，字先留在框里 */
    setBusy(true)
    await colPatch('mood', s(todayMine.id), { note: t })
    setNote(''); setBusy(false); void load()
  }
  /* 特殊日期标注 */
  const saveMark = async (dateStr: string) => {
    const t = markDraft.trim()
    if (!t || busy) return
    setBusy(true)
    const old = marks[dateStr]
    if (old) await colPatch('mood', s(old.id), { label: t })
    else await colAdd('mood', { kind: 'mark', date: dateStr, label: t, by: 'user' })
    setMarkDraft(''); setBusy(false); void load()
  }

  const days = new Date(year, month + 1, 0).getDate()
  const lead = (new Date(year, month, 1).getDay() + 6) % 7
  const isThisMonth = year === now.getFullYear() && month === now.getMonth()
  const shift = (n: number) => { setDayPick(null); setYm(([y, m]) => {
    const d = new Date(y, m + n, 1); return [d.getFullYear(), d.getMonth()]
  }) }
  const pickDateStr = dayPick ? `${year}-${String(month + 1).padStart(2, '0')}-${String(dayPick).padStart(2, '0')}` : ''
  const pick = dayPick ? byDay[dayPick] : undefined
  const pickMark = dayPick ? marks[pickDateStr] : undefined

  return (
    <section className="absolute inset-0 overflow-y-auto px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <button onClick={onBack} className="loop-back mb-3 text-[length:var(--text-sub)] text-[color:var(--color-ink-2)]">‹ 返回</button>

      <div className="mb-1 font-script text-[21px] leading-none">Mood</div>
      <p className="mb-5 text-[11px] tracking-[1.5px] text-[color:var(--color-ink-3)]">
        一本日历 · 圆的是你 方的是我
      </p>

      <div className="mb-5 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
        <div className="mb-2 grid grid-cols-5 gap-1">
          {FACES.map(([face, name]) => (
            <button key={face} onClick={() => void mark(face, name)} disabled={busy}
              className={`flex flex-col items-center gap-1 rounded-[var(--radius-xs)] py-1.5
                          transition-colors active:scale-95
                ${todayMine && (s(todayMine.face) === face || LEGACY[s(todayMine.face)] === face) ? 'bg-[var(--color-card)] ring-1 ring-[var(--color-ink)]' : ''}`}>
              <MoodFace face={face} shape="round" size={34} />
              <span className="text-[9.5px] text-[color:var(--color-ink-3)]">{name}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={120}
            onKeyDown={e => { if (e.key === 'Enter') void saveNote() }}
            placeholder={todayMine ? '想说一句就写，回车或点存…' : '先点一张脸，再写一句…'}
            className="min-w-0 flex-1 bg-transparent px-1 text-[12.5px] outline-none placeholder:text-[color:var(--color-ink-4)]" />
          {note.trim() && todayMine && (
            <button onClick={() => void saveNote()} disabled={busy}
              className="shrink-0 rounded-full bg-[var(--color-ink)] px-3 py-1 text-[11px] text-[color:var(--color-surface)]">存</button>
          )}
        </div>
        {todayMine && (
          <p className="mt-2 px-1 text-[11px] text-[color:var(--color-ink-3)]">
            今天记过：{s(todayMine.name)}{s(todayMine.note) ? ' · ' + s(todayMine.note) : ''}
            <span className="ml-1 opacity-70">（再点脸就是改）</span>
          </p>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => shift(-1)} className="px-2 text-[color:var(--color-ink-3)]">‹</button>
        <span className="text-[12px] tracking-[2px] text-[color:var(--color-ink-2)]">{year} 年 {month + 1} 月</span>
        <button onClick={() => shift(1)} disabled={isThisMonth}
          className="px-2 text-[color:var(--color-ink-3)] disabled:opacity-25">›</button>
      </div>
      <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEK.map(w => (
            <div key={w} className="py-1 text-[10px] text-[color:var(--color-ink-3)]">{w}</div>
          ))}
          {Array.from({ length: lead }, (_, i) => <div key={'p' + i} />)}
          {Array.from({ length: days }, (_, i) => {
            const day = i + 1
            const e = byDay[day]
            const dstr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
            const hasMark = Boolean(marks[dstr])
            const today = isThisMonth && day === now.getDate()
            return (
              <button key={day} onClick={() => { setDayPick(dayPick === day ? null : day); setMarkDraft('') }}
                className={`flex min-h-[54px] flex-col items-center gap-[3px] rounded-[10px] pb-1 pt-0.5
                  ${e || hasMark ? 'bg-[var(--color-card)] active:scale-95' : ''}
                  ${today ? 'ring-1 ring-[var(--color-ink)]' : ''}
                  ${dayPick === day ? 'ring-1 ring-[var(--color-ink-2)]' : ''}`}>
                <span className={`text-[9px] leading-none ${hasMark ? 'font-bold text-[color:var(--color-ink)]' : 'text-[color:var(--color-ink-4)]'}`}>
                  {day}{hasMark ? ' ·' : ''}
                </span>
                {e?.her && <MoodFace face={s(e.her.face)} shape="round" size={15} />}
                {e?.him && <MoodFace face={s(e.him.face)} shape="square" size={15} />}
              </button>
            )
          })}
        </div>

        {/* 点开的那天：两个人的记录 + 标注 */}
        {dayPick && (
          <div className="mt-3 rounded-[var(--radius-xs)] border border-[var(--color-line)] bg-[var(--color-card)] p-3">
            <p className="mb-2 text-[10px] tracking-[2px] text-[color:var(--color-ink-3)]">{month + 1} 月 {dayPick} 日</p>
            {pickMark && (
              <div className="mb-2 flex items-center gap-2">
                <span className="rounded-full border border-[var(--color-ink-3)] bg-[var(--color-surface)] px-2.5 py-0.5 text-[10.5px] text-[color:var(--color-ink-2)]">◆ {s(pickMark.label)}</span>
                <button onClick={async () => { await colDel('mood', s(pickMark.id)); void load() }}
                  className="text-[12px] text-[color:var(--color-ink-4)]">×</button>
              </div>
            )}
            {pick?.her && (
              <div className="mb-1.5 flex items-start gap-2">
                <MoodFace face={s(pick.her.face)} shape="round" size={22} />
                <p className="min-w-0 flex-1 text-[12.5px] leading-snug">{s(pick.her.name)}{s(pick.her.note) ? ' · ' + s(pick.her.note) : ''}</p>
              </div>
            )}
            {pick?.him && (
              <div className="mb-1.5 flex items-start gap-2">
                <MoodFace face={s(pick.him.face)} shape="square" size={22} />
                <p className="min-w-0 flex-1 text-[12.5px] leading-snug">{s(pick.him.name)}{s(pick.him.note) ? ' · ' + s(pick.him.note) : ''}</p>
              </div>
            )}
            {!pick?.her && !pick?.him && !pickMark && (
              <p className="mb-1.5 text-[11.5px] text-[color:var(--color-ink-3)]">这天还没有记录。</p>
            )}
            <div className="mt-2 flex items-center gap-2 border-t border-[var(--color-line)] pt-2">
              <input value={markDraft} onChange={e => setMarkDraft(e.target.value)} maxLength={20}
                onKeyDown={e => { if (e.key === 'Enter') void saveMark(pickDateStr) }}
                placeholder={pickMark ? '改标注…' : '给这天做个标注（纪念日、大事…）'}
                className="min-w-0 flex-1 bg-transparent px-1 text-[11.5px] outline-none placeholder:text-[color:var(--color-ink-4)]" />
              {markDraft.trim() && (
                <button onClick={() => void saveMark(pickDateStr)} disabled={busy}
                  className="shrink-0 rounded-full bg-[var(--color-ink)] px-3 py-1 text-[10.5px] text-[color:var(--color-surface)]">标上</button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 最近（两个人混排，圆方自证身份） */}
      <ul>
        {moods.slice(0, 12).map(i => (
          <li key={i.id} className="flex items-center gap-3 border-b border-[var(--color-line)] py-2.5 last:border-b-0">
            <MoodFace face={s(i.face)} shape={(s(i.by) || 'user') === 'ai' ? 'square' : 'round'} size={20} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px]">{s(i.name)}{s(i.note) ? ' · ' + s(i.note) : ''}</p>
              <p className="text-[10.5px] text-[color:var(--color-ink-3)]">{s(i.ts).slice(5, 16).replace('T', ' ')}</p>
            </div>
            <button onClick={async () => { await colDel('mood', i.id); void load() }}
              className="px-1 text-[14px] text-[color:var(--color-ink-4)]">×</button>
          </li>
        ))}
        {moods.length === 0 && (
          <p className="py-8 text-center text-[12px] text-[color:var(--color-ink-3)]">还没记过。点上面那排脸，一下就好。</p>
        )}
      </ul>
    </section>
  )
}

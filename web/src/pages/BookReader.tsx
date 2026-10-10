import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { userName, aiName } from '../lib/identity'
import { colAdd } from '../lib/api'
import {
  identityLabel, listChapters, listMarks, listProgress, upsertProgress,
  type Book, type BookMark, type BookProgress, type Chapter, type ReaderIdentity,
} from './booksData'

type Filter = 'all' | ReaderIdentity
type Sheet = 'chapters' | 'marks' | null

function MarkedParagraph({ text, marks, onNote }: { text: string; marks: BookMark[]; onNote: (m: BookMark) => void }) {
  const parts: { text: string; mark?: BookMark }[] = []
  let cursor = 0
  const located = marks.map((mark) => ({ mark, at: text.indexOf(mark.quote) }))
    .filter((x) => x.at >= 0).sort((a, b) => a.at - b.at)
  for (const { mark, at } of located) {
    if (at < cursor) continue
    if (at > cursor) parts.push({ text: text.slice(cursor, at) })
    parts.push({ text: mark.quote, mark })
    cursor = at + mark.quote.length
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) })
  return <p className="mb-7 whitespace-pre-wrap">{parts.map((part, i) => part.mark ? (
    <span key={i} data-book-mark={part.mark.id} className={part.mark.by === 'user'
      ? 'rounded-[3px] bg-[var(--color-ink-4)]/55 px-[2px]'
      : 'border-b border-[var(--color-ink-2)] px-[1px]'}>
      {part.text}{part.mark.note && <button onClick={() => onNote(part.mark!)} className="ml-1 align-super text-[10px]">◌</button>}
    </span>
  ) : <span key={i}>{part.text}</span>)}</p>
}

export default function BookReader({ book, identity, onBack }: {
  book: Book; identity: ReaderIdentity; onBack: () => void
}) {
  const [chapters, setChapters] = useState<Chapter[]>([])
  const [marks, setMarks] = useState<BookMark[]>([])
  const [progress, setProgress] = useState<BookProgress[]>([])
  const [chapterIdx, setChapterIdx] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')
  const [sheet, setSheet] = useState<Sheet>(null)
  const [selection, setSelection] = useState<{ quote: string; x: number; y: number } | null>(null)
  const article = useRef<HTMLElement>(null)
  const pendingMark = useRef<string | null>(null)

  const load = useCallback(async () => {
    const [allChapters, allMarks, allProgress] = await Promise.all([listChapters(), listMarks(), listProgress()])
    setChapters(allChapters.filter((c) => c.book_id === book.id).sort((a, b) => Number(a.idx) - Number(b.idx)))
    setMarks(allMarks.filter((m) => m.book_id === book.id))
    const own = allProgress.filter((p) => p.book_id === book.id)
    setProgress(own)
    setChapterIdx(Number(own.find((p) => p.by === identity)?.chapter_idx ?? 0))
  }, [book.id, identity])
  useEffect(() => { void load() }, [load])

  const chapter = chapters[chapterIdx] || chapters[0]
  const visibleMarks = marks.filter((m) => m.chapter_idx === chapterIdx && (filter === 'all' || m.by === filter))
  const paragraphs = useMemo(() => (chapter?.text || '').split(/\n\s*\n/).filter(Boolean), [chapter])
  const her = Number(progress.find((p) => p.by === 'user')?.chapter_idx ?? 0) + 1
  const him = Number(progress.find((p) => p.by === 'ai')?.chapter_idx ?? 0) + 1

  const go = async (idx: number) => {
    if (idx < 0 || idx >= chapters.length) return
    setChapterIdx(idx); window.scrollTo(0, 0)
    await upsertProgress(book.id, identity, idx, progress)
    setProgress(await listProgress().then((rows) => rows.filter((p) => p.book_id === book.id)))
  }

  useEffect(() => {
    const detect = () => {
      const s = window.getSelection()
      const quote = s?.toString().trim() || ''
      if (!quote || !s?.rangeCount || !article.current?.contains(s.anchorNode)) { setSelection(null); return }
      const r = s.getRangeAt(0).getBoundingClientRect()
      setSelection({ quote: quote.slice(0, 800), x: Math.min(innerWidth - 154, Math.max(12, r.left + r.width / 2 - 75)), y: Math.max(62, r.top - 48) })
    }
    document.addEventListener('selectionchange', detect)
    return () => document.removeEventListener('selectionchange', detect)
  }, [])

  const saveMark = async (type: 'highlight' | 'bookmark', withNote = false) => {
    if (!selection || !chapter) return
    const note = withNote ? prompt('写下批注')?.trim() : ''
    if (withNote && !note) return
    await colAdd('book_marks', { book_id: book.id, chapter_idx: chapterIdx, quote: selection.quote, type, note, by: identity, at: new Date().toISOString() })
    window.getSelection()?.removeAllRanges(); setSelection(null)
    setMarks((await listMarks()).filter((m) => m.book_id === book.id))
  }

  useEffect(() => {
    if (!pendingMark.current) return
    const id = pendingMark.current
    pendingMark.current = null
    requestAnimationFrame(() => article.current?.querySelector<HTMLElement>(`[data-book-mark="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }, [chapterIdx, marks])

  const jumpMark = (m: BookMark) => {
    pendingMark.current = m.id; setFilter('all'); setSheet(null); void go(Number(m.chapter_idx))
    setTimeout(() => article.current?.querySelector<HTMLElement>(`[data-book-mark="${CSS.escape(m.id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120)
  }

  return <section className="absolute inset-0 flex flex-col bg-[var(--color-bg)]">
    <header className="shrink-0 border-b border-[var(--color-line)] bg-[var(--color-bg)] px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="loop-back grid h-9 w-9 place-items-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]">‹</button>
        <div className="min-w-0 flex-1 text-center"><p className="truncate text-[11px] text-[color:var(--color-ink-2)]">{book.title}</p><h2 className="truncate font-[family-name:var(--font-display)] text-[17px]">{chapter?.title || '尚无正文'}</h2></div>
        <span className="w-9"/>
      </div>
      <div className="mt-3 flex items-center justify-between text-[10px] text-[color:var(--color-ink-3)]">
        <button onClick={() => setSheet('marks')}>{userName()}读到第 {her} 章 · {aiName()}读到第 {him} 章　♧</button>
        <span className="flex rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] p-0.5">
          {(['all','user','ai'] as Filter[]).map((f) => <button key={f} onClick={() => setFilter(f)} className={`rounded-full px-2 py-1 ${filter === f ? 'bg-[var(--color-ink)] text-[color:var(--color-surface)]' : ''}`}>{f === 'all' ? '全部' : f === 'user' ? `只看${userName()}的` : `只看${aiName()}的`}</button>)}
        </span>
      </div>
    </header>

    <main className="min-h-0 flex-1 overflow-y-auto px-7 py-10">
      <article ref={article} className="mx-auto max-w-[680px] select-text font-[family-name:var(--font-display)] text-[18px] leading-[2.05] tracking-[0.02em]">
        {paragraphs.length ? paragraphs.map((p, i) => <MarkedParagraph key={i} text={p} marks={visibleMarks} onNote={(m) => alert(`${identityLabel(m.by)} · ${new Date(m.at).toLocaleString()}\n\n${m.note}`)} />) : <p className="text-center text-[color:var(--color-ink-3)]">这本书还没有导入正文。</p>}
      </article>
    </main>

    <footer className="flex shrink-0 items-center border-t border-[var(--color-line)] bg-[var(--color-surface)] px-4 pb-[max(.75rem,env(safe-area-inset-bottom))] pt-3 text-[12px]">
      <button onClick={() => void go(chapterIdx - 1)} disabled={chapterIdx <= 0} className="flex-1 disabled:opacity-25">上一章</button>
      <button onClick={() => setSheet('chapters')} className="flex-1 border-x border-[var(--color-line)]">章节目录 · {chapterIdx + 1}/{Math.max(1, chapters.length)}</button>
      <button onClick={() => void go(chapterIdx + 1)} disabled={chapterIdx >= chapters.length - 1} className="flex-1 disabled:opacity-25">下一章</button>
    </footer>

    {selection && <div style={{ left: selection.x, top: selection.y }} className="fixed z-[180] flex overflow-hidden rounded-full bg-[var(--color-ink)] text-[11px] text-[color:var(--color-surface)] shadow-[var(--shadow-md)]">
      <button onClick={() => void saveMark('highlight')} className="px-3 py-2">标注</button><button onClick={() => void saveMark('highlight', true)} className="border-x border-white/20 px-3 py-2">写批注</button><button onClick={() => void saveMark('bookmark')} className="px-3 py-2">书签</button>
    </div>}

    {sheet && <div className="fixed inset-0 z-[170] flex items-end bg-black/20" onClick={() => setSheet(null)}><div onClick={(e) => e.stopPropagation()} className="max-h-[72vh] w-full overflow-y-auto rounded-t-[var(--radius-lg)] bg-[var(--color-surface)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5">
      <div className="mb-5 flex items-center justify-between"><h3 className="font-[family-name:var(--font-display)] text-[20px]">{sheet === 'chapters' ? '章节目录' : '双人书签'}</h3><button onClick={() => setSheet(null)}>✕</button></div>
      {sheet === 'chapters' ? chapters.map((c) => <button key={c.id} onClick={() => { setSheet(null); void go(Number(c.idx)) }} className="flex w-full items-center justify-between border-b border-[var(--color-line)] py-4 text-left"><span>{c.title}</span><small className="text-[color:var(--color-ink-3)]">{Number(c.idx) + 1}</small></button>) :
        <div className="grid grid-cols-2 gap-4">{(['user','ai'] as ReaderIdentity[]).map((by) => <div key={by}><p className="mb-2 text-[11px] text-[color:var(--color-ink-3)]">{identityLabel(by)}</p>{marks.filter((m) => m.by === by && m.type === 'bookmark').map((m) => <button key={m.id} onClick={() => jumpMark(m)} className="mb-2 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] p-3 text-left text-[11px]"><span className="line-clamp-3">“{m.quote}”</span><small className="mt-2 block text-[color:var(--color-ink-3)]">第 {Number(m.chapter_idx) + 1} 章</small></button>)}</div>)}</div>}
    </div></div>}
  </section>
}

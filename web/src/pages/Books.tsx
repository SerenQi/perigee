import { useCallback, useEffect, useRef, useState } from 'react'
import { colAdd, colDel } from '../lib/api'
import BookReader from './BookReader'
import { identityLabel, listBooks, listChapters, listMarks, listProgress, patchCol, splitBookText, type Book, type BookMark, type BookStatus, type ReaderIdentity } from './booksData'
import { parseEpub, type ParsedEpub } from './epub'

const STATUS: Record<BookStatus, string> = { reading: '在读', want: '想读', done: '读完' }
const order: BookStatus[] = ['reading', 'want', 'done']
function tally(marks: BookMark[], bookId: string, by: ReaderIdentity) {
  const mine = marks.filter((m) => m.book_id === bookId && m.by === by)
  return { hl: mine.filter((m) => m.type === 'highlight' && !m.note).length, note: mine.filter((m) => m.type === 'highlight' && m.note).length, bm: mine.filter((m) => m.type === 'bookmark').length }
}
const Tally = ({ marks, bookId, by }: { marks: BookMark[]; bookId: string; by: ReaderIdentity }) => {
  const t = tally(marks, bookId, by)
  return <span className="whitespace-nowrap">标注 {t.hl} · 批注 {t.note} · 书签 {t.bm}</span>
}

function readRouteId() {
  const m = location.pathname.match(/\/books\/([^/]+)\/read\/?$/)
  return m ? decodeURIComponent(m[1]) : null
}

export default function Books({ onBack }: { onBack: () => void }) {
  const [books, setBooks] = useState<Book[]>([])
  const [markCount, setMarkCount] = useState(0)
  const [marks, setMarks] = useState<BookMark[]>([])
  // 页面永远是用户；AI 的标注/短评从服务端接口进来，各署各名，不用选。
  const identity: ReaderIdentity = 'user'
  const [selected, setSelected] = useState<Book | null>(null)
  const [reading, setReading] = useState<Book | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ title: '', author: '', status: 'want' as BookStatus })
  const [file, setFile] = useState<File | null>(null)
  const [epub, setEpub] = useState<ParsedEpub | null>(null)
  const [parsing, setParsing] = useState(false)
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function pickFile(next: File | null) {
    setFile(next); setEpub(null)
    if (!next || !/\.epub$/i.test(next.name)) return
    setParsing(true)
    try {
      const parsed = await parseEpub(next)
      setEpub(parsed)
      setForm((old) => ({ ...old, title: parsed.title || old.title, author: parsed.author || old.author }))
    } catch (e) { setFile(null); alert(e instanceof Error ? e.message : 'EPUB 解析失败') }
    finally { setParsing(false) }
  }

  const load = useCallback(async () => {
    const [b, m] = await Promise.all([listBooks(), listMarks()])
    setBooks(b.sort((a, z) => String(z.added_at || z.ts).localeCompare(String(a.added_at || a.ts))))
    setMarkCount(m.length); setMarks(m)
    const routeId = readRouteId(); if (routeId) setReading(b.find((x) => x.id === routeId) || null)
  }, [])
  useEffect(() => { void load() }, [load])

  const openReader = (book: Book) => {
    history.pushState({}, '', `${import.meta.env.BASE_URL}books/${encodeURIComponent(book.id)}/read`)
    setReading(book)
  }
  const closeReader = () => { history.replaceState({}, '', import.meta.env.BASE_URL); setReading(null) }

  async function addBook() {
    if (!form.title.trim() || busy) return
    setBusy(true)
    try {
      const clientKey = crypto.randomUUID(); const addedAt = new Date().toISOString()
      const ok = await colAdd('books', { title: form.title.trim(), author: form.author.trim(), status: form.status, added_at: addedAt, client_key: clientKey, cover: epub?.cover })
      if (!ok) throw new Error('书籍保存失败')
      const saved = (await listBooks()).find((b) => b.client_key === clientKey)
      if (!saved) throw new Error('没有找到刚添加的书')
      if (file) {
        const chapters = epub?.chapters || splitBookText(await file.text())
        for (const c of chapters) {
          if (!await colAdd('book_chapters', { book_id: saved.id, idx: c.idx, title: c.title, text: c.text })) throw new Error(`第 ${c.idx + 1} 章保存失败`)
        }
      }
      setForm({ title: '', author: '', status: 'want' }); setFile(null); setEpub(null); setAdding(false); await load(); setSelected(saved)
    } catch (e) { alert(e instanceof Error ? e.message : '导入失败') } finally { setBusy(false) }
  }

  async function removeBook() {
    if (!selected || busy) return
    if (!confirm(`把《${selected.title}》从书架上拿走吗？\n它的章节、标注、书签、进度会一起清掉。`)) return
    setBusy(true)
    try {
      const [chs, mks, prg] = await Promise.all([listChapters(), listMarks(), listProgress()])
      for (const c of chs.filter((x) => x.book_id === selected.id)) await colDel('book_chapters', c.id)
      for (const m of mks.filter((x) => x.book_id === selected.id)) await colDel('book_marks', m.id)
      for (const p of prg.filter((x) => x.book_id === selected.id)) await colDel('book_progress', p.id)
      await colDel('books', selected.id)
      setSelected(null); await load()
    } finally { setBusy(false) }
  }

  async function updateMine(patch: Record<string, unknown>) {
    if (!selected) return
    await patchCol('books', selected.id, patch); const next = (await listBooks()).find((b) => b.id === selected.id) || selected
    setSelected(next); await load()
  }

  if (reading) return <BookReader book={reading} identity={identity} onBack={closeReader} />

  const counts = { reading: books.filter((b) => b.status === 'reading').length, want: books.filter((b) => b.status === 'want').length, done: books.filter((b) => b.status === 'done').length }
  return <section className="absolute inset-0 overflow-y-auto bg-[var(--color-bg)] px-5 pb-10 pt-[max(1.25rem,env(safe-area-inset-top))]">
    <header className="mb-5 flex items-center justify-between">
      <button onClick={onBack} className="loop-back grid h-9 w-9 place-items-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]">‹</button>
      <button onClick={() => setAdding(true)} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] text-lg shadow-[var(--shadow-xs)]">＋</button>
    </header>

    {order.map((status) => { const group = books.filter((b) => b.status === status); return group.length ? <section key={status} className="mb-6">
      <p className="mb-1 text-[10px] tracking-[2px] text-[color:var(--color-ink-3)]">{STATUS[status]}</p>
      {group.map((b) => <button key={b.id} onClick={() => setSelected(b)} className="flex w-full items-start gap-4 border-b border-[var(--color-line)] py-4 text-left">{b.cover ? <img src={b.cover} alt="" className="h-[68px] w-[48px] shrink-0 rounded-[5px] border border-[var(--color-line)] object-cover shadow-[var(--shadow-xs)]"/> : <div className="h-[68px] w-[48px] shrink-0 rounded-[5px] border border-[var(--color-line)] bg-[var(--color-card)] shadow-[var(--shadow-xs)]"/>}<div className="min-w-0 flex-1"><h3 className="truncate font-[family-name:var(--font-display)] text-[18px]">{b.title}</h3><p className="mb-2 truncate text-[11px] text-[color:var(--color-ink-3)]">{b.author || '佚名'}</p><p className="text-[10px] leading-relaxed text-[color:var(--color-ink-2)]"><span className="mr-1.5 text-[color:var(--color-ink-3)]">S</span><Tally marks={marks} bookId={b.id} by="user" /><br /><span className="mr-1.5 text-[color:var(--color-ink-3)]">L</span><Tally marks={marks} bookId={b.id} by="ai" /></p></div><span className="pt-5 text-[color:var(--color-ink-3)]">›</span></button>)}
    </section> : null })}
    {!books.length && <p className="py-16 text-center font-[family-name:var(--font-display)] text-[color:var(--color-ink-3)]">书架还是空的。把第一本书带回家吧。</p>}
    {books.length > 0 && <p className="mt-8 text-center text-[10px] tracking-[1px] text-[color:var(--color-ink-3)]">在读 {counts.reading} · 想读 {counts.want} · 读完 {counts.done} · 标注 {markCount}</p>}

    {adding && <div className="fixed inset-0 z-[160] flex items-end bg-black/20" onClick={() => setAdding(false)}><div onClick={(e) => e.stopPropagation()} className="w-full rounded-t-[var(--radius-lg)] bg-[var(--color-surface)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5"><div className="mb-5 flex justify-between"><h2 className="font-[family-name:var(--font-display)] text-[21px]">添加一本书</h2><button onClick={() => setAdding(false)}>✕</button></div><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="书名" className="mb-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-4 py-3 outline-none"/><input value={form.author} onChange={(e) => setForm({ ...form, author: e.target.value })} placeholder="作者（可选）" className="mb-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-4 py-3 outline-none"/><div className="mb-3 grid grid-cols-3 gap-2">{order.map((s) => <button key={s} onClick={() => setForm({ ...form, status: s })} className={`rounded-full border border-[var(--color-line)] py-2 ${form.status === s ? 'bg-[var(--color-ink)] text-[color:var(--color-surface)]' : ''}`}>{STATUS[s]}</button>)}</div><input ref={fileInput} type="file" accept=".txt,.epub,text/plain,application/epub+zip" hidden onChange={(e) => void pickFile(e.target.files?.[0] || null)}/><button onClick={() => fileInput.current?.click()} className="mb-4 w-full rounded-[var(--radius-sm)] border border-dashed border-[var(--color-ink-3)] px-4 py-4 text-left text-[12px]">{parsing ? '正在识别 EPUB…' : epub ? `${file?.name} · ${epub.cover ? '已识别封面 ✓ · ' : ''}共 ${epub.chapters.length} 章` : file ? `已选择：${file.name}` : '导入 TXT / EPUB 正文 · 自动识别章节'}</button><button onClick={() => void addBook()} disabled={busy || parsing || !form.title.trim()} className="w-full rounded-full bg-[var(--color-ink)] py-3.5 text-[color:var(--color-surface)] disabled:opacity-30">{busy ? '正在安放到书架…' : '添加到书架'}</button></div></div>}

    {selected && <div className="fixed inset-0 z-[150] overflow-y-auto bg-[var(--color-bg)] px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]"><header className="mb-10 flex items-center"><button onClick={() => setSelected(null)} className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]">‹</button><span className="flex-1"/><span className="w-9"/></header><div className="mb-8 text-center">{selected.cover ? <img src={selected.cover} alt="" className="mx-auto mb-5 h-[130px] w-[90px] rounded-[7px] border border-[var(--color-line)] object-cover shadow-[var(--shadow-md)]"/> : <div className="mx-auto mb-5 h-[130px] w-[90px] rounded-[7px] border border-[var(--color-line)] bg-[var(--color-card)] shadow-[var(--shadow-md)]"/>}<h1 className="font-[family-name:var(--font-display)] text-[20px]">{selected.title}</h1><p className="mt-1 text-[12px] text-[color:var(--color-ink-3)]">{selected.author || '佚名'} · {STATUS[selected.status]}</p></div><div className="mb-7 grid grid-cols-2 gap-3">{(['user','ai'] as ReaderIdentity[]).map((by) => { const mine = identity === by; const vk = `review_${by}` as 'review_user'|'review_ai'; return <div key={by} className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4"><p className="mb-2 text-[10px] tracking-[2px] text-[color:var(--color-ink-3)]">{identityLabel(by)}</p><p className="text-[11px] text-[color:var(--color-ink-2)]"><Tally marks={marks} bookId={selected.id} by={by} /></p><p className="mt-3 min-h-[54px] whitespace-pre-wrap text-[12px] leading-relaxed text-[color:var(--color-ink-2)]">{selected[vk] || '还没有留下短评。'}</p>{mine && <button onClick={() => { const review = prompt('写下你的短评', String(selected[vk] || '')); if (review !== null) void updateMine({ [vk]: review.trim() }) }} className="mt-3 border-b border-[var(--color-ink-3)] text-[10px]">编辑我的短评</button>}</div> })}</div><button onClick={() => openReader(selected)} className="mb-3 w-full rounded-full bg-[var(--color-ink)] py-4 text-[color:var(--color-surface)]">开始阅读</button><select value={selected.status} onChange={(e) => void updateMine({ status: e.target.value })} className="w-full rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-center"><option value="want">想读</option><option value="reading">在读</option><option value="done">读完</option></select><button onClick={() => void removeBook()} disabled={busy} className="mt-6 w-full text-center text-[11px] text-[color:var(--color-ink-3)] underline underline-offset-4 disabled:opacity-30">从书架上拿走这本书</button></div>}
  </section>
}

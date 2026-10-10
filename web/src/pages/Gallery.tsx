import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchGallery, galleryUrl, galleryAdd, galleryDel, galleryByLabel, compressImage, colList, colAdd, colPatch, type GalleryItem, type ColItem } from '../lib/api'


type AlbumKey = 'daily' | 'her' | 'ref' | 'mark' | 'us' | 'out'
const ALBUMS: { key: AlbumKey; label: string; bg: string; edge: string; dot: string; heart: string; ink: string }[] = [
  { key: 'daily', label: '日常', bg: '#fbfbfb', edge: '#e4e4e4', dot: '#d4d4d4', heart: '#9a9a9a', ink: '#3a3a3a' },
  { key: 'her', label: '其他', bg: '#fbe6eb', edge: '#f1cdd6', dot: '#e9b5c2', heart: '#c98a9a', ink: '#3a3a3a' },
  { key: 'ref', label: '参考', bg: '#e0f3f8', edge: '#c3e4ee', dot: '#a6d7e5', heart: '#7fb8c9', ink: '#3a3a3a' },
  { key: 'mark', label: '收藏', bg: '#e3f4e6', edge: '#c8e7cf', dot: '#a9d8b4', heart: '#82b98f', ink: '#3a3a3a' },
  { key: 'us', label: '我们', bg: '#f8e6f6', edge: '#ecc9e8', dot: '#dfb0da', heart: '#be86b8', ink: '#3a3a3a' },
  { key: 'out', label: '截图', bg: '#3b3b3d', edge: '#2c2c2e', dot: '#69696c', heart: '#f2f2f2', ink: '#f4f4f4' },
]
const albumOf = (k: AlbumKey) => ALBUMS.find((a) => a.key === k)!

/** 没手动放过的照片，按标题先归一个夹子 */
function guess(p: GalleryItem): AlbumKey {
  const c = String(p.caption || '')
  if (!c.trim() && p.by !== 'ai') return 'her'
  return 'daily'
}

const SERIF = "'New York', ui-serif, 'Iowan Old Style', Georgia, 'Songti SC', 'Noto Serif SC', serif"
const MONTH_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const date = (t?: string) => String(t ?? '').slice(5, 16).replace('T', ' ')

/* 文件夹：后片 + 折角耳朵（带爱心）+ 前片（点点纹）+ 虚线小窗 */
function Folder({ a, cover, count, onOpen, bare }: { a: typeof ALBUMS[number]; cover?: string; count: number; onOpen: () => void; bare?: boolean }) {
  const dots = `radial-gradient(${a.dot} 1px, transparent 1.3px)`
  const Tag = bare ? 'div' : 'button'   // 头图里那只只是插画：用 div，皮肤不会给它套按钮样式
  return (
    <Tag onClick={onOpen} className="group flex flex-col items-stretch text-left active:scale-[.98] transition-transform">
      <div className="relative aspect-[1.32] w-full">
        {/* 耳朵 */}
        <div className="absolute left-[4%] top-0 h-[22%] w-[44%] rounded-t-[12px]"
          style={{ background: a.bg, backgroundImage: dots, backgroundSize: '7px 7px', boxShadow: `inset 0 0 0 1.5px ${a.edge}`,
            clipPath: 'polygon(0 0, 78% 0, 100% 100%, 0 100%)' }}>
          <svg viewBox="0 0 24 24" className="absolute left-[9%] top-[22%] h-[44%] w-auto" fill={a.heart}>
            <path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.6 2.9 5 6.4 5c2.1 0 3.6 1.2 4.6 2.6l1 1.3 1-1.3C14 6.2 15.5 5 17.6 5c3.5 0 5.5 3.6 4 6.8C19.5 16.4 12 21 12 21z" />
          </svg>
        </div>
        {/* 前片 */}
        <div className="absolute inset-x-0 bottom-0 top-[16%] rounded-[16px] p-[9%] shadow-[0_10px_22px_-14px_rgba(40,36,30,.45)]"
          style={{ background: a.bg, backgroundImage: dots, backgroundSize: '7px 7px', boxShadow: `inset 0 0 0 1.5px ${a.edge}, 0 10px 22px -14px rgba(40,36,30,.45)` }}>
          <div className="h-full w-full overflow-hidden rounded-[9px] p-[3px]"
            style={{ border: `1.5px dashed ${a.dot}`, background: 'rgba(255,255,255,.55)' }}>
            {cover
              ? <img src={cover} alt="" loading="lazy" className="h-full w-full rounded-[6px] object-cover" />
              : <div className="grid h-full w-full place-items-center rounded-[6px] text-[11px]" style={{ color: a.heart }}>空的</div>}
          </div>
        </div>
      </div>
      {!bare && <div className="mt-2 flex items-baseline justify-between px-1">
        <span className="text-[13.5px] font-semibold">{a.label}</span>
        <span className="text-[11px] tabular-nums text-[color:var(--color-ink-3)]">{count}</span>
      </div>}
    </Tag>
  )
}

export default function Gallery({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [marks, setMarks] = useState<ColItem[]>([])
  const [album, setAlbum] = useState<AlbumKey | null>(null)
  const [idx, setIdx] = useState(-1)
  const [moving, setMoving] = useState(false)
  const [busy, setBusy] = useState('')
  const file = useRef<HTMLInputElement>(null)

  const reload = () => { void fetchGallery().then((d) => setItems(d.items)); void colList('gallery_albums').then(setMarks) }
  useEffect(reload, [])

  const where = useMemo(() => {
    const m = new Map<string, { id: string; album: AlbumKey }>()
    marks.forEach((x) => { if (x.pid && ALBUMS.some((a) => a.key === x.album)) m.set(String(x.pid), { id: x.id, album: x.album as AlbumKey }) })
    return m
  }, [marks])
  const albumOfPhoto = (p: GalleryItem) => where.get(p.id)?.album ?? guess(p)

  const sorted = useMemo(() => items.slice().sort((a, b) => +new Date(b.ts ?? 0) - +new Date(a.ts ?? 0)), [items])
  const byAlbum = useMemo(() => {
    const m = Object.fromEntries(ALBUMS.map((a) => [a.key, [] as GalleryItem[]])) as Record<AlbumKey, GalleryItem[]>
    sorted.forEach((p) => m[albumOfPhoto(p)].push(p))
    return m
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted, where])

  const shown = album ? byAlbum[album] : []
  const cur = shown[idx]

  const months = useMemo(() => {
    const out: { key: string; label: string; list: GalleryItem[] }[] = []
    shown.forEach((p) => {
      const d = new Date(p.ts ?? 0)
      const key = isNaN(+d) ? '未知' : `${d.getFullYear()}-${d.getMonth() + 1}`
      const label = isNaN(+d) ? '未知' : `${MONTH_EN[d.getMonth()]} ${d.getFullYear()}`
      const g = out.find((x) => x.key === key)
      if (g) g.list.push(p); else out.push({ key, label, list: [p] })
    })
    return out
  }, [shown])

  async function place(pid: string, to: AlbumKey) {
    const had = where.get(pid)
    const ok = had ? await colPatch('gallery_albums', had.id, { album: to }) : await colAdd('gallery_albums', { pid, album: to })
    if (!ok) alert('没存上（网关还没认这个柜子，等重启）')
    return ok
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return
    const failed: string[] = []
    const before = new Set(items.map((p) => p.id))
    for (let i = 0; i < files.length; i++) {
      setBusy(`第 ${i + 1} / ${files.length} 张…`)
      try {
        const url = await compressImage(files[i])
        if (!await galleryAdd(url, files[i].name)) failed.push(files[i].name)
      } catch { failed.push(files[i].name) }
    }
    // 在哪个夹子里传的，就放进哪个夹子
    if (album) {
      const fresh = (await fetchGallery()).items.filter((p) => !before.has(p.id))
      for (const p of fresh) if (guess(p) !== album) await place(p.id, album)
    }
    setBusy(''); reload()
    if (failed.length) alert('有 ' + failed.length + ' 张没传上去：\n' + failed.join('\n'))
  }

  async function moveTo(to: AlbumKey) {
    if (!cur) return
    setMoving(false)
    if (to === album) return
    if (await place(cur.id, to)) { setIdx(-1); reload() }
  }

  const a = album ? albumOf(album) : null

  return (
    <section className="absolute inset-0 overflow-y-auto px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => (album ? (setAlbum(null), setIdx(-1)) : onBack())}
          className="loop-back text-[length:var(--text-sub)] text-[color:var(--color-ink-2)]">‹ {album ? '图库' : '返回'}</button>
        <button onClick={() => file.current?.click()}
          className="rounded-full bg-[var(--color-ink)] px-4 py-1.5 text-[length:var(--text-sub)] text-[color:var(--color-surface)]">
          + 放进来
        </button>
        <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { void upload(e.target.files); e.target.value = '' }} />
      </div>

      {!a ? (
        <>
          <h2 className="text-[20px] font-bold tracking-tight">图库</h2>
          <p className="mb-5 text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">
            {busy || (items.length ? `${items.length} 张 · 六个夹子` : '')}
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-5">
            {ALBUMS.map((x) => {
              const list = byAlbum[x.key]
              return <Folder key={x.key} a={x} count={list.length} cover={list[0] ? galleryUrl(list[0].id, list[0].ext) : undefined}
                onOpen={() => { setAlbum(x.key); setIdx(-1) }} />
            })}
          </div>
        </>
      ) : (
        <div>
          <div className="mb-5 flex items-center gap-4 rounded-[24px] px-4 py-4"
            style={{ background: a.key === 'out' ? 'linear-gradient(135deg, #e9e9eb, #f6f6f7)' : `linear-gradient(135deg, ${a.bg}, #fbfbfb)`,
              boxShadow: `inset 0 0 0 1px ${a.key === 'out' ? '#dcdcdf' : a.edge}` }}>
            <div className="w-[92px] shrink-0">
              <Folder a={a} count={shown.length} cover={shown[0] ? galleryUrl(shown[0].id, shown[0].ext) : undefined} onOpen={() => {}} bare />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[21px] font-bold leading-tight tracking-tight">{a.label}</div>
              <p className="mt-1 text-[12px] text-[color:var(--color-ink-3)]">
                {busy || (shown.length ? `${shown.length} 张${shown[0]?.ts ? ` · 最近 ${date(shown[0].ts).slice(0, 5).replace('-', '.')}` : ''}` : '还是空的 · 点右上角放进来')}
              </p>
            </div>
          </div>
          {months.map((m) => (
            <div key={m.key} className="mb-5">
              <div className="mb-2 flex items-baseline justify-between px-0.5">
                <span className="text-[17px] italic" style={{ fontFamily: SERIF }}>{m.label}</span>
                <span className="text-[11px] tabular-nums text-[color:var(--color-ink-3)]">{m.list.length} 张</span>
              </div>
              <div className="grid grid-cols-3 gap-[3px] overflow-hidden rounded-[14px]">
                {m.list.map((p) => (
                  <button key={p.id} onClick={() => setIdx(shown.findIndex((x) => x.id === p.id))} className="active:opacity-80">
                    <img src={galleryUrl(p.id, p.ext)} alt={p.name} loading="lazy" className="aspect-square w-full bg-black/[.04] object-cover" />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {cur && (
        <div className="fixed inset-0 z-[140] flex flex-col bg-black/92"
             onClick={(e) => { if (e.target === e.currentTarget) { setIdx(-1); setMoving(false) } }}>
          <div className="flex shrink-0 items-center justify-between gap-4 p-4 pt-[max(1rem,env(safe-area-inset-top))] text-white/80">
            <button onClick={() => { setIdx(-1); setMoving(false) }}>关闭</button>
            <span className="text-[12px]">{idx + 1} / {shown.length}</span>
            <span className="flex gap-4">
              <button onClick={() => setMoving((v) => !v)}>移到</button>
              <button onClick={async () => {
                if (!confirm('确定删除这张照片吗？删了就真的没有了。')) return
                if (await galleryDel(cur.id)) { setIdx(-1); reload() } else alert('删除失败')
              }}>删除</button>
            </span>
          </div>
          {moving && (
            <div className="relative z-10 mx-4 mb-2 grid shrink-0 grid-cols-3 gap-2">
              {ALBUMS.map((x) => (
                <button key={x.key} onClick={() => void moveTo(x.key)}
                  className={`flex items-center gap-2 rounded-full px-3 py-2 text-[12px] ${x.key === album ? 'opacity-40' : ''}`}
                  style={{ background: x.bg, color: x.ink }}>
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: x.heart }} />
                  <span className="truncate">{x.label}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex min-h-0 flex-1 items-center justify-center px-2">
            <img src={galleryUrl(cur.id, cur.ext)} alt={cur.name} className="max-h-full max-w-full rounded-[var(--radius-md)]" />
          </div>
          <div className="shrink-0 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 text-center text-white/75">
            <p className="max-h-[18vh] overflow-y-auto text-[13px] leading-relaxed">{cur.caption || cur.name}</p>
            <p className="mt-1 text-[11px] text-white/45">{galleryByLabel(cur.by)} 放进来的 · {date(cur.ts)}</p>
          </div>
          <div className="absolute bottom-0 left-0 top-24 flex w-16 items-center justify-center text-3xl text-white/50"
               onClick={() => setIdx((idx - 1 + shown.length) % shown.length)}>‹</div>
          <div className="absolute bottom-0 right-0 top-24 flex w-16 items-center justify-center text-3xl text-white/50"
               onClick={() => setIdx((idx + 1) % shown.length)}>›</div>
        </div>
      )}
    </section>
  )
}

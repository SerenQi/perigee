import { API_BASE } from '../lib/config'
import { useEffect, useRef, useState } from 'react'
import { colList, colAdd, colDel, uploadImages, type ColItem } from '../lib/api'


const API = API_BASE
type Step = { text: string; done: boolean }
type Line = { name: string; steps: Step[]; note?: string; forkFrom?: { li: number; si: number } }
type Dir = 'up' | 'down' | 'left' | 'right'
type MindNode = { text: string; children: MindNode[]; up?: MindNode[]; left?: MindNode[]; right?: MindNode[] }
type Project = ColItem & { name?: string; desc?: string; lines?: Line[]; tree?: MindNode[]; note?: string; images?: string[] }

/* 旧的步骤线数据一次性转成思维树 */
const linesToTree = (lines: Line[]): MindNode[] =>
  lines.map((l) => ({ text: l.name + (l.note ? `（${l.note}）` : ''), children: (l.steps ?? []).map((s) => ({ text: s.text, children: [] })) }))
type Material = ColItem & { category?: string; title?: string; text?: string; images?: string[]; kind?: 'card' | 'file'; lang?: 'html' | 'md' | 'txt'; code?: string }
type Sticky = ColItem & { text?: string; color?: string; x?: number; y?: number; rot?: number }

/* 真便签：自由画布上可拖动、可重叠、方向各歪各的 */
function StickyNote({ s, onSave, onDelete }: { s: Sticky; onSave: (x: number, y: number) => void; onDelete: () => void }) {
  const seed = (s.id ?? '??').split('').reduce((a, c) => a + c.charCodeAt(0), 0)
  const [pos, setPos] = useState({ x: s.x ?? 12 + (seed * 37) % 55, y: s.y ?? 8 + (seed * 53) % 70 })
  const [top, setTop] = useState(false)
  const grab = useRef<{ dx: number; dy: number; el: HTMLElement | null }>({ dx: 0, dy: 0, el: null })
  const rot = s.rot ?? ((seed % 13) - 6)

  const down = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    const parent = el.parentElement!.getBoundingClientRect()
    grab.current = { dx: e.clientX - parent.left - (pos.x / 100) * parent.width, dy: e.clientY - parent.top - (pos.y / 100) * parent.height, el }
    el.setPointerCapture(e.pointerId); setTop(true)
  }
  const move = (e: React.PointerEvent) => {
    if (!grab.current.el) return
    const parent = grab.current.el.parentElement!.getBoundingClientRect()
    const x = Math.max(0, Math.min(78, ((e.clientX - parent.left - grab.current.dx) / parent.width) * 100))
    const y = Math.max(0, Math.min(92, ((e.clientY - parent.top - grab.current.dy) / parent.height) * 100))
    setPos({ x, y })
  }
  const up = () => { if (grab.current.el) { grab.current.el = null; onSave(pos.x, pos.y) } }

  return (
    <div onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      className="absolute w-[44%] cursor-grab touch-none select-none rounded-[2px] p-3.5 text-[13.5px] leading-relaxed
                 shadow-[0_3px_10px_rgba(0,0,0,.13)] active:cursor-grabbing"
      style={{ left: `${pos.x}%`, top: `${pos.y}%`, background: s.color || '#FFF6C9',
               transform: `rotate(${rot}deg)`, zIndex: top ? 30 : 10 + (seed % 10) }}>
      {/* 胶带头 */}
      <span className="absolute -top-[7px] left-1/2 h-[14px] w-[38px] -translate-x-1/2 rotate-[-2deg] bg-white/45 shadow-[0_1px_2px_rgba(0,0,0,.06)]" />
      {s.text}
      <button onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); if (confirm('撕掉这张？')) onDelete() }}
        className="absolute -right-2 -top-2 grid h-[26px] w-[26px] place-items-center rounded-full bg-black/15 text-[12px] leading-none">✕</button>
      <div className="mt-1.5 text-right text-[9px] opacity-40">{String(s.ts).slice(5, 10)}</div>
    </div>
  )
}

const MAT_CATS = ['风格库', '参考图', '概念图', '文案存货', '灵感截图', '其他']
const STICKY_COLORS = ['#FFF6C9', '#FFE0E0', '#DDEEFF', '#E2F4E4', '#F0E4FF', '#FFEBD6']


async function colPatch(name: string, id: string, patch: Record<string, unknown>) {
  await fetch(`${API}/col/${name}/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  }).catch(() => {})
}


function MindTree({ nodes, depth, onChange }: { nodes: MindNode[]; depth: number; onChange: (next: MindNode[]) => void }) {
  const [menu, setMenu] = useState<number | null>(null)
  const edit = (i: number) => {
    const v = prompt('改这个想法（清空=删掉整枝）：', nodes[i].text); if (v === null) return
    const next = structuredClone(nodes)
    if (!v.trim()) {
      const has = next[i].children.length || (next[i].up ?? []).length || (next[i].left ?? []).length || (next[i].right ?? []).length
      if (has && !confirm('这枝还连着别的想法，一起删？')) return
      next.splice(i, 1)
    } else next[i].text = v.trim()
    onChange(next); setMenu(null)
  }
  const grow = (i: number, dir: Dir) => {
    const label = { up: '往上——这想法的前提是什么', down: '往下——接着这个想法写', left: '往左——另一种可能', right: '往右——并列的下一步' }[dir]
    const v = prompt(label + '：')?.trim(); setMenu(null); if (!v) return
    const next = structuredClone(nodes)
    const key = dir === 'down' ? 'children' : dir
    const arr = (next[i] as unknown as Record<string, MindNode[]>)[key] ?? []
    arr.push({ text: v, children: [] })
    ;(next[i] as unknown as Record<string, MindNode[]>)[key] = arr
    onChange(next)
  }
  const setSub = (i: number, key: 'children' | 'up' | 'left' | 'right', sub: MindNode[]) => {
    const next = structuredClone(nodes)
    ;(next[i] as unknown as Record<string, MindNode[]>)[key] = sub
    onChange(next)
  }

  return (
    <div className={depth ? 'ml-[9px] border-l border-[var(--color-ink-4)] pl-3' : ''}>
      {nodes.map((n, i) => (
        <div key={i} className="relative pt-1.5">
          {depth > 0 && <span className="absolute -left-3 top-[17px] h-px w-3 bg-[var(--color-ink-4)]" />}

          {/* 上枝：前提，画在节点上面 */}
          {(n.up ?? []).length > 0 && (
            <div className="mb-1 ml-2 border-l-2 border-dashed border-[var(--color-ink-4)] pl-3">
              <div className="mb-0.5 text-[10px] tracking-[1px] text-[color:var(--color-ink-4)]">前提</div>
              <MindTree nodes={n.up ?? []} depth={depth + 1} onChange={(sub) => setSub(i, 'up', sub)} />
            </div>
          )}

          <div className="flex items-start gap-1.5">
            <span onClick={() => edit(i)} className="min-w-0 flex-1 cursor-pointer whitespace-pre-wrap py-1 text-[15px] leading-[1.6]">{n.text}</span>
            <button onClick={() => setMenu(menu === i ? null : i)}
              className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full border border-[var(--color-line)] bg-[var(--color-card)] text-[18px] text-[color:var(--color-ink)]">＋</button>
          </div>

          {/* 四向菜单 */}
          {menu === i && (
            <div className="my-1.5 grid grid-cols-3 gap-1.5 rounded-[14px] border border-[var(--color-line)] bg-[var(--color-card)] p-2">
              <span />
              <button onClick={() => grow(i, 'up')} className="rounded-[10px] bg-[var(--color-surface)] py-2.5 text-[13px]">↑ 前提</button>
              <span />
              <button onClick={() => grow(i, 'left')} className="rounded-[10px] bg-[var(--color-surface)] py-2.5 text-[13px]">← 另一种</button>
              <button onClick={() => setMenu(null)} className="rounded-[10px] py-2.5 text-[12px] text-[color:var(--color-ink-3)]">收起</button>
              <button onClick={() => grow(i, 'right')} className="rounded-[10px] bg-[var(--color-surface)] py-2.5 text-[13px]">并列 →</button>
              <span />
              <button onClick={() => grow(i, 'down')} className="rounded-[10px] bg-[var(--color-surface)] py-2.5 text-[13px]">↓ 往下</button>
              <span />
            </div>
          )}

          {/* 左枝：另一种可能 */}
          {(n.left ?? []).length > 0 && (
            <div className="ml-2 border-l-2 border-dotted border-[var(--color-ink-3)] pl-3">
              <div className="mb-0.5 text-[10px] tracking-[1px] text-[color:var(--color-ink-4)]">另一种</div>
              <MindTree nodes={n.left ?? []} depth={depth + 1} onChange={(sub) => setSub(i, 'left', sub)} />
            </div>
          )}

          {/* 下枝：正常延长 */}
          {n.children.length > 0 && (
            <MindTree nodes={n.children} depth={depth + 1} onChange={(sub) => setSub(i, 'children', sub)} />
          )}

          {/* 右枝：并列的下一步 */}
          {(n.right ?? []).length > 0 && (
            <div className="ml-2 border-l-2 border-[var(--color-ink-2)] pl-3">
              <div className="mb-0.5 text-[10px] tracking-[1px] text-[color:var(--color-ink-4)]">并列</div>
              <MindTree nodes={n.right ?? []} depth={depth + 1} onChange={(sub) => setSub(i, 'right', sub)} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function ProjectCard({ p, onChange, onDelete }: { p: Project; onChange: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const tree: MindNode[] = p.tree ?? (p.lines ? linesToTree(p.lines) : [])

  const save = async (patch: Record<string, unknown>) => { await colPatch('projects', p.id, patch); onChange() }
  const saveTree = (next: MindNode[]) => { void save({ tree: next }) }
  const newBranch = () => {
    const v = prompt('开一条新线——写下这条思路：')?.trim(); if (!v) return
    saveTree([...tree, { text: v, children: [] }])
  }
  const editHead = () => {
    const name = prompt('项目名：', p.name ?? ''); if (name === null) return
    const desc = prompt('一句话说明：', p.desc ?? ''); if (desc === null) return
    void save({ name: name.trim() || p.name, desc })
  }
  const addImg = async (files: FileList | null) => {
    if (!files?.length) return
    const pics = await uploadImages(Array.from(files))
    void save({ images: [...(p.images ?? []), ...pics.map((x) => x.url)] })
  }

  const count = (ns: MindNode[]): number => ns.reduce((a, n) => a + 1 + count(n.children) + count(n.up ?? []) + count(n.left ?? []) + count(n.right ?? []), 0)
  const ideaN = count(tree)
  return (
    <div className="mb-4 rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 pb-3 pt-4 shadow-[var(--shadow-xs)]">
      <div onClick={() => setOpen(!open)} className="flex cursor-pointer items-center gap-3.5">
        <span className="grid h-[56px] w-[56px] shrink-0 place-items-center rounded-[16px] border border-[var(--color-line)] bg-[var(--color-bg)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-[26px] w-[26px]"><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/></svg>
        </span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[18px] leading-tight">{p.name}</b>
          {p.desc && <span className="mt-0.5 block truncate text-[13px] text-[color:var(--color-ink-3)]">{p.desc}</span>}
        </span>
        <span onClick={(e) => { e.stopPropagation(); editHead() }} className="shrink-0 self-start rounded-full px-2 py-1 text-[11px] text-[color:var(--color-ink-3)]">项目</span>
      </div>
      <div className="mt-3 flex items-center gap-4 border-t border-[var(--color-line)] pt-2.5 text-[12.5px] text-[color:var(--color-ink-3)]">
        <span>{tree.length} 条线</span>
        <span>{ideaN} 个想法</span>
        <span className="flex-1" />
        <span>最近 · {String(p.ts).slice(5, 10).replace('-', '.')}</span>
      </div>

      {open && (
        <div className="mt-2.5 border-t border-[var(--color-line)] pt-2">
          <MindTree nodes={tree} depth={0} onChange={saveTree} />

          {(p.images ?? []).length > 0 && (
            <div className="mb-2 mt-2 flex gap-1.5 overflow-x-auto">
              {(p.images ?? []).map((src, i) => (
                <img key={i} src={src} alt="" className="h-[64px] w-[64px] shrink-0 rounded-[var(--radius-xs)] object-cover" />
              ))}
            </div>
          )}

          <div className="mt-2.5 flex flex-wrap gap-1.5">
            <button onClick={newBranch} className="rounded-full bg-[var(--color-ink)] px-5 py-2.5 text-[14px] text-[color:var(--color-surface)]">＋ 新线</button>
            <button onClick={() => fileRef.current?.click()} className="rounded-full border border-[var(--color-line)] px-4 py-2.5 text-[13px]">＋ 图片</button>
            <span className="flex-1" />
            <button onClick={() => { if (confirm(`删掉项目「${p.name}」？`)) onDelete() }}
              className="px-3 py-2 text-[12px] text-[color:var(--color-ink-4)]">删除</button>
          </div>
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addImg(e.target.files)} />
        </div>
      )}
    </div>
  )
}

export default function Studio({ onBack }: { onBack: () => void }) {
  const [view, setView] = useState<null | 'proj' | 'mat' | 'wall' | 'card' | 'file' | 'pic'>(null)
  const [projects, setProjects] = useState<Project[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [stickies, setStickies] = useState<Sticky[]>([])
  const [matCat, setMatCat] = useState('全部')
  const [query, setQuery] = useState('')
  const picFile = useRef<HTMLInputElement>(null)
  const [cardOpen, setCardOpen] = useState<Material | null>(null)

  const load = () => {
    void colList('projects').then((x) => setProjects(x as Project[]))
    void colList('materials').then((x) => setMaterials(x as Material[]))
    void colList('sticky').then((x) => setStickies(x as Sticky[]))
  }
  useEffect(load, [])

  async function addProject() {
    const name = prompt('项目名：')?.trim(); if (!name) return
    const desc = prompt('一句话说明（可空）：') ?? ''
    await colAdd('projects', { name, desc, tree: [], by: 'user' })
    load()
  }
  async function addMaterial() {
    const category = prompt(`分类（${MAT_CATS.join('/')}）：`, matCat === '全部' ? '风格库' : matCat)?.trim() || '其他'
    const title = prompt('素材标题：')?.trim(); if (!title) return
    const text = prompt('内容/链接/描述（可空）：') ?? ''
    await colAdd('materials', { category, title, text, by: 'user' })
    load()
  }
  async function addPics(fl: FileList | null) {
    if (!fl?.length) return
    const pics = await uploadImages(Array.from(fl))
    const title = prompt('这组图片叫什么？', '新图片') ?? '新图片'
    await colAdd('materials', { category: '参考图', title, images: pics.map((x) => x.url), by: 'user' })
    load()
  }
  async function addKind(kind: 'card' | 'file') {
    const title = prompt(kind === 'card' ? '卡片标题：' : '文件名：')?.trim(); if (!title) return
    if (kind === 'file') {
      const text = prompt('链接或说明（可空）：') ?? ''
      await colAdd('materials', { kind, title, text, category: '文件', by: 'user' })
    } else {
      const lang = (prompt('类型：html / md / txt', 'html') || 'html').trim() as 'html' | 'md' | 'txt'
      const code = lang === 'html'
        ? '<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <style>html, body { margin: 0; background: transparent; }</style>\n</head>\n<body></body>\n</html>'
        : ''
      await colAdd('materials', { kind, title, lang, code, category: '卡片', by: 'user' })
    }
    load()
  }
  async function addSticky() {
    const text = prompt('灵感小纸条：')?.trim(); if (!text) return
    const color = STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)]
    await colAdd('sticky', { text, color, by: 'user' })
    load()
  }

  const cards = materials.filter((m) => m.kind === 'card')
  const files = materials.filter((m) => m.kind === 'file')
  const plainMats = materials.filter((m) => !m.kind)
  const matImgs = plainMats.flatMap((m) => m.images ?? [])
  const cats = ['全部', ...MAT_CATS]
  const shownMats = (matCat === '全部' ? plainMats : plainMats.filter((m) => m.category === matCat))
    .filter((m) => !query || String(m.title).includes(query) || String(m.text ?? '').includes(query))
  const shownProjects = projects.filter((p) => !query || String(p.name).includes(query) || String(p.desc ?? '').includes(query))

  /* ── 总览页：顶部最近项目横条 + 下面一张分组清单 ── */
  if (view === null) {
    const I = (d: string) => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-[19px] w-[19px]"><path d={d} /></svg>
    const rows: { group: string; items: { key: 'proj' | 'card' | 'file' | 'pic' | 'mat' | 'wall'; label: string; count: string; icon: React.ReactNode }[] }[] = [
      { group: '工作', items: [
        { key: 'proj', label: '项目', count: `${projects.length}`, icon: I('M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12L4 7.5') },
        { key: 'card', label: '卡片', count: `${cards.length}`, icon: I('M3 7h18v12H3zM6 4.5h12') },
        { key: 'file', label: '文件', count: `${files.length}`, icon: I('M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8zM14 3v5h5') },
      ] },
      { group: '收集', items: [
        { key: 'pic', label: '图片', count: `${matImgs.length}`, icon: I('M3 6h18v13H3zM8 11a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM3 17l5-4.5 3.5 3 3-2.5L21 17') },
        { key: 'mat', label: '素材仓', count: `${plainMats.length}`, icon: I('M4 7h16v13H4zM9 7V4h6v3') },
        { key: 'wall', label: '灵感墙', count: `${stickies.length}`, icon: I('M4 4h16v11l-5 5H4zM15 20v-5h5') },
      ] },
    ]
    return (
      <section className="absolute inset-0 flex flex-col">
        <header className="flex shrink-0 items-center justify-between px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
          <button onClick={onBack} className="loop-back -ml-2 rounded-full px-2.5 py-1.5 text-[17px] text-[color:var(--color-ink-2)]">‹</button>
          <button onClick={() => void addProject()} className="rounded-full bg-[var(--color-ink)] px-4 py-1.5 text-[12.5px] text-[color:var(--color-surface)]">＋ 新项目</button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto pb-8">
          <h2 className="px-5 text-[30px] font-bold leading-tight tracking-tight">项目小屋</h2>
          <p className="mb-4 px-5 text-[12.5px] text-[color:var(--color-ink-3)]">
            {projects.length} 个项目 · {plainMats.length + matImgs.length} 份素材 · {stickies.length} 张纸条
          </p>
          {/* 最近项目：横向滑动的小卡 */}
          <div className="mb-6 flex gap-3 overflow-x-auto px-5 pb-1">
            {projects.length === 0 && (
              <button onClick={() => void addProject()} className="h-[92px] w-[160px] shrink-0 rounded-[14px] border border-dashed border-[var(--color-ink-4)] text-[12.5px] text-[color:var(--color-ink-3)]">还没有项目，点这里建一个</button>
            )}
            {projects.slice(0, 8).map((p) => (
              <button key={p.id} onClick={() => setView('proj')}
                className="flex h-[92px] w-[160px] shrink-0 flex-col justify-between rounded-[14px] bg-[var(--color-ink)] p-3 text-left text-[color:var(--color-surface)]">
                <span className="line-clamp-2 text-[14px] font-medium leading-snug">{String(p.name || '未命名')}</span>
                <span className="truncate text-[11px] opacity-60">{String(p.desc || '')}</span>
              </button>
            ))}
          </div>
          {rows.map((g) => (
            <div key={g.group} className="mb-5 px-4">
              <div className="mb-1.5 px-1 text-[11px] tracking-[2px] text-[color:var(--color-ink-3)]">{g.group}</div>
              <div className="overflow-hidden rounded-[14px] bg-[var(--color-surface)] shadow-[var(--shadow-xs)]">
                {g.items.map((r, k) => (
                  <button key={r.key} onClick={() => setView(r.key)}
                    className={`flex w-full items-center gap-3 px-4 py-3.5 text-left ${k ? 'border-t border-[var(--color-line)]' : ''}`}>
                    <span className="text-[color:var(--color-ink-2)]">{r.icon}</span>
                    <span className="flex-1 text-[15px]">{r.label}</span>
                    <span className="text-[12.5px] tabular-nums text-[color:var(--color-ink-3)]">{r.count}</span>
                    <span className="text-[color:var(--color-ink-4)]">›</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    )
  }

  const TITLE = { proj: '项目', mat: '素材', wall: '灵感墙', card: '卡片', file: '文件', pic: '图片' }[view]
  const COUNT = { proj: `${projects.length} 个`, mat: `${plainMats.length} 条`, wall: `${stickies.length} 张`, card: `${cards.length} 张`, file: `${files.length} 个`, pic: `${matImgs.length} 张` }[view]
  return (
    <section className="absolute inset-0 flex flex-col">
      <header className="shrink-0 px-5 pb-1 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-1">
          <button onClick={() => { setView(null); setQuery('') }}
            className="-ml-2 rounded-full px-2.5 py-1.5 text-[17px] text-[color:var(--color-ink-2)]">‹</button>
          {(view === 'card' || view === 'file'
            ? [['card', '卡片'], ['file', '文件']] as const
            : view === 'pic'
            ? [['pic', '图片'], ['mat', '素材'], ['wall', '灵感墙']] as const
            : [['proj', '项目'], ['mat', '素材'], ['wall', '灵感墙']] as const
          ).map(([k, label]) => (
            <button key={k} onClick={() => setView(k)}
              className={`rounded-full px-4 py-2 text-[14.5px] ${view === k ? 'bg-[var(--color-surface)] font-semibold shadow-[var(--shadow-xs)]' : 'text-[color:var(--color-ink-3)]'}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-end px-1">
          <div>
            <div className="text-[13px] tracking-[1px] text-[color:var(--color-ink-3)]">工作区</div>
            <h2 className="mt-0.5 text-[34px] font-bold leading-none tracking-tight">{TITLE}</h2>
          </div>
          <span className="flex-1" />
          <span className="pb-1 text-[13px] text-[color:var(--color-ink-3)]">{COUNT}</span>
        </div>
        <div className="mt-4 flex items-center gap-3 px-1 pb-2">
          <div className="flex h-[52px] min-w-0 flex-1 items-center gap-2.5 rounded-[26px] bg-[var(--color-surface)] px-4 shadow-[var(--shadow-xs)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-[19px] w-[19px] shrink-0 text-[color:var(--color-ink-3)]"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
            <input value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={view === 'proj' ? '搜索工作区' : view === 'mat' ? '搜索素材' : view === 'card' ? '搜索卡片' : view === 'file' ? '搜索文件' : view === 'pic' ? '搜索图片' : '搜索纸条'}
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-[color:var(--color-ink-4)]" />
          </div>
          <button onClick={() => { if (view === 'proj') void addProject(); else if (view === 'mat') void addMaterial(); else if (view === 'card') void addKind('card'); else if (view === 'file') void addKind('file'); else if (view === 'pic') picFile.current?.click(); else void addSticky() }}
            className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-[var(--color-surface)] shadow-[var(--shadow-xs)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M12 11v4M10 13h4"/></svg>
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
        {view === 'proj' && (
          <>
            {shownProjects.map((p) => (
              <ProjectCard key={p.id} p={p} onChange={load} onDelete={() => { void colDel('projects', p.id).then(load) }} />
            ))}
            {!shownProjects.length && <p className="py-14 text-center text-[13px] text-[color:var(--color-ink-3)]">还没有项目</p>}
          </>
        )}

        {view === 'mat' && (
          <>
            <div className="mb-3 flex gap-2 overflow-x-auto">
              {cats.map((c) => (
                <button key={c} onClick={() => setMatCat(c)}
                  className={`shrink-0 rounded-full border px-4 py-2 text-[13px]
                    ${matCat === c ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[color:var(--color-surface)]' : 'border-[var(--color-line)] bg-[var(--color-surface)]'}`}>
                  {c}
                </button>
              ))}
            </div>
            {shownMats.map((m) => (
              <div key={m.id} className="mb-3 rounded-[18px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-xs)]">
                <div className="flex items-baseline gap-2">
                  <span className="rounded-full bg-[var(--color-card)] px-2.5 py-1 text-[11px] text-[color:var(--color-ink-2)]">{m.category}</span>
                  <b className="min-w-0 flex-1 truncate text-[15px]">{m.title}</b>
                  <button onClick={() => { if (confirm('删掉这条素材？')) void colDel('materials', m.id).then(load) }}
                    className="px-2.5 py-1.5 text-[12px] text-[color:var(--color-ink-4)]">删</button>
                </div>
                {m.text && <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[color:var(--color-ink-2)]">{m.text}</p>}
                {(m.images ?? []).length > 0 && (
                  <div className="mt-2.5 flex gap-2 overflow-x-auto">
                    {(m.images ?? []).map((src, i) => (
                      <img key={i} src={src} alt="" className="h-[96px] shrink-0 rounded-[12px] object-cover" />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {!shownMats.length && <p className="py-14 text-center text-[13px] text-[color:var(--color-ink-3)]">还没有素材</p>}
          </>
        )}

        {view === 'pic' && (
          <>
            <input ref={picFile} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void addPics(e.target.files)} />
            <div className="grid grid-cols-3 gap-2">
              {matImgs.map((src, i) => (
                <img key={i} src={src} alt="" className="aspect-square w-full rounded-[12px] object-cover" />
              ))}
            </div>
            {!matImgs.length && <p className="py-14 text-center text-[13px] text-[color:var(--color-ink-3)]">还没有图片</p>}
          </>
        )}

        {view === 'card' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {cards.filter((m) => !query || String(m.title).includes(query) || String(m.code ?? '').includes(query)).map((m) => (
                <button key={m.id} onClick={() => setCardOpen(m)}
                  className="flex h-[190px] flex-col rounded-[18px] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5 text-left shadow-[var(--shadow-xs)]">
                  <div className="flex items-center gap-1.5 text-[12px] text-[color:var(--color-ink-2)]">
                    <span className="font-mono">{'</>'}</span>
                    <span className="uppercase">{m.lang ?? 'html'}</span>
                    <span className="flex-1" />
                    <span className="text-[color:var(--color-ink-3)]">{String(m.ts).slice(5, 10).replace('-', '.')}</span>
                  </div>
                  <b className="mt-2.5 line-clamp-2 text-[15px] leading-snug">{m.title}</b>
                  <pre className="mt-auto overflow-hidden whitespace-pre-wrap break-all font-mono text-[10px] leading-[1.4] text-[color:var(--color-ink-3)]">
                    {String(m.code ?? m.text ?? '').slice(0, 70)}…
                  </pre>
                </button>
              ))}
            </div>
            {!cards.length && <p className="py-14 text-center text-[13px] text-[color:var(--color-ink-3)]">还没有卡片</p>}
          </>
        )}

        {view === 'file' && (
          <>
            {files.filter((m) => !query || String(m.title).includes(query) || String(m.text ?? '').includes(query)).map((m) => (
              <div key={m.id} className="mb-3 rounded-[18px] border border-[var(--color-line)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-xs)]">
                <div className="flex items-baseline gap-2">
                  <b className="min-w-0 flex-1 truncate text-[15px]">{m.title}</b>
                  <button onClick={() => { if (confirm('删掉？')) void colDel('materials', m.id).then(load) }}
                    className="px-2.5 py-1.5 text-[12px] text-[color:var(--color-ink-4)]">删</button>
                </div>
                {m.text && <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-[color:var(--color-ink-2)]">{m.text}</p>}
              </div>
            ))}
            {!files.length && <p className="py-14 text-center text-[13px] text-[color:var(--color-ink-3)]">还没有文件</p>}
          </>
        )}

        {view === 'wall' && (
          <div className="relative h-[160vh] rounded-[18px] border border-dashed border-[var(--color-line)]
                          bg-[repeating-linear-gradient(0deg,transparent,transparent_31px,var(--color-card)_31px,var(--color-card)_32px)]">
            {stickies.filter((s) => !query || String(s.text).includes(query)).map((s) => (
              <StickyNote key={s.id} s={s}
                onSave={(x, y) => { void colPatch('sticky', s.id, { x, y }) }}
                onDelete={() => { void colDel('sticky', s.id).then(load) }} />
            ))}
            {!stickies.length && <p className="py-14 text-center text-[13px] text-[color:var(--color-ink-3)]">还没有纸条</p>}
          </div>
        )}
      </div>

      {cardOpen && (
        <CardEditor m={cardOpen} onClose={() => setCardOpen(null)}
          onSaved={() => { setCardOpen(null); load() }}
          onDelete={() => { void colDel('materials', cardOpen.id).then(() => { setCardOpen(null); load() }) }} />
      )}
    </section>
  )
}

function CardEditor({ m, onClose, onSaved, onDelete }:
  { m: Material; onClose: () => void; onSaved: () => void; onDelete: () => void }) {
  const [code, setCode] = useState(String(m.code ?? m.text ?? ''))
  const [run, setRun] = useState(false)
  const dirty = code !== String(m.code ?? m.text ?? '')
  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-[var(--color-bg)]">
      <header className="flex shrink-0 items-center gap-2 px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))]">
        <button onClick={onClose} className="rounded-full px-2.5 py-2 text-[19px] text-[color:var(--color-ink-2)]">‹</button>
        <button onClick={async () => { await colPatch('materials', m.id, { code }); onSaved() }}
          className={`grid h-[38px] w-[38px] place-items-center rounded-full text-[16px]
            ${dirty ? 'bg-[var(--color-ink)] text-[color:var(--color-surface)]' : 'bg-[var(--color-surface)] text-[color:var(--color-ink-3)]'}`}>✓</button>
        <span className="flex-1" />
        <div className="flex items-center gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] p-1">
          <button onClick={() => setRun(true)} className={`grid h-[34px] w-[40px] place-items-center rounded-full text-[15px] ${run ? 'bg-[var(--color-card)]' : ''}`}>▶</button>
          <button onClick={() => setRun(false)} className={`grid h-[34px] w-[40px] place-items-center rounded-full font-mono text-[13px] ${!run ? 'bg-[var(--color-card)]' : ''}`}>{'</>'}</button>
        </div>
        <button onClick={() => { if (confirm('删掉这张卡片？')) onDelete() }}
          className="px-2 text-[13px] text-[color:var(--color-ink-4)]">删</button>
      </header>

      <div className="flex min-h-0 flex-1 flex-col px-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {/* 运行时把标题区收起来，整屏留给作品 */}
        {!run && (
          <>
            <div className="mb-1 flex items-center gap-2 text-[color:var(--color-ink-3)]">
              <span className="font-mono text-[20px]">{'</>'}</span>
              <span className="text-[15px] uppercase tracking-[3px]">{m.lang ?? 'html'}</span>
            </div>
            <h3 className="mb-3 shrink-0 border-b border-[var(--color-line)] pb-3 text-[24px] font-semibold">{m.title}</h3>
          </>
        )}
        {run
          ? <iframe title={m.title} srcDoc={code} sandbox="allow-scripts"
              className="min-h-0 w-full flex-1 rounded-[14px] border border-[var(--color-line)] bg-white" />
          : <textarea value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false}
              className="min-h-0 w-full flex-1 resize-none bg-transparent font-mono text-[13.5px] leading-[1.7] outline-none" />}
      </div>
    </div>
  )
}

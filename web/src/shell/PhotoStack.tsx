import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/* 聊天里的照片：一张就直接显示；多张叠成一摞（iMessage 那种），左右滑翻页，点哪张就全屏看哪张，全屏里也能左右滑。 */

function Viewer({ srcs, start, onClose }: { srcs: string[]; start: number; onClose: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [cur, setCur] = useState(start)
  useEffect(() => {
    const el = box.current
    if (el) el.scrollLeft = start * el.clientWidth
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return createPortal(
    <div className="fixed inset-0 z-[150] flex flex-col bg-black/95" onClick={onClose}>
      <header className="flex items-center gap-3 px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] text-white" onClick={(e) => e.stopPropagation()}>
        <button onClick={onClose} className="text-2xl">‹</button>
        <b className="flex-1 text-center text-sm">{srcs.length > 1 ? `${cur + 1} / ${srcs.length}` : ''}</b>
        <a href={srcs[cur]} target="_blank" rel="noreferrer" className="rounded-full border border-white/30 px-3 py-1.5 text-[11px]">原图</a>
      </header>
      <div ref={box} className="flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
        onScroll={(e) => { const el = e.currentTarget; setCur(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))) }}>
        {srcs.map((s, i) => (
          <div key={i} className="grid h-full w-full shrink-0 snap-center place-items-center p-3">
            <img src={s} alt="" className="max-h-full max-w-full object-contain" onClick={(e) => e.stopPropagation()} />
          </div>
        ))}
      </div>
      <div className="pb-[max(1rem,env(safe-area-inset-bottom))]" />
    </div>,
    document.body,
  )
}

export default function PhotoStack({ srcs }: { srcs: string[] }) {
  const [idx, setIdx] = useState(0)
  const [open, setOpen] = useState<number | null>(null)
  const [dx, setDx] = useState(0)
  const touch = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const swiped = useRef(false)
  if (!srcs.length) return null
  const n = srcs.length

  if (n === 1) return (
    <>
      <button type="button" onClick={() => setOpen(0)} className="mb-1.5 block max-w-full">
        <img src={srcs[0]} alt="" draggable={false}
          className="block h-auto max-h-[320px] w-auto max-w-[min(65vw,360px)] rounded-[12px] object-contain" />
      </button>
      {open !== null && <Viewer srcs={srcs} start={0} onClose={() => setOpen(null)} />}
    </>
  )

  const go = (d: number) => setIdx((i) => (i + d + n) % n)
  return (
    <div className="mb-1.5 w-[min(65vw,300px)] max-w-full select-none">
      <div className="relative mr-3 touch-pan-y"
        onTouchStart={(e) => { swiped.current = false; touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, moved: false } }}
        onTouchMove={(e) => { const t = touch.current; if (!t) return; const d = e.touches[0].clientX - t.x
          if (Math.abs(d) > 8 && Math.abs(d) > Math.abs(e.touches[0].clientY - t.y)) { t.moved = true; setDx(d) } }}
        onTouchEnd={() => { const t = touch.current; touch.current = null
          if (t?.moved) swiped.current = true; if (t?.moved && Math.abs(dx) > 40) go(dx < 0 ? 1 : -1); setDx(0) }}>
        {[2, 1].filter((k) => k < n).map((k) => (
          <div key={k} className="absolute inset-0 rounded-[12px] border border-black/10 bg-[var(--color-surface)] shadow-sm"
            style={{ transform: `translateX(${k * 6}px) rotate(${k * 2}deg) scale(${1 - k * 0.03})`, transformOrigin: 'bottom left' }}>
            <img src={srcs[(idx + k) % n]} alt="" className="h-full w-full rounded-[12px] object-cover opacity-60" />
          </div>
        ))}
        <button type="button" onClick={() => { if (!swiped.current) setOpen(idx); swiped.current = false }}
          className="relative block w-full overflow-hidden rounded-[12px] bg-black/[.06] shadow-md transition-transform"
          style={{ transform: `translateX(${dx}px) rotate(${dx / 40}deg)` }}>
          <img src={srcs[idx]} alt="" className="h-[min(320px,60vw)] w-full object-contain" draggable={false} />
          <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[10.5px] tabular-nums text-white">{idx + 1}/{n}</span>
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-center gap-1">
        <button type="button" onClick={() => go(-1)} className="px-1.5 text-xs opacity-50">‹</button>
        {srcs.map((_, i) => (
          <button type="button" key={i} onClick={() => setIdx(i)}
            className={`h-1.5 rounded-full transition-all ${i === idx ? 'w-3 bg-current opacity-70' : 'w-1.5 bg-current opacity-25'}`} />
        ))}
        <button type="button" onClick={() => go(1)} className="px-1.5 text-xs opacity-50">›</button>
      </div>
      {open !== null && <Viewer srcs={srcs} start={open} onClose={() => setOpen(null)} />}
    </div>
  )
}

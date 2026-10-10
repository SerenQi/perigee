import { useRef, useState } from 'react'
import { compressBackground } from '../pages/ChatAppearance'
import { DEFAULT_VEIL, readWallpaper, saveWallpaper, type Wallpaper } from '../lib/wallpaper'

export default function WallpaperEditor() {
  const file = useRef<HTMLInputElement>(null)
  const [w, setW] = useState<Wallpaper>(readWallpaper)
  const [error, setError] = useState('')
  const put = (next: Wallpaper) => {
    setW(next)
    setError(saveWallpaper(next) ? '' : '图太大，这台设备存不下，换一张小点的')
  }

  return (
    <div className="mb-5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-center justify-between">
        <b className="text-[13px]">全屋壁纸</b>
        <span className="text-[10px] text-[color:var(--color-ink-3)]">铺在所有页面底下</span>
      </div>

      <div className="relative mb-3 h-[132px] overflow-hidden rounded-[14px] border border-[var(--color-line)]"
        style={w.image ? { backgroundImage: `url("${w.image}")`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}>
        <div className="absolute inset-0" style={{ background: `rgba(255,255,255,${w.image ? w.veil : 0})` }} />
        {/* 预览：一张玻璃小卡压在上面，拖滑杆时看字清不清楚 */}
        <div className="absolute left-3 top-3 right-3 rounded-[14px] bg-[var(--color-surface)] px-3 py-2">
          <b className="block text-[13px]">设置</b>
          <span className="text-[11px] text-[color:var(--color-ink-2)]">玻璃卡片压在壁纸上的样子</span>
        </div>
        {!w.image && (
          <span className="absolute bottom-3 left-0 right-0 text-center text-[11px] text-[color:var(--color-ink-3)]">还没有壁纸，现在是纯白</span>
        )}
      </div>

      <input ref={file} type="file" accept="image/*" hidden
        onChange={async (e) => {
          const f = e.target.files?.[0]; e.target.value = ''
          if (!f) return
          try { put({ ...w, image: await compressBackground(f) }) }
          catch (reason) { setError(reason instanceof Error ? reason.message : '这张图用不了') }
        }} />
      <div className="flex gap-2">
        <button onClick={() => file.current?.click()}
          className="flex-1 rounded-full bg-[var(--color-ink)] py-2.5 text-[11px] text-[color:var(--color-surface)]">
          {w.image ? '换一张壁纸' : '选择壁纸'}
        </button>
        {w.image && (
          <button onClick={() => put({ image: '', veil: DEFAULT_VEIL })}
            className="rounded-full border border-[var(--color-line)] px-4 py-2.5 text-[11px]">移除</button>
        )}
      </div>

      {w.image && (
        <label className="mt-4 flex items-center gap-3 text-[10px] text-[color:var(--color-ink-3)]">
          <span className="shrink-0">白纱</span>
          <input type="range" min="0" max="0.8" step="0.05" value={w.veil}
            onChange={(e) => put({ ...w, veil: Number(e.target.value) })} className="min-w-0 flex-1" />
          <span className="w-8 shrink-0 text-right">{Math.round(w.veil * 100)}%</span>
        </label>
      )}
      <p className="mt-2 text-[10px] leading-relaxed text-[color:var(--color-ink-3)]">
        {error || '纱薄，壁纸更鲜亮；纱厚，字更清楚。聊天房间没单独设背景图的，也会透出这张壁纸。'}
      </p>
    </div>
  )
}

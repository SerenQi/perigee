import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { hasWallpaper, WALLPAPER_EVENT } from '../lib/wallpaper'

export type ChatLook = {
  mine: string
  theirs: string
  background: string
  image: string
  shade: number
  glass: boolean
  imageDark?: boolean // 背景图偏深？玻璃气泡靠它决定白字清透还是黑字偏白（没测过就是 undefined）
}

export const DEFAULT_CHAT_LOOK: ChatLook = {
  mine: '#111111',
  theirs: '#ffffff',
  background: '#ffffff',
  image: '',
  shade: 0.18,
  glass: false,
}

const lookKey = (roomId: string) => `perigee.chat-look.${roomId || 'home'}`

// 旧版每个打开过的房间都把当时的默认色（浅蓝/白/灰绿）写进了浏览器——
const isOldDefault = (v: Partial<ChatLook>) =>
  v.mine === '#d7f3fb' && v.theirs === '#ffffff' && v.background === '#d7e3df'

const readLook = (roomId: string): ChatLook => {
  try {
    const saved: Partial<ChatLook> = JSON.parse(localStorage.getItem(lookKey(roomId)) || '{}')
    if (isOldDefault(saved)) { delete saved.mine; delete saved.theirs; delete saved.background }
    if (saved.background === '#ececee') delete saved.background   // 上午那版灰底默认，也跟着换白

    return { ...DEFAULT_CHAT_LOOK, ...saved }
  } catch {
    return DEFAULT_CHAT_LOOK
  }
}

const rgba = (hex: string, a: number) => {
  const raw = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(raw)) return hex
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16))
  return `rgba(${r},${g},${b},${a})`
}
const glassOnDark = (look: ChatLook) => Boolean(look.image) && look.imageDark !== false
export const bubbleBg = (look: ChatLook, mine: boolean) => {
  const color = mine ? look.mine : look.theirs
  if (!look.glass) return color
  if (glassOnDark(look)) return mine ? rgba(color, 0.38) : 'rgba(255,255,255,.14)'
  return rgba(color, mine ? 0.6 : 0.55)
}
export const bubbleInk = (look: ChatLook, mine: boolean) =>
  look.glass && glassOnDark(look) ? '#ffffff' : inkFor(mine ? look.mine : look.theirs)

/** 取背景图平均亮度：缩到 24px 见方取均值，低于 128 算深 */
export function measureDark(src: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onerror = () => resolve(true)
    img.onload = () => {
      try {
        const c = document.createElement('canvas'); c.width = 24; c.height = 24
        const g = c.getContext('2d')!; g.drawImage(img, 0, 0, 24, 24)
        const d = g.getImageData(0, 0, 24, 24).data
        let sum = 0
        for (let i = 0; i < d.length; i += 4) sum += d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114
        resolve(sum / (d.length / 4) < 128)
      } catch { resolve(true) }
    }
    img.src = src
  })
}

export const inkFor = (hex: string) => {
  const raw = hex.replace('#', '')
  if (!/^[0-9a-f]{6}$/i.test(raw)) return '#111111'
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16))
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#111111' : '#ffffff'
}

export const chatRoomStyle = (look: ChatLook): CSSProperties => ({
  '--tg-mine': look.mine,
  '--tg-theirs': look.theirs,
  '--tg-mine-ink': inkFor(look.mine),
  '--tg-theirs-ink': inkFor(look.theirs),
  // 房间没单独设背景图、底色也还是默认白 → 透明，露出全屋壁纸；房间自己设过的照旧
  backgroundColor: !look.image && look.background === DEFAULT_CHAT_LOOK.background && hasWallpaper() ? 'transparent' : look.background,
  backgroundImage: look.image
    ? `linear-gradient(rgba(0,0,0,${look.shade}),rgba(0,0,0,${look.shade})),url("${look.image}")`
    : undefined,
} as CSSProperties)

const LOOK_EVENT = 'perigee:chat-look'

export function useChatLook(roomId: string) {
  const [look, setLook] = useState<ChatLook>(() => readLook(roomId))

  useEffect(() => setLook(readLook(roomId)), [roomId])
  // 旧房间的背景图没测过深浅：补测一次，写回浏览器（不广播，免得来回触发）
  useEffect(() => {
    if (!look.image || look.imageDark !== undefined) return
    let alive = true
    void measureDark(look.image).then((imageDark) => {
      if (!alive) return
      const next = { ...look, imageDark }
      try { localStorage.setItem(lookKey(roomId), JSON.stringify(next)) } catch { /* 存不下就每次现测 */ }
      setLook(next)
    })
    return () => { alive = false }
  }, [look, roomId])
  useEffect(() => {
    const sync = (e: Event) => { if ((e as CustomEvent).detail === (roomId || 'home')) setLook(readLook(roomId)) }
    const wall = () => setLook(readLook(roomId))   // 全屋壁纸换了，房间要重算透不透
    window.addEventListener(LOOK_EVENT, sync)
    window.addEventListener(WALLPAPER_EVENT, wall)
    return () => { window.removeEventListener(LOOK_EVENT, sync); window.removeEventListener(WALLPAPER_EVENT, wall) }
  }, [roomId])

  return { look }
}

function saveLook(roomId: string, look: ChatLook): boolean {
  try {
    localStorage.setItem(lookKey(roomId), JSON.stringify(look))
  } catch {
    return false   // 背景图太大会撑爆浏览器存储；预览照常，编辑器会提示
  }
  window.dispatchEvent(new CustomEvent(LOOK_EVENT, { detail: roomId || 'home' }))
  return true
}

export function compressBackground(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('背景图读不了'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('背景图打不开'))
      img.onload = () => {
        const max = 1280
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.72))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

/** 设置 › 外观 里的房间外观编辑器：改哪个房间由 roomId 定，改一下存一下 */
export function ChatAppearanceEditor({ roomId }: { roomId: string }) {
  const file = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [look, setLookState] = useState<ChatLook>(() => readLook(roomId))
  useEffect(() => { setLookState(readLook(roomId)); setError('') }, [roomId])
  const setLook = (fn: (value: ChatLook) => ChatLook) => setLookState((value) => {
    const next = fn(value)
    if (!saveLook(roomId, next)) setError('背景图太大，这台设备存不下，换一张小点的')
    return next
  })

  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <div
          className="mb-5 rounded-[18px] p-3"
          style={{
            backgroundColor: look.background,
            backgroundImage: look.image
              ? `linear-gradient(rgba(0,0,0,${look.shade}),rgba(0,0,0,${look.shade})),url("${look.image}")`
              : undefined,
            backgroundPosition: 'center',
            backgroundSize: 'cover',
          }}
        >
          <div className={`mb-2 w-fit max-w-[78%] rounded-[16px] px-3 py-2 text-[13px] ${look.glass ? 'preview-glass' : ''}`}
            style={{ background: bubbleBg(look, false), color: bubbleInk(look, false) }}>
            这样看得清吗 <span className="ml-1 text-[9px] opacity-45">11:46</span>
          </div>
          <div className={`ml-auto w-fit max-w-[78%] rounded-[16px] px-3 py-2 text-[13px] ${look.glass ? 'preview-glass' : ''}`}
            style={{ background: bubbleBg(look, true), color: bubbleInk(look, true) }}>
            就是这个感觉 <span className="ml-1 text-[9px] opacity-45">11:47 ✓✓</span>
          </div>
        </div>
        <div className="mb-3 grid grid-cols-2 gap-1 rounded-[var(--radius-sm)] bg-[var(--color-card)] p-1">
          {([[false, '纯色气泡'], [true, '玻璃气泡']] as const).map(([g, label]) => (
            <button key={label} onClick={() => setLook((value) => ({ ...value, glass: g }))}
              className={`rounded-[var(--radius-xs)] py-2 text-[11px] ${look.glass === g ? 'bg-[var(--color-ink)] text-[color:var(--color-surface)]' : ''}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {([['我的气泡', 'mine'], ['对方气泡', 'theirs'], ['背景颜色', 'background']] as const).map(([label, key]) => (
            <label key={key} className="rounded-[var(--radius-md)] border border-[var(--color-line)] p-3 text-center text-[10px] text-[color:var(--color-ink-3)]">
              <input
                type="color"
                value={look[key]}
                onChange={(e) => setLook((value) => ({ ...value, [key]: e.target.value }))}
                className="mx-auto mb-2 block h-8 w-12 cursor-pointer border-0 bg-transparent"
              />
              {label}
            </label>
          ))}
        </div>
        <input
          ref={file}
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const background = e.target.files?.[0]
            e.target.value = ''
            if (!background) return
            setError('')
            try {
              const image = await compressBackground(background)
              const imageDark = await measureDark(image)
              setLook((value) => ({ ...value, image, imageDark }))
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : '背景图换不了')
            }
          }}
        />
        <div className="mt-3 flex gap-2">
          <button onClick={() => file.current?.click()} className="flex-1 rounded-full bg-[var(--color-ink)] py-2.5 text-[11px] text-[color:var(--color-surface)]">选择背景图片</button>
          {look.image && <button onClick={() => setLook((value) => ({ ...value, image: '' }))} className="rounded-full border border-[var(--color-line)] px-4 py-2.5 text-[11px]">移除图片</button>}
        </div>
        {error && <p className="mt-2 text-center text-[10px] text-red-600">{error}</p>}
        {look.image && (
          <label className="mt-4 flex items-center gap-3 text-[10px] text-[color:var(--color-ink-3)]">
            <span>背景压暗</span>
            <input type="range" min="0" max="0.55" step="0.05" value={look.shade} onChange={(e) => setLook((value) => ({ ...value, shade: Number(e.target.value) }))} className="min-w-0 flex-1" />
            <span>{Math.round(look.shade * 100)}%</span>
          </label>
        )}
        <button onClick={() => setLook(() => DEFAULT_CHAT_LOOK)} className="mt-4 w-full py-2 text-[11px] text-[color:var(--color-ink-3)]">恢复默认黑白配色</button>
    </div>
  )
}

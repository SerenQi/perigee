
export type Wallpaper = { image: string; veil: number }
const KEY = 'perigee.wallpaper'
export const WALLPAPER_EVENT = 'perigee:wallpaper'
export const DEFAULT_VEIL = 0.55

export function readWallpaper(): Wallpaper {
  try {
    const w = JSON.parse(localStorage.getItem(KEY) || '{}')
    return { image: typeof w.image === 'string' ? w.image : '', veil: typeof w.veil === 'number' ? w.veil : DEFAULT_VEIL }
  } catch { return { image: '', veil: DEFAULT_VEIL } }
}

export const hasWallpaper = () => Boolean(readWallpaper().image)

/** 把壁纸写进 --app-bg（tokens.css 里 body 和所有 bg-[var(--color-bg)] 都吃这个变量） */
export function applyWallpaper(w: Wallpaper = readWallpaper()) {
  const root = document.documentElement.style
  if (!w.image) { root.removeProperty('--app-bg'); return }
  const v = Math.min(0.9, Math.max(0, w.veil))
  root.setProperty('--app-bg',
    `linear-gradient(rgba(255,255,255,${v}),rgba(255,255,255,${v})), url("${w.image}") center / cover no-repeat`)
}

/** 存 + 立刻生效 + 广播（聊天房间要跟着决定透不透出壁纸）；存不下返回 false */
export function saveWallpaper(w: Wallpaper): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(w)) } catch { return false }
  applyWallpaper(w)
  window.dispatchEvent(new Event(WALLPAPER_EVENT))
  return true
}

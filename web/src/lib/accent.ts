import { readWallpaper } from './wallpaper'

const KEY = 'perigee.memorial.accent'
export const INK = '#1c1c1e'

export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: '墨', hex: INK },
  { name: '松绿', hex: '#5f7f63' },
  { name: '雾蓝', hex: '#4a6fa8' },
  { name: '海青', hex: '#3f8a8c' },
  { name: '樱粉', hex: '#c46f89' },
  { name: '暮紫', hex: '#76649e' },
  { name: '琥珀', hex: '#a87a3a' },
]

export function readAccentChoice(): string {
  try { return localStorage.getItem(KEY) || 'auto' } catch { return 'auto' }
}
export function saveAccentChoice(v: string) {
  try { localStorage.setItem(KEY, v) } catch { /* 存不下就只在这次生效 */ }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h * 60, s, l]
}

/** 壁纸取色：只数有颜色的像素（灰白的浪花、云不算），取平均色相，再把亮度压到 0.40 */
export function wallpaperAccent(): Promise<string> {
  const { image } = readWallpaper()
  if (!image) return Promise.resolve(INK)
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const c = document.createElement('canvas')
        c.width = 48; c.height = 48
        const ctx = c.getContext('2d')!
        ctx.drawImage(img, 0, 0, 48, 48)
        const px = ctx.getImageData(0, 0, 48, 48).data
        let x = 0, y = 0, w = 0, sat = 0
        for (let i = 0; i < px.length; i += 4) {
          const [h, s, l] = rgbToHsl(px[i], px[i + 1], px[i + 2])
          if (s < 0.12 || l < 0.08 || l > 0.94) continue
          const wt = s * (1 - Math.abs(l - 0.5))
          x += Math.cos(h * Math.PI / 180) * wt; y += Math.sin(h * Math.PI / 180) * wt
          w += wt; sat += s * wt
        }
        if (w < 40) return resolve(INK) // 基本是灰调的壁纸（雨窗那种）→ 墨色
        const hue = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
        const s = Math.min(0.55, Math.max(0.28, sat / w))
        resolve(`hsl(${hue.toFixed(0)} ${(s * 100).toFixed(0)}% 40%)`)
      } catch { resolve(INK) }
    }
    img.onerror = () => resolve(INK)
    img.src = image
  })
}

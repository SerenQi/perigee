import { aiName } from './identity'
import { fetchHistory, FILE_MARK } from './api'

const SEEN = 'perigee.lastSeen'

export async function askNotify(): Promise<boolean> {
  if (!('Notification' in window)) return false
  if (Notification.permission === 'granted') return true
  if (Notification.permission === 'denied') return false
  return (await Notification.requestPermission()) === 'granted'
}

export const notifyOn = () => 'Notification' in window && Notification.permission === 'granted'

/** 轮询：我说了新话就弹一条系统通知（锁屏 / 后台都能看见） */
export function startWatching(onNew?: (n: number) => void) {
  let last = localStorage.getItem(SEEN) || ''
  const tick = async () => {
    if (document.visibilityState === 'visible') return
    const h = await fetchHistory()
    const mine = h.filter((m) => m.role === 'assistant' && (m.ts ?? '') > last)
    if (!mine.length) return
    last = mine[mine.length - 1].ts ?? last
    localStorage.setItem(SEEN, last)
    onNew?.(mine.length)
    if (!notifyOn()) return
    const m = mine[mine.length - 1]
    new Notification(aiName(), { body: m.content.replace(FILE_MARK, '[文件]').replace(/\[\[铃铛(?:[:：]([^\]\n]*))?\]\]/g, (_w, t) => `${aiName()}摇了摇铃铛${t || ''}`).slice(0, 120), tag: 'perigee', icon: import.meta.env.BASE_URL + 'icon-192.png' })
  }
  const t = setInterval(() => void tick(), 20000)
  const onVis = () => {
    if (document.visibilityState === 'visible') {
      void fetchHistory().then((h) => {
        const a = h.filter((m) => m.role === 'assistant')
        if (a.length) localStorage.setItem(SEEN, a[a.length - 1].ts ?? '')
      })
    }
  }
  document.addEventListener('visibilitychange', onVis)
  return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis) }
}

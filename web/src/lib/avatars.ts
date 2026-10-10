import { API_BASE } from './config'
import { letterAvatar, userAvatar, aiAvatar } from './identity'
import { avatarMap, setAvatarMap } from './avatarStore'
export { useAvatars, loadAvatars } from './avatarStore'

/* 头像：存在服务器（网关 DATA_DIR/avatars/），所有设备一样。
   key：user（我）· room:<id>（这个房间的 AI）· room:<id>:user（我在这个房间换的头像）· group:user（我在群聊）· crew:<成员id>（群聊成员）
   找不到就逐级退：房间里的我 → 我；房间 AI → 主房间 AI → 名字首字占位。 */

export const avatarUrl = (key: string) => avatarMap()[key] || ''

/** 我：先看这个房间/群聊有没有单独换过，再看全局，最后用本机外观里的（旧版）或首字占位 */
export function userAvatarFor(roomId?: string | null) {
  const map = avatarMap()
  const own = roomId === 'group' ? map['group:user'] : roomId ? map[`room:${roomId}:user`] : ''
  return own || userAvatar()
}
/** 某个房间的 AI */
export function aiAvatarFor(roomId?: string | null, title?: string) {
  const id = roomId || 'home'
  if (id === 'home') return aiAvatar()
  return avatarMap()[`room:${id}`] || letterAvatar(title || (id === 'group' ? '群' : id), true)
}
/** 群聊成员 */
export function crewAvatarFor(memberId: string, name?: string) {
  return avatarMap()[`crew:${memberId}`] || letterAvatar(name || memberId, true)
}

/** 选一张图 → 压成 256×256 的 jpeg → 传到服务器 */
export function pickAndUpload(key: string): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = 'image/png,image/jpeg,image/webp,image/heic,image/*'
    input.onchange = () => {
      const f = input.files?.[0]; if (!f) return resolve(false)
      if (f.size > 20 * 1024 * 1024) { alert('图片太大了（20MB 以内）'); return resolve(false) }
      const img = new Image()
      img.onload = async () => {
        const S = 256, c = document.createElement('canvas'); c.width = S; c.height = S
        const k = Math.max(S / img.width, S / img.height)
        c.getContext('2d')!.drawImage(img, (S - img.width * k) / 2, (S - img.height * k) / 2, img.width * k, img.height * k)
        URL.revokeObjectURL(img.src)
        const r = await fetch(`${API_BASE}/avatars/${encodeURIComponent(key)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image: c.toDataURL('image/jpeg', 0.86) }),
        }).catch(() => null)
        const j = await r?.json().catch(() => null)
        if (!r?.ok) { alert(j?.error?.message || '上传失败'); return resolve(false) }
        setAvatarMap(j.avatars); resolve(true)
      }
      img.onerror = () => { alert('这张图打不开'); resolve(false) }
      img.src = URL.createObjectURL(f)
    }
    input.click()
  })
}
export async function clearAvatar(key: string) {
  const r = await fetch(`${API_BASE}/avatars/${encodeURIComponent(key)}`, { method: 'DELETE' }).catch(() => null)
  const j = await r?.json().catch(() => null)
  if (j?.avatars) setAvatarMap(j.avatars)
}

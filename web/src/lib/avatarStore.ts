import { useSyncExternalStore } from 'react'
import { API_BASE } from './config'

/* 服务器上的头像表 { key: url }（网关 GET /avatars）。identity.ts 和 avatars.ts 都从这里读，避免互相引用。 */
let map: Record<string, string> = {}
const subs = new Set<() => void>()
let loading: Promise<void> | null = null
export const avatarMap = () => map
export function setAvatarMap(next: Record<string, string>) { map = next || {}; subs.forEach((f) => f()) }
export function loadAvatars() {
  loading ??= fetch(`${API_BASE}/avatars`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.avatars) setAvatarMap(j.avatars) })
    .catch(() => {}).finally(() => { loading = null })
  return loading
}
let asked = false
/** 组件里调一下：头像表到了/变了就重画 */
export function useAvatars() {
  return useSyncExternalStore((f) => { subs.add(f); if (!asked) { asked = true; void loadAvatars() } return () => subs.delete(f) }, () => map)
}

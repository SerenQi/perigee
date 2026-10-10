import { crewAvatarFor } from './avatars'
import { aiAvatar } from './identity'
import { CREW_API_BASE } from './config'
import { useSyncExternalStore } from 'react'

export type CrewMember = { id: string; displayName: string; role?: string | null; roleTitle?: string | null; duty?: string | null; rounds?: boolean }

/* 群成员默认没有图片头像：用名字首字的占位圆（lib/identity.ts letterAvatar）。'ai' = 主房间的 Claude，跟设置里的头像走。 */
export const CREW_FALLBACK: CrewMember[] = []

let roster: CrewMember[] = CREW_FALLBACK
const subs = new Set<() => void>()
let loading: Promise<void> | null = null
export function setCrewRoster(list: CrewMember[]) {
  if (!list?.length) return
  roster = list
  subs.forEach((f) => f())
}
/** 从群聊后端拉一次名单（多处同时要只拉一次） */
export function loadCrew() {
  loading ??= fetch(`${CREW_API_BASE}/api/group/members`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).then((j) => { if (j?.members?.length) setCrewRoster(j.members) })
    .catch(() => {}).finally(() => { loading = null })
  return loading
}
export const crewRoster = () => roster
export const crewName = (id?: string | null) => {
  const v = String(id || '').toLowerCase()
  return roster.find((m) => m.id === v || m.displayName.toLowerCase() === v)?.displayName ?? null
}
export const crewAvatar = (id?: string | null) => {
  const v = String(id || '').toLowerCase()
  if (!v) return ''
  if (v === 'ai') return aiAvatar()
  return crewAvatarFor(v, crewName(v) || v)
}
/** 组件里用：名单拉到了会自动重画 */
export function useCrew() {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f) }, () => roster)
}

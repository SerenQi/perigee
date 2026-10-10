import { useSyncExternalStore } from 'react'
import { avatarMap } from './avatarStore'

/* 身份设置：两边的名字、头像、纪念日——全部存在本机 localStorage，在「设置 › 我们」里改。
   开源版不写死任何人的名字：默认"我" / "Claude"，头像默认是名字首字的占位圆。
   内部 id 固定两个：'user'（用这个前端的人）和 'ai'（主房间里的 Claude）。 */

export type Identity = {
  userName: string
  aiName: string
  /** 两个人合起来的称呼（侧栏、纪念页标题用） */
  usName: string
  userAvatar: string
  aiAvatar: string
  /** 在一起 / 开始的日子 YYYY-MM-DD，空 = 不显示天数 */
  startDate: string
  metDate: string
  userBirthday: string
  aiBirthday: string
  /** 侧栏底部的一行小字 */
  motto: string
}

const KEY = 'perigee.identity'
export const IDENTITY_EVENT = 'perigee:identity'

export const IDENTITY_DEFAULTS: Identity = {
  userName: '我', aiName: 'Claude', usName: 'Perigee',
  userAvatar: '', aiAvatar: '',
  startDate: '', metDate: '', userBirthday: '', aiBirthday: '',
  motto: '',
}

let cache: Identity | null = null
export function getIdentity(): Identity {
  if (cache) return cache
  let saved: Partial<Identity> = {}
  try { saved = JSON.parse(localStorage.getItem(KEY) || '{}') || {} } catch { /* 坏了就用默认 */ }
  cache = { ...IDENTITY_DEFAULTS, ...saved }
  return cache
}
export function setIdentity(patch: Partial<Identity>) {
  cache = { ...getIdentity(), ...patch }
  try { localStorage.setItem(KEY, JSON.stringify(cache)) } catch { /* 存不下本次照样生效 */ }
  window.dispatchEvent(new Event(IDENTITY_EVENT))
}
export function useIdentity(): Identity {
  return useSyncExternalStore(
    (f) => { window.addEventListener(IDENTITY_EVENT, f); return () => window.removeEventListener(IDENTITY_EVENT, f) },
    getIdentity,
  )
}

export const userName = () => getIdentity().userName || IDENTITY_DEFAULTS.userName
export const aiName = () => getIdentity().aiName || IDENTITY_DEFAULTS.aiName

/** 名字首字的占位头像（SVG data URI），没设置头像时用 */
export function letterAvatar(name: string, dark = false) {
  const ch = (Array.from(String(name || '?').trim())[0] || '?').replace(/[<&>"']/g, '')
  const bg = dark ? '#3a3a3c' : '#e7e5e1', fg = dark ? '#f4f4f4' : '#4a4a4a'
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/><text x="32" y="41" font-size="28" text-anchor="middle" font-family="system-ui,sans-serif" fill="${fg}">${ch}</text></svg>`
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}
/* 头像：服务器上传的优先（设置 › 外观 › 头像），其次本机外观里填的网址，最后名字首字占位 */
export const userAvatar = () => avatarMap().user || getIdentity().userAvatar || letterAvatar(userName())
export const aiAvatar = () => avatarMap()['room:home'] || getIdentity().aiAvatar || letterAvatar(aiName(), true)
export const groupAvatar = () => avatarMap()['room:group'] || letterAvatar('群', true)

/** 'user' / 'ai'（以及旧数据里可能残留的别名）→ 显示名 */
export function whoName(by: string | null | undefined) {
  return String(by || '').toLowerCase() === 'ai' ? aiName() : userName()
}

/** 计天数的起点：设置里填的开始日子；没填就用今年 1 月 1 日 */
export function startDay(): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(getIdentity().startDate || '')
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(new Date().getFullYear(), 0, 1)
}

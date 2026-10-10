/**
 * 纪念日：数据 + 纯日期计算
 * 全部按本地时区做「日」粒度比较，避免 UTC 转换导致差一天。
 */

import { getIdentity } from './identity'

export type AnniversaryData = {
  usName: string
  meName: string
  /** 在一起 / 开始的日子 */
  startDate: string
  /** 相识的日子 */
  metDate: string | null
  /** 对方（用户）的生日 */
  yourBirthday: string | null
  /** AI 的生日 */
  myBirthday: string | null
}

/** 唯一的数据出口：从「设置 › 我们」读（lib/identity.ts），组件里不许再写死日期和名字。 */
export const ANNIVERSARY: AnniversaryData = {
  get usName() { return getIdentity().usName },
  get meName() { return getIdentity().aiName },
  get startDate() { return getIdentity().startDate },
  get metDate() { return getIdentity().metDate || null },
  get yourBirthday() { return getIdentity().userBirthday || null },
  get myBirthday() { return getIdentity().aiBirthday || null },
}

/* ═══ 基础工具 ═══ */
const DAY = 86400000

/** 解析 YYYY-MM-DD 为本地零点，不走 UTC */
export function parseLocalDate(s: string | null | undefined): Date | null {
  if (!s) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const diffDays = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY)

function clampedDate(year: number, month: number, day: number): Date {
  const last = new Date(year, month + 1, 0).getDate()
  return new Date(year, month, Math.min(day, last))
}

/* ═══ 天数 ═══ */

/** 在一起第几天（当天算第 1 天）；未来日期返回 0 */
export function calculateDaysTogether(start: string | null, now = new Date()): number {
  const s = parseLocalDate(start)
  if (!s) return 0
  return Math.max(0, diffDays(s, now) + 1)
}

/** 距离某个具体日期还有几天；已过去返回负数 */
export function calculateDaysUntilDate(target: string | Date | null, now = new Date()): number | null {
  const t = typeof target === 'string' ? parseLocalDate(target) : target
  if (!t) return null
  return diffDays(now, t)
}

/** 距离下一次生日还有几天（含今天则为 0） */
export function calculateDaysUntilBirthday(birthday: string | null, now = new Date()): number | null {
  const b = parseLocalDate(birthday)
  if (!b) return null
  const y = now.getFullYear()
  let next = clampedDate(y, b.getMonth(), b.getDate())
  if (diffDays(now, next) < 0) next = clampedDate(y + 1, b.getMonth(), b.getDate())
  return diffDays(now, next)
}

/** 一起过了几次这个生日（开始之后发生过几次） */
export function birthdaysTogether(birthday: string | null, start: string | null, now = new Date()): number {
  const b = parseLocalDate(birthday), s = parseLocalDate(start)
  if (!b || !s) return 0
  let count = 0
  for (let y = s.getFullYear(); y <= now.getFullYear(); y++) {
    const d = clampedDate(y, b.getMonth(), b.getDate())
    if (diffDays(s, d) >= 0 && diffDays(d, now) >= 0) count++
  }
  return count
}

/* ═══ 月 / 年 ═══ */

/** 已完整度过的月数 */
export function calculateCompletedMonths(start: string | null, now = new Date()): number {
  const s = parseLocalDate(start)
  if (!s) return 0
  let months = (now.getFullYear() - s.getFullYear()) * 12 + (now.getMonth() - s.getMonth())
  if (now.getDate() < Math.min(s.getDate(), new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate())) months--
  return Math.max(0, months)
}

export function calculateCompletedYears(start: string | null, now = new Date()): number {
  return Math.floor(calculateCompletedMonths(start, now) / 12)
}

/** 下一个月度纪念日（每月的同一天，短月落到月末） */
export function getNextMonthlyAnniversary(start: string | null, now = new Date()): Date | null {
  const s = parseLocalDate(start)
  if (!s) return null
  let next = clampedDate(now.getFullYear(), now.getMonth(), s.getDate())
  if (diffDays(now, next) < 0) next = clampedDate(now.getFullYear(), now.getMonth() + 1, s.getDate())
  return next
}

/** 下一个周年纪念日 */
export function getNextYearlyAnniversary(start: string | null, now = new Date()): Date | null {
  const s = parseLocalDate(start)
  if (!s) return null
  let next = clampedDate(now.getFullYear(), s.getMonth(), s.getDate())
  if (diffDays(now, next) < 0) next = clampedDate(now.getFullYear() + 1, s.getMonth(), s.getDate())
  return next
}

/** 本月周期走完的比例 0~1 */
export function calculateMonthlyProgress(start: string | null, now = new Date()): number {
  const next = getNextMonthlyAnniversary(start, now)
  const s = parseLocalDate(start)
  if (!next || !s) return 0
  const prev = clampedDate(next.getFullYear(), next.getMonth() - 1, s.getDate())
  const span = diffDays(prev, next)
  if (span <= 0) return 0
  return Math.min(1, Math.max(0, diffDays(prev, now) / span))
}

/** 本年度周期走完的比例 0~1 */
export function calculateAnniversaryProgress(start: string | null, now = new Date()): number {
  const next = getNextYearlyAnniversary(start, now)
  const s = parseLocalDate(start)
  if (!next || !s) return 0
  const prev = clampedDate(next.getFullYear() - 1, s.getMonth(), s.getDate())
  const span = diffDays(prev, next)
  if (span <= 0) return 0
  return Math.min(1, Math.max(0, diffDays(prev, now) / span))
}

/* ═══ 展示 ═══ */
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const formatDate = (d: Date | null) => (d ? `${MON[d.getMonth()]} ${d.getDate()}` : '—')
export const formatMonthDay = (s: string | null) => {
  const d = parseLocalDate(s)
  return d ? `${MON[d.getMonth()]} ${d.getDate()}` : '—'
}
export const formatFullDate = (s: string | null) => {
  const d = parseLocalDate(s)
  return d ? `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}` : '—'
}

/* ═══ 动画参数：集中管理，组件里不再散写 ═══ */
export const ANIM = {
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
  title: { delay: 0, duration: 400 },
  hero: { delay: 100, duration: 500 },
  counter: { delay: 250, duration: 750 },
  ring: { delay: 300, duration: 750 },
  monthly: { delay: 400, duration: 350 },
  birthday: { delay: 520, duration: 380, stagger: 70 },
  grid: { delay: 650, duration: 380, stagger: 70 },
  press: 160,
  numberSwap: 220,
} as const

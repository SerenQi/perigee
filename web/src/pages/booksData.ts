import { userName, aiName } from '../lib/identity'
import { API_BASE } from '../lib/config'
import { colAdd, colList, type ColItem } from '../lib/api'

export type ReaderIdentity = 'user' | 'ai'
export type BookStatus = 'want' | 'reading' | 'done'
export type Book = ColItem & {
  title: string
  author?: string
  status: BookStatus
  rating_user?: number
  rating_ai?: number
  review_user?: string
  review_ai?: string
  added_at?: string
  client_key?: string
  cover?: string
}
export type Chapter = ColItem & { book_id: string; idx: number; title: string; text: string }
export type BookMark = ColItem & {
  book_id: string
  chapter_idx: number
  quote: string
  type: 'highlight' | 'bookmark'
  note?: string
  by: ReaderIdentity
  at: string
}
export type BookProgress = ColItem & { book_id: string; by: ReaderIdentity; chapter_idx: number }

const BASE = API_BASE

export const listBooks = async () => (await colList('books')) as Book[]
export const listChapters = async () => (await colList('book_chapters')) as Chapter[]
export const listMarks = async () => (await colList('book_marks')) as BookMark[]
export const listProgress = async () => (await colList('book_progress')) as BookProgress[]

export async function patchCol(name: string, id: string, patch: Record<string, unknown>) {
  const r = await fetch(`${BASE}/col/${name}/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  })
  return r.ok
}

export async function upsertProgress(bookId: string, by: ReaderIdentity, chapterIdx: number, rows: BookProgress[]) {
  const old = rows.find((p) => p.book_id === bookId && p.by === by)
  if (old) return patchCol('book_progress', old.id, { chapter_idx: chapterIdx })
  return colAdd('book_progress', { book_id: bookId, by, chapter_idx: chapterIdx })
}

export function splitBookText(raw: string): { idx: number; title: string; text: string }[] {
  const text = raw.replace(/\r\n?/g, '\n').trim()
  if (!text) return []
  const heading = /^\s*(第[一二三四五六七八九十百千0-9]+[章节回][^\n]*)\s*$/gm
  const hits = [...text.matchAll(heading)]
  if (!hits.length) return [{ idx: 0, title: '正文', text }]
  const out: { idx: number; title: string; text: string }[] = []
  hits.forEach((hit, i) => {
    const start = hit.index ?? 0
    const contentStart = start + hit[0].length
    const end = hits[i + 1]?.index ?? text.length
    const body = text.slice(contentStart, end).trim()
    out.push({ idx: i, title: String(hit[1]).trim(), text: body })
  })
  const preface = text.slice(0, hits[0].index ?? 0).trim()
  if (preface) out.unshift({ idx: 0, title: '序章', text: preface })
  return out.map((c, idx) => ({ ...c, idx }))
}

export const identityLabel = (by: ReaderIdentity) => by === 'user' ? userName() : aiName()

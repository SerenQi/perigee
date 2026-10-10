import { API_BASE } from '../lib/config'
import { streamChat } from '../lib/api'

export const BASE = API_BASE
export type Selection = { id: string; role: string; content: string; ts?: string }
export type RecordMessage = {
  who: string; role: string; ts: string; text: string; images: string[]; audio?: string
  attachments: { name: string; mime: string; url: string }[]; recordId?: string
}
export type ChatRecord = {
  id: string; title: string; sourceTitle: string; topic: string; count: number; start?: string; end?: string
  lines: { who: string; text: string }[]; messages?: RecordMessage[]
}
export function parseRecord(text: string) {
  const match = text.match(/^\[合并聊天记录 #([a-f0-9-]{36})\]\n([^\n]*)(?:\n\n([\s\S]*))?$/i)
  return match ? { id: match[1], title: match[2], comment: match[3] || '' } : null
}
export const recordUrl = (id: string, room: string, root?: string, download = false) =>
  `${BASE}/forwards/${encodeURIComponent(id)}${download ? '/download' : ''}?${new URLSearchParams({ room, ...(root ? { root } : {}) })}`
export async function fetchRecord(id: string, room: string, root?: string, full = false): Promise<ChatRecord> {
  const r = await fetch(recordUrl(id, room, root) + (full ? '&full=1' : ''), { cache: 'no-store' })
  if (!r.ok) throw new Error('记录暂时打不开，可能已删除或没有转发到此会话。')
  return (await r.json()).record
}
export function dateLabel(ts?: string) {
  return ts ? new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
}
export const forwardReplies = new Set<string>()
export function notifyRecipient(target: string, content: string) {
  forwardReplies.add(target)
  window.dispatchEvent(new CustomEvent('perigee:forward-update', { detail: { room: target } }))
  return streamChat([{ role: 'user', content }], () => {}, { roomId: target }).finally(() => {
    forwardReplies.delete(target)
    window.dispatchEvent(new CustomEvent('perigee:forward-update', { detail: { room: target } }))
  })
}

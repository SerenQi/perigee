import { userAvatarFor, useAvatars } from '../lib/avatars'
import { userName } from '../lib/identity'
import { CREW_API_BASE } from '../lib/config'
import { useEffect, useMemo, useRef, useState } from 'react'
import { crewAvatar, CREW_FALLBACK, setCrewRoster } from '../lib/crew'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { ForwardSheet, SelectionBar } from '../forward/Forwarding'
import type { Selection } from '../forward/records'
import { getRoom } from '../lib/api'
import { bubbleBg, bubbleInk, chatRoomStyle, useChatLook } from './ChatAppearance'
import './chat-telegram.css'


const BASE = CREW_API_BASE
type Attachment = { name: string; mime: string; url: string; path?: string }
type OrderCardEvt = { order_id: string; title?: string; from_status?: string; to_status?: string; actor?: string; comment?: string | null }
type CrewMsg = { key: string; role: string; content: string; sender: string; displayName: string; ts: string; error?: boolean; attachments?: Attachment[]; card?: OrderCardEvt }
type AgentStatus = { state?: string; queueLength?: number; processAlive?: boolean }
type OrderLog = { at?: string; actor?: string; detail?: string }
type Review = { id: number; round: number; kind: 'request' | 'review'; actor: string; verdict?: 'changes' | 'all_clear' | null; p0: number; p1: number; p2: number; detail: any; ts: string }
type Order = { id: string; title: string; description?: string; status: string; assignee?: string; updated_at?: string; created_at?: string; logs?: OrderLog[]; timeline?: { from?: string; to?: string; at?: string }[]; reviews?: Review[] }
type Member = { id: string; displayName: string; role?: string | null; roleTitle?: string | null; duty?: string | null; rounds?: boolean }
type Settings = { replyMode: 'round' | 'random' | 'mention'; allowSilence: boolean; contextSize: number; maxChain: number }
type LaneEntry = { member: string; role: 'user' | 'assistant'; content: string; ts: string }
type Approval = { id: string; requested_by: string; action: string; impact?: string; status: string; deadline?: string }
type Fold = { id: number; title: string; summary: string; created_by: string; created_at: string }
type Overview = { orders: Order[]; approvals: Approval[]; folds: Fold[]; latest_message_id: number }

const FALLBACK_MEMBERS: Member[] = CREW_FALLBACK
let ROSTER: Member[] = FALLBACK_MEMBERS
/* 机器 id → 人看的名字（工单卡、审核记录里写的是 id） */
const nameOf = (id?: string | null) => { const v = String(id || ''); if (!v) return ''; if (v === 'system') return '平台'; return ROSTER.find((m) => m.id === v.toLowerCase())?.displayName || v }
const MODE_ZH: Record<Settings['replyMode'], string> = { round: '轮流', random: '随机', mention: '只回 @' }
const ORDER_ZH: Record<string, string> = { draft: '草稿', in_progress: '进行中', paused: '已暂停', submitted: '待审', auditing: '审核中', pending_restart: '已过审·待上线', accepted: '已过审', rejected: '已退回', closed: '已关闭' }
/* exec 跑法的成员每条消息现起一个进程，平时本来就没有常驻进程——不是"休眠"，是随叫随到 */
const stateLabel = (s?: string) => s === 'busy' ? '说话中' : s === 'error' ? '异常' : '待命'
/* 工单时间是 SQLite 的 "YYYY-MM-DD HH:MM:SS"（UTC），消息是 ISO——统一成 ISO 再比，不然同一天里会排错位 */
const toIso = (t?: string) => { const v = String(t || ''); return /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(v) ? v.replace(' ', 'T') + 'Z' : v }
const fingerprint = (m: Omit<CrewMsg, 'key'>) => `${m.ts}|${m.sender}|${m.content}`
const parseHistory = (row: any): CrewMsg => {
  let meta: any = {}; try { const rawMeta = row.meta ?? row.metadata; meta = typeof rawMeta === 'string' ? JSON.parse(rawMeta) : (rawMeta || {}) } catch {}
  const m = { role: row.role || 'assistant', content: String(row.content || ''), sender: String(meta.sender || 'system'), displayName: String(meta.displayName || meta.sender || 'system'), ts: String(row.ts || new Date().toISOString()), error: Boolean(meta.error), attachments: Array.isArray(meta.attachments) ? meta.attachments : undefined }
  // 工单状态卡在记录里是一行 JSON（刷新后以前直接当文字显示）：解析出来，画成一行小字
  let card: OrderCardEvt | undefined
  if (meta.type === 'order_card') { try { card = JSON.parse(m.content) } catch { card = undefined } }
  return { ...m, card, key: String(row.id || fingerprint(m)) }
}
/* 附件路径行是给 AI 看的（本机直读），人眼里剥掉换成图片卡 */
const stripAttachLines = (s: string) => s.replace(/\n?\[附件: [^\]]+\]/g, '').trim()
const fmtLeft = (deadline?: string) => {
  if (!deadline) return ''
  const ms = new Date(deadline).getTime() - Date.now()
  if (!isFinite(ms)) return ''
  if (ms <= 0) return '已超时'
  const m = Math.ceil(ms / 60000)
  return m >= 60 ? `剩 ${Math.floor(m / 60)} 时 ${m % 60} 分` : `剩 ${m} 分钟`
}
/* @名字 → 行内代码样式高亮（避开已有代码块的复杂度：群聊消息以短文本为主） */
const highlightAt = (s: string) => s.replace(/(^|[\s，。：,:])@([A-Za-z一-龥][\w一-龥-]*)/g, '$1`@$2`')

function Face({ sender, size = 30 }: { sender: string; size?: number }) {
  useAvatars()
  const m = ROSTER.find((x) => x.id === sender.toLowerCase() || x.displayName.toLowerCase() === sender.toLowerCase())
  const cls = 'shrink-0 rounded-full object-cover'
  const avatar = m ? crewAvatar(m.id) : ''
  if (avatar) return <img src={avatar} alt="" width={size} height={size} className={cls} />
  if (['user', userName().toLowerCase()].includes(sender.toLowerCase())) return <img src={userAvatarFor('group')} alt="" width={size} height={size} className={cls} />
  return <span style={{ width: size, height: size, fontSize: size * 0.42 }}
    className="grid shrink-0 place-items-center rounded-full bg-[var(--color-card)] font-medium text-[color:var(--color-ink-2)]">
    {sender === 'system' ? '平' : (m?.displayName || sender)[0]?.toUpperCase()}</span>
}

type CrewArtifact = { kind:'html'|'markdown'; name:string; content:string }
function crewArtifacts(input:string) { const artifacts:CrewArtifact[]=[]; const text=String(input||'').replace(/```(?:artifact:)?(html|md|markdown)(?:[ \t]+(?:filename=)?["']?([^\n"']+)["']?)?\n([\s\S]*?)```/gi,(whole,k,n,c)=>{const kind:CrewArtifact['kind']=String(k).toLowerCase()==='html'?'html':'markdown';if(kind==='html'&&!/<!doctype|<html|<body|<main|<section/i.test(c))return whole;const fallback=kind==='html'?'artifact.html':'artifact.md',name=String(n||fallback).trim().replace(/^filename=/i,'').replace(/["']/g,'');artifacts.push({kind,name:name.includes('.')?name:`${name}.${kind==='html'?'html':'md'}`,content:String(c).trim()});return''});return{text:text.trim(),artifacts} }
function CrewArtifactCard({a}:{a:CrewArtifact}) { const [open,setOpen]=useState(false);const url=useMemo(()=>URL.createObjectURL(new Blob([a.content],{type:a.kind==='html'?'text/html;charset=utf-8':'text/markdown;charset=utf-8'})),[a]);useEffect(()=>()=>URL.revokeObjectURL(url),[url]);return <><div className="mt-1 min-w-[250px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)]"><div className="flex items-center gap-3 p-3"><b className="grid h-9 w-9 place-items-center rounded-[var(--radius-xs)] bg-[var(--color-ink)] font-mono text-[9px] text-[var(--color-surface)]">{a.kind==='html'?'HTML':'MD'}</b><span className="min-w-0 flex-1 truncate text-[12px]">{a.name}</span></div><div className="grid grid-cols-2 border-t border-[var(--color-line)]"><button onClick={()=>setOpen(true)} className="border-r border-[var(--color-line)] py-2 text-[10px]">预览</button><a href={url} download={a.name} className="py-2 text-center text-[10px]">下载</a></div></div>{open&&<div className="fixed inset-0 z-[150] flex flex-col bg-white text-black"><header className="flex items-center gap-3 border-b p-3 pt-[max(.75rem,env(safe-area-inset-top))]"><button onClick={()=>setOpen(false)} className="text-2xl">‹</button><b className="min-w-0 flex-1 truncate">{a.name}</b><a href={url} download={a.name}>下载</a></header><div className="min-h-0 flex-1 overflow-auto">{a.kind==='html'?<iframe title={a.name} src={url} sandbox="allow-scripts allow-forms" className="h-full w-full border-0"/>:<article className="p-5"><ReactMarkdown remarkPlugins={[remarkGfm]}>{a.content}</ReactMarkdown></article>}</div></div>}</> }

/* 工单卡：夹在聊天流里流动（鼠鼠原版的灵魂画面）。展开=详情+日志评论+审核台 */
/* 审核轮次一行摘要：「第1轮 P0×1 P1×2 → 修 · 第2轮 ALL_CLEAR（审核人）」 */
function reviewSummary(rs: Review[]) {
  return rs.filter((r) => r.kind === 'review').map((r) => r.verdict === 'all_clear'
    ? `第${r.round}轮 ALL_CLEAR（${nameOf(r.actor)}）`
    : `第${r.round}轮 ${[r.p0 && `P0×${r.p0}`, r.p1 && `P1×${r.p1}`, r.p2 && `P2×${r.p2}`].filter(Boolean).join(' ')} → 修`).join(' · ')
}

function OrderCard({ o, onComment, onReview }: { o: Order; onAction?: (o: Order, to: string, comment?: string) => void; onComment: (o: Order, detail: string) => void; onReview: (o: Order, verdict: 'ALL_CLEAR' | 'changes', items: { level: string; text: string }[]) => void }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const lastMove = (o.timeline || []).slice(-1)[0]
  const auditing = o.status === 'auditing'
  const reviews = o.reviews || []
  const summary = reviewSummary(reviews)
  return (
    <div className="mb-3 w-full max-w-[420px] rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-card)] p-3">
      <button onClick={() => setOpen(!open)} className="block w-full text-left">
        <div className="flex items-center gap-2">
          <span className="rounded-[4px] border border-[var(--color-ink-4)] px-1.5 py-0.5 font-mono text-[9px] text-[color:var(--color-ink-2)]">工单</span>
          <b className="font-mono text-[11px]">{o.id}</b>
          <span className={`rounded-full px-2 py-0.5 text-[10px]
            ${o.status === 'accepted' ? 'bg-[var(--color-ink)] text-[color:var(--color-surface)]'
            : o.status === 'rejected' || o.status === 'closed' ? 'border border-[var(--color-line)] text-[color:var(--color-ink-3)]'
            : 'border border-[var(--color-ink-2)] text-[color:var(--color-ink)]'}`}>{ORDER_ZH[o.status] || o.status}</span>
          <span className="flex-1" />
          {o.assignee && <span className="text-[10px] text-[color:var(--color-ink-2)]">指派 @{nameOf(o.assignee)}</span>}
        </div>
        <div className="mt-1.5 text-[13px] font-medium leading-snug">{o.title}</div>
        {lastMove?.from && <div className="mt-1 text-[10px] text-[color:var(--color-ink-3)]">{ORDER_ZH[lastMove.from] || lastMove.from} → {ORDER_ZH[lastMove.to || ''] || lastMove.to}</div>}
        {summary && <div className="mt-1 text-[10px] text-[color:var(--color-ink-2)]">审核：{summary}</div>}
      </button>
      {open && (
        <div className="mt-2 border-t border-[var(--color-line)] pt-2">
          {o.description && <p className="mb-2 whitespace-pre-wrap text-[12px] text-[color:var(--color-ink-2)]">{o.description}</p>}
          {(o.logs || []).slice(-6).map((l, i) => (
            <div key={i} className="mb-1 text-[11px] leading-relaxed text-[color:var(--color-ink-2)]">
              <b className="text-[color:var(--color-ink)]">{l.actor || '?'}</b> {l.detail}
            </div>
          ))}
          {/* 每一轮审核留档：谁送的审、改了什么、谁审的、逐条意见 */}
          {reviews.map((r) => (
            <div key={r.id} className="mb-1.5 rounded-[var(--radius-xs)] bg-[var(--color-surface)] px-2 py-1.5 text-[11px] leading-relaxed">
              {r.kind === 'request'
                ? <><b>第{r.round}轮送审</b> · {nameOf(r.actor)}{r.detail?.files?.length ? ` · ${r.detail.files.join('、')}` : ''}{r.detail?.acceptance && <div className="text-[color:var(--color-ink-3)]">验收点：{r.detail.acceptance}</div>}</>
                : <><b>{r.verdict === 'all_clear' ? `第${r.round}轮 ALL_CLEAR` : `第${r.round}轮没过`}</b> · {nameOf(r.actor)}
                    {(r.detail?.items || []).map((it: { level: string; text: string }, i: number) => <div key={i} className={it.level === 'P0' ? 'text-red-700' : 'text-[color:var(--color-ink-2)]'}>[{it.level}] {it.text}</div>)}</>}
            </div>
          ))}
          {auditing && (
            <div className="mb-2 mt-2 flex flex-wrap gap-1.5">
              <button onClick={() => onReview(o, 'ALL_CLEAR', [])}
                className="rounded-full bg-[var(--color-ink)] px-3 py-1 text-[10px] text-[color:var(--color-surface)]">ALL_CLEAR · 过审</button>
              {(['P0', 'P1'] as const).map((p) => (
                <button key={p} onClick={() => { const d = prompt(`${p} 意见（${p === 'P0' ? '不修不能上' : '建议修'}），会退回去修`); if (d?.trim()) onReview(o, 'changes', [{ level: p, text: d.trim() }]) }}
                  className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1 text-[10px]">{p} 退回</button>
              ))}
              <button onClick={() => { const d = prompt('P2 记录（不阻塞，只留一句）'); if (d?.trim()) onComment(o, `[P2] ${d.trim()}`) }}
                className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[10px]">P2 记录</button>
            </div>
          )}
          <div className="mt-1 flex gap-1.5">
            <input value={note} onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) { onComment(o, note.trim()); setNote('') } }}
              placeholder="在这张单下留一句…"
              className="min-w-0 flex-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-1.5 text-[11px] outline-none" />
            <button onClick={() => { if (note.trim()) { onComment(o, note.trim()); setNote('') } }}
              className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-3 text-[11px]">留言</button>
          </div>
        </div>
      )}
    </div>
  )
}

const sheetWrap = 'fixed inset-0 z-[140] flex items-end bg-black/25 backdrop-blur-[2px]'
const sheetBody = 'w-full rounded-t-[var(--radius-xl)] bg-[var(--color-bg)] px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]'

function MemberSheet({ m, state, onClose, onMention, onWhisper }: { m: Member; state?: string; onClose: () => void; onMention: () => void; onWhisper: () => void }) {
  return <div className={sheetWrap} onClick={onClose}>
    <div className={sheetBody} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-3">
        <Face sender={m.id} size={44} />
        <div className="min-w-0 flex-1">
          <b className="text-[15px]">{m.displayName}</b>
          {m.roleTitle && <span className="ml-2 rounded-full border border-[var(--color-line)] px-2 py-0.5 text-[10px]">{m.roleTitle}</span>}
          <div className="mt-0.5 text-[11px] text-[color:var(--color-ink-3)]">{stateLabel(state)}{m.rounds === false ? ' · 不参加轮流，只在被 @ 时说话' : ''}</div>
        </div>
      </div>
      {m.duty && <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--color-ink-2)]">{m.duty}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={onMention} className="rounded-full border border-[var(--color-line)] bg-[var(--color-card)] py-2.5 text-[13px]">@他</button>
        <button onClick={onWhisper} className="rounded-full bg-[var(--color-ink)] py-2.5 text-[13px] text-[color:var(--color-surface)]">悄悄话</button>
      </div>
    </div>
  </div>
}

function WhisperSheet({ m, entries, typing, onSend, onClose }: { m: Member; entries: LaneEntry[]; typing: boolean; onSend: (t: string) => Promise<boolean>; onClose: () => void }) {
  const [t, setT] = useState('')
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { requestAnimationFrame(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }) }, [entries.length, typing])
  const send = async () => { const v = t.trim(); if (!v) return; setT(''); if (!await onSend(v)) setT(v) }
  return <div className={sheetWrap} onClick={onClose}>
    <div className={`${sheetBody} flex h-[72vh] flex-col`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center gap-2 pb-2">
        <Face sender={m.id} size={28} />
        <b className="flex-1 text-[14px]">和 {m.displayName} 的悄悄话</b>
        <button onClick={onClose} className="px-2 text-[18px] leading-none text-[color:var(--color-ink-3)]">✕</button>
      </div>
      <p className="mb-2 text-[10px] text-[color:var(--color-ink-3)]">只有你俩看得到，不进群聊。他之后在群里说话时会带着这些悄悄话。</p>
      <div ref={box} className="min-h-0 flex-1 space-y-2 overflow-y-auto py-1">
        {!entries.length && <p className="mt-8 text-center text-[12px] text-[color:var(--color-ink-3)]">还没说过悄悄话</p>}
        {entries.map((e, i) => <div key={i} className={`flex ${e.role === 'user' ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-[82%] whitespace-pre-wrap rounded-[16px] px-3 py-2 text-[13px] ${e.role === 'user' ? 'bg-[var(--color-ink)] text-[color:var(--color-surface)]' : 'border border-[var(--color-line)] bg-[var(--color-card)]'}`}>{e.content}</div>
        </div>)}
        {typing && <p className="text-[11px] text-[color:var(--color-ink-3)]">{m.displayName} 在想…</p>}
      </div>
      <div className="mt-2 flex items-end gap-2">
        <textarea value={t} onChange={(e) => setT(e.target.value)} rows={1} placeholder={`悄悄跟 ${m.displayName} 说…`}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
          className="min-h-10 min-w-0 flex-1 resize-none rounded-[20px] border border-[var(--color-line)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[13px] outline-none" />
        <button onClick={() => void send()} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-ink)] text-[color:var(--color-surface)]">➤</button>
      </div>
    </div>
  </div>
}

function SettingsSheet({ s, onChange, onClose }: { s: Settings; onChange: (patch: Partial<Settings>) => void; onClose: () => void }) {
  const opt = (on: boolean) => `rounded-full px-3 py-1.5 text-[12px] ${on ? 'bg-[var(--color-ink)] text-[color:var(--color-surface)]' : 'border border-[var(--color-line)]'}`
  return <div className={sheetWrap} onClick={onClose}>
    <div className={sheetBody} onClick={(e) => e.stopPropagation()}>
      <b className="text-[15px]">群设置</b>
      <div className="mt-3 text-[12px] font-medium">没 @ 人的时候谁来接话</div>
      <div className="mt-1.5 flex gap-2">{(['round', 'random', 'mention'] as const).map((k) => <button key={k} onClick={() => onChange({ replyMode: k })} className={opt(s.replyMode === k)}>{MODE_ZH[k]}</button>)}</div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">
        {s.replyMode === 'round' ? '从上次说话的人往后，一个接一个说；每个人都看得到前面的人刚说的。你 @ 的人排最前。'
          : s.replyMode === 'random' ? '随机几个人稍微错开一点同时接；你 @ 了就只有被 @ 的人。' : '只有被 @ 的人才回。'}
      </p>
      <label className="mt-3 flex items-center justify-between text-[12px]">
        <span>允许沉默<span className="ml-1 text-[11px] text-[color:var(--color-ink-3)]">（没什么可说就不说，不硬凑一句）</span></span>
        <input type="checkbox" checked={s.allowSilence} onChange={(e) => onChange({ allowSilence: e.target.checked })} />
      </label>
      <p className="mt-3 text-[11px] text-[color:var(--color-ink-3)]">成员能看到最近 {s.contextSize} 条群聊；互相 @ 接力最多 {s.maxChain} 次就停。</p>
      <button onClick={onClose} className="mt-4 w-full rounded-full border border-[var(--color-line)] py-2.5 text-[13px]">好</button>
    </div>
  </div>
}

export default function CrewChat() {
  const roomId = getRoom()
  const { look } = useChatLook(roomId)
  const [selecting, setSelecting] = useState(false), [selected, setSelected] = useState<string[]>([])
  const [forwarding, setForwarding] = useState<Selection[] | null>(null)
  const toggleSelected = (id: string) => setSelected(ids => ids.includes(id) ? ids.filter(x => x !== id) : ids.length < 20 ? [...ids, id] : ids)
  const [msgs, setMsgs] = useState<CrewMsg[]>([]), [status, setStatus] = useState<Record<string, AgentStatus>>({})
  const [text, setText] = useState(''), [connected, setConnected] = useState(false)
  const [pendingAtts, setPendingAtts] = useState<Attachment[]>([])
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [view, setView] = useState<'chat'|'tasks'>('chat'), [overview, setOverview] = useState<Overview>({ orders: [], approvals: [], folds: [], latest_message_id: 0 })
  const [openFold, setOpenFold] = useState<number | null>(null)
  const box = useRef<HTMLDivElement>(null), seen = useRef(new Set<string>())
  const [members, setMembers] = useState<Member[]>(FALLBACK_MEMBERS)
  const [settings, setSettings] = useState<Settings>({ replyMode: 'round', allowSilence: true, contextSize: 30, maxChain: 6 })
  const [sheet, setSheet] = useState<null | { kind: 'member' | 'whisper'; m: Member } | { kind: 'settings' }>(null)
  const [lanes, setLanes] = useState<Record<string, LaneEntry[]>>({}), [laneTyping, setLaneTyping] = useState<Record<string, boolean>>({})
  const anyBusy = Object.values(status).some((x) => x?.state === 'busy')
  const mentionAll = () => setText(v => `${v}${v && !v.endsWith(' ') ? ' ' : ''}${members.map(m => `@${m.displayName}`).join(' ')} `)
  const add = (m: CrewMsg) => { const fp = fingerprint(m); if (seen.current.has(fp)) return; seen.current.add(fp); setMsgs(p => [...p.slice(-499), m]); requestAnimationFrame(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight }) }
  const [offline, setOffline] = useState(false)
  const reload = async () => {
    // 群聊后端是 mousecrew；没装/没反代时这里拿到的不是 JSON，别让整页报错，显示一行说明
    const d = await fetch(`${BASE}/api/group/history?limit=200`, { cache: 'no-store' }).then(r => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : null)).catch(() => null)
    setOffline(!d)
    if (!d) return
    const list = (d.messages || []).map(parseHistory); seen.current = new Set(list.map(fingerprint)); setMsgs(list)
    const s = await fetch(`${BASE}/api/agents/status`, { cache: 'no-store' }).then(r => r.json()).catch(() => null); if (s) setStatus(s)
    const mb = await fetch(`${BASE}/api/group/members`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
    if (mb?.members?.length) { ROSTER = mb.members; setMembers(mb.members); setCrewRoster(mb.members) }
    const st = await fetch(`${BASE}/api/group/settings`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
    if (st?.settings) setSettings(st.settings)
    await reloadOverview()
    requestAnimationFrame(() => { if (box.current) box.current.scrollTop = box.current.scrollHeight })
  }
  const reloadOverview = async () => {
    const r = await fetch(`${BASE}/api/collab/overview`, { cache: 'no-store' }).catch(() => null)
    const o = r?.ok ? await r.json().catch(() => null) : null
    if (o) setOverview(o)
  }
  useEffect(() => {
    void reload(); const es = new EventSource(`${BASE}/api/group/events`)
    es.onopen = () => setConnected(true); es.onerror = () => { setConnected(false); void reload() }
    es.onmessage = e => { let d: any; try { d = JSON.parse(e.data) } catch { return }; if (d.type === 'connected') return; if (d.type === 'message') { const m = { role: d.role || 'assistant', content: String(d.content || ''), sender: String(d.sender || 'system'), displayName: String(d.displayName || d.sender || 'system'), ts: String(d.ts || new Date().toISOString()), error: Boolean(d.error), attachments: Array.isArray(d.attachments) ? d.attachments : undefined }; add({ ...m, key: String(d.id || fingerprint(m)) }); if (m.role === 'assistant') setStatus(p => ({ ...p, [m.sender]: { ...(p[m.sender] || {}), state: 'idle' } })) }
      else if (d.type === 'typing') setStatus(p => ({ ...p, [d.sender]: { ...(p[d.sender] || {}), state: 'busy' } }))
      else if (d.type === 'idle' || d.type === 'silence' || d.type === 'waiting') setStatus(p => ({ ...p, [d.sender]: { ...(p[d.sender] || {}), state: 'idle' } }))
      else if (d.type === 'stopped') setStatus(p => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, state: 'idle' }])))
      else if (d.type === 'settings' && d.settings) setSettings(d.settings)
      else if (d.type === 'lane' && d.entry) { setLanes(p => ({ ...p, [d.member]: [...(p[d.member] || []), d.entry] })); if (d.entry.role === 'assistant') setLaneTyping(p => ({ ...p, [d.member]: false })) }
      else if (d.type === 'lane_typing') setLaneTyping(p => ({ ...p, [d.member]: true }))
      if (d.type === 'approval' || d.type === 'fold' || d.type === 'order_card') void reloadOverview() }
    const timer = setInterval(() => { void fetch(`${BASE}/api/agents/status`, { cache: 'no-store' }).then(r => r.json()).then(setStatus).catch(() => {}) }, 5000)
    return () => { es.close(); clearInterval(timer) }
  }, [])
  const mention = (name: string) => setText(v => `${v}${v && !v.endsWith(' ') ? ' ' : ''}@${name} `)
  async function pickFiles(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    for (const f of Array.from(files).slice(0, 6)) {
      if (f.size > 9 * 1024 * 1024) { alert(`${f.name} 超过9MB，跳过`); continue }
      const b64 = await new Promise<string>((ok) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.readAsDataURL(f) })
      const r = await fetch(`${BASE}/api/group/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: f.name, mime: f.type, data: b64 }) }).catch(() => null)
      if (r?.ok) { const d = await r.json(); setPendingAtts((p) => [...p, { name: d.name, mime: d.mime, url: d.url, path: d.path }]) }
      else alert(`${f.name} 上传失败`)
    }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }
  async function send() {
    const message = text.trim() || (pendingAtts.length ? '看一下附件' : '')
    if (!message) return
    const atts = pendingAtts
    setText(''); setPendingAtts([])
    const r = await fetch(`${BASE}/api/group/chat`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify({ sender: userName(), message, ...(atts.length ? { attachments: atts } : {}) }) })
    if (!r.ok) { setText(message); setPendingAtts(atts) }
  }
  async function stopAll() { await fetch(`${BASE}/api/group/stop`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(() => null) }
  async function changeSettings(patch: Partial<Settings>) {
    const r = await fetch(`${BASE}/api/group/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) }).catch(() => null)
    if (r?.ok) { const d = await r.json(); if (d.settings) setSettings(d.settings) } else alert('没改成')
  }
  async function openWhisper(m: Member) {
    setSheet({ kind: 'whisper', m })
    const d = await fetch(`${BASE}/api/group/lanes/${encodeURIComponent(m.id)}`, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null)
    if (d?.entries) setLanes(p => ({ ...p, [m.id]: d.entries }))
  }
  async function whisper(m: Member, message: string) {
    const r = await fetch(`${BASE}/api/group/whisper`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ member: m.id, message }) }).catch(() => null)
    if (!r?.ok) { alert('没发出去'); return false }
    return true
  }
  async function reviewOrder(o: Order, verdict: 'ALL_CLEAR' | 'changes', items: { level: string; text: string }[]) {
    const r = await fetch(`${BASE}/api/orders/${o.id}/review`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor: userName(), verdict, items }) })
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.error || '没审成'); return }
    await reloadOverview()
  }
  async function decide(id: string, decision: 'approved'|'rejected') { await fetch(`${BASE}/api/collab/approvals/${id}/decision`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ decision, by:userName() }) }); await reloadOverview() }
  async function createTask() { const title = prompt('任务目标'); if (!title?.trim()) return; const assignee = prompt(`交给谁：${members.map(m => m.id).join(' / ')}（可留空）`, members.find(m => m.role === 'builder')?.id || 'opus') || ''; const r = await fetch(`${BASE}/api/orders`, { method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:title.trim(),assignee:assignee.trim()||null,actor:userName()})}); if(!r.ok){alert((await r.json()).error||'创建失败');return} const o=await r.json(); await fetch(`${BASE}/api/orders/${o.id}/transition`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to_status:'in_progress',actor:userName(),comment:'从群聊创建'})}); await reloadOverview() }
  async function foldTask(o: Order) { const summary = [o.description, ...(o.logs || []).slice(-3).map(x=>x.detail)].filter(Boolean).join('\n') || `${o.title} 已完成。`; await fetch(`${BASE}/api/collab/folds`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:`${o.id} · ${o.title}`,summary,created_by:userName()})}); await reloadOverview() }
  async function changeOrder(o: Order, to: string, comment?: string) {
    const endpoint = to === 'paused' ? `${BASE}/api/orders/${o.id}/pause` : to === 'in_progress' ? `${BASE}/api/orders/${o.id}/resume` : `${BASE}/api/orders/${o.id}/transition`
    const body = to === 'paused' ? { actor: userName(), reason: `由 ${userName()} 在任务账本暂停` } : to === 'in_progress' ? { actor: userName() } : { to_status: to, actor: userName(), comment: comment || (to === 'closed' ? `由 ${userName()} 停止任务` : to === 'accepted' ? 'ALL_CLEAR' : `${userName()} 退回任务`) }
    const r = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) })
    if (!r.ok) { const d = await r.json().catch(()=>({})); alert(d.error || '状态更新失败'); return }
    await reloadOverview()
  }
  async function commentOrder(o: Order, detail: string) {
    await fetch(`${BASE}/api/orders/${o.id}/logs`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actor: userName(), detail }) }).catch(() => {})
    await reloadOverview()
  }
  const orderActions = (o: Order) => {
    const actions = o.status === 'in_progress' ? [['paused','暂停'],['closed','停止']] : o.status === 'paused' ? [['in_progress','继续'],['closed','停止']] : o.status === 'submitted' ? [['accepted','ALL_CLEAR 过审'],['rejected','退回'],['closed','关闭']] : o.status === 'rejected' ? [['in_progress','重开'],['closed','关闭']] : []
    return actions.length ? <div className="mt-2 flex flex-wrap gap-2">{actions.map(([to,label])=><button key={to} onClick={()=>void changeOrder(o,to)} className={`rounded-full px-2.5 py-1 text-[10px] ${to==='closed'?'border border-red-200 text-red-700':'border border-[var(--color-line)]'}`}>{label}</button>)}</div> : null
  }
  const pending = overview.approvals.filter(a => a.status === 'pending')
  /* 焦点工单：最新的活跃单，挂在 header（鼠鼠家的 NAG-045·待重启·+3） */
  const active = overview.orders.filter(o => !['closed', 'accepted', 'draft'].includes(o.status))
  const focus = active.sort((a, b) => toIso(b.updated_at).localeCompare(toIso(a.updated_at)))[0]
  /* 工单卡混进聊天流：按时间与消息排序 */
  const stream = useMemo(() => {
    const cards = overview.orders.filter(o => o.status !== 'draft').map(o => ({ kind: 'order' as const, ts: toIso(o.updated_at || o.created_at || ''), o }))
    const texts = msgs.map(m => ({ kind: 'msg' as const, ts: toIso(m.ts), m }))
    return [...texts, ...cards].sort((a, b) => a.ts.localeCompare(b.ts))
  }, [msgs, overview.orders])

  return <div className={`absolute inset-0 flex flex-col tg-room ${look.glass ? 'tg-glass' : ''}`} style={chatRoomStyle(look)}>
    {/* 成员大头像行 */}
    <div className="flex shrink-0 items-start gap-4 overflow-x-auto border-b border-[var(--color-line)] bg-[var(--color-bg)] px-4 pb-2 pt-2">
      {members.map(m => {
        const st = status[m.id]?.state
        return (
          <button key={m.id} onClick={() => setSheet({ kind: 'member', m })} className="flex w-[52px] shrink-0 flex-col items-center gap-1">
            <span className="relative">
              <Face sender={m.id} size={40} />
              <i className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--color-bg)]
                ${st === 'busy' ? 'animate-pulse bg-amber-400' : st === 'idle' ? 'bg-emerald-500' : 'bg-[var(--color-ink-4)]'}`} />
            </span>
            <span className="text-[10px] font-medium leading-none">{m.displayName}</span>
            <span className="text-[9px] leading-none text-[color:var(--color-ink-3)]">{st === 'busy' ? '说话中' : (m.roleTitle || stateLabel(st))}</span>
          </button>
        )
      })}
      <span className="ml-auto flex items-center gap-1.5 self-center">
        <button onClick={() => setSheet({ kind: 'settings' })} className="shrink-0 whitespace-nowrap rounded-full border border-[var(--color-line)] bg-[var(--color-card)] px-2.5 py-1 text-[10px]">{MODE_ZH[settings.replyMode]} ⚙︎</button>
        <button onClick={mentionAll} className="shrink-0 whitespace-nowrap rounded-full border border-[var(--color-line)] bg-[var(--color-card)] px-2.5 py-1 text-[10px]">@全员</button>
        <i className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-red-300'}`} />
      </span>
    </div>
    {/* 焦点工单行 */}
    {focus && (
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-line)] bg-[var(--color-card)] px-4 py-1.5 text-[11px]">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--color-ink)]" />
        <b className="font-mono">{focus.id}</b>
        <span>{ORDER_ZH[focus.status] || focus.status}</span>
        {active.length > 1 && <span className="text-[color:var(--color-ink-3)]">+{active.length - 1}</span>}
        <span className="min-w-0 flex-1 truncate text-[color:var(--color-ink-2)]">{focus.title}</span>
      </div>
    )}
    <div className="flex shrink-0 border-b border-[var(--color-line)] bg-[var(--color-bg)] px-4">
      <button onClick={() => { setSelecting(v => !v); setSelected([]); setView('chat') }} className="ml-auto order-last px-2 text-[12px] text-[color:var(--color-ink-2)]">{selecting ? '取消多选' : '多选转发'}</button>
      <button onClick={()=>setView('chat')} className={`mr-5 py-2 text-[12px] ${view==='chat'?'border-b-2 border-[var(--color-ink)] font-semibold':'text-[color:var(--color-ink-3)]'}`}>群聊{pending.length>0&&<i className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-red-500"/>}</button>
      <button onClick={()=>{setView('tasks');void reloadOverview()}} className={`py-2 text-[12px] ${view==='tasks'?'border-b-2 border-[var(--color-ink)] font-semibold':'text-[color:var(--color-ink-3)]'}`}>进度</button>
    </div>
    {view === 'chat' ? <>
    {pending.map(a=><div key={a.id} className="mx-3 mt-2 rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-[12px] text-red-950">
      <div className="flex items-baseline gap-2"><b>需要权限确认 · {a.requested_by}</b><span className="ml-auto shrink-0 text-[10px] text-red-600">{fmtLeft(a.deadline)}</span></div><div className="mt-1">{a.action}</div>{a.impact&&<div className="mt-1 text-red-700">影响：{a.impact}</div>}
      <div className="mt-2 flex gap-2"><button onClick={()=>void decide(a.id,'approved')} className="rounded-full bg-red-950 px-3 py-1 text-white">批准一次</button><button onClick={()=>void decide(a.id,'rejected')} className="rounded-full border border-red-300 px-3 py-1">拒绝</button></div>
    </div>)}
    {!!overview.folds.length&&<div className="mx-3 mt-2 space-y-1">{overview.folds.slice(0,3).map(f=><button key={f.id} onClick={()=>setOpenFold(openFold===f.id?null:f.id)} className="block w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-left text-[11px]"><b>已折叠 · {f.title}</b>{openFold===f.id&&<span className="mt-1 block whitespace-pre-wrap text-[color:var(--color-ink-2)]">{f.summary}</span>}</button>)}</div>}
    <div ref={box} className="tg-scroll min-h-0 flex-1 overflow-y-auto px-[10px] py-2">
      {offline && <p className="mx-4 mt-8 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3 text-center text-[12px] leading-relaxed text-[color:var(--color-ink-2)]">群聊后端（mousecrew）没连上：还没安装，或者反向代理里没配 /crew-api。安装方法见 README 的「群聊」一节。</p>}
      {!offline && !stream.length && <p className="mt-10 text-center text-[12px] text-[color:var(--color-ink-3)]">{settings.replyMode === 'mention' ? '@ 成员叫醒他' : `现在是「${MODE_ZH[settings.replyMode]}」：直接说话就有人接，@ 谁谁先说`}<br/>他们也会在回复里 @ 对方把话递过去；点头像可以说悄悄话</p>}
      {stream.map((item) => {
        if (item.kind === 'order') return <OrderCard key={'o-' + item.o.id + item.o.status} o={item.o} onAction={changeOrder} onComment={commentOrder} onReview={reviewOrder} />
        const m = item.m
        // 工单状态变化：一行小字，不画成气泡（以前刷新后是一坨 JSON）
        if (m.card) return <p key={m.key} className="my-1.5 text-center text-[10px] text-[color:var(--color-ink-3)]">
          〔工单〕{m.card.order_id} {ORDER_ZH[m.card.from_status || ''] || m.card.from_status || '新建'} → {ORDER_ZH[m.card.to_status || ''] || m.card.to_status}{m.card.actor ? `（${nameOf(m.card.actor)}）` : ''}</p>
        const av = crewArtifacts(stripAttachLines(m.content))
        const mine = m.role === 'user' && m.sender !== 'system'
        const atts = m.attachments || []
        return <div key={m.key} onClickCapture={e => { if (selecting) { e.preventDefault(); e.stopPropagation(); toggleSelected(m.key) } }} className={`mb-2 flex items-end gap-2 ${selecting ? 'forward-row' : ''} ${mine ? 'justify-end' : 'justify-start'}`}>
          {selecting && <button className="forward-check" role="checkbox" aria-checked={selected.includes(m.key)} aria-label={`选择 ${m.displayName} 的消息`}>{selected.includes(m.key) ? '✓' : ''}</button>}
          {!mine && <Face sender={m.sender} size={28} />}
          <div className={`max-w-[88%] ${mine ? 'text-right' : ''}`}>
            {!mine && <div className="mb-0.5 px-1 text-[10px] font-medium text-[color:var(--color-ink-3)]">{m.sender === 'system' ? '平台' : m.displayName}</div>}
            {av.text&&<div className={`tg-bubble relative text-left ${mine ? 'tg-bubble-user loop-me' : 'tg-bubble-ai loop-you'} ${m.error ? 'ring-1 ring-red-300' : ''}`}
              style={{ backgroundColor: m.error ? '#fff1f2' : bubbleBg(look, mine), color: m.error ? '#991b1b' : bubbleInk(look, mine) }}>
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={{p:({children})=><p className="mb-2 whitespace-pre-wrap last:mb-0">{children}</p>,code:({children})=><code className={`rounded px-1 font-mono text-[.88em] ${mine?'bg-white/20':'bg-black/10'}`}>{children}</code>}}>{highlightAt(av.text)}</ReactMarkdown>
              <span className="tg-time ml-1.5 inline-flex translate-y-[2px] items-center gap-1 whitespace-nowrap text-[10px] leading-none select-none">
                {new Date(m.ts).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}{mine && <span className="tracking-[-0.18em]">✓✓</span>}
              </span>
            </div>}
            {atts.map((a, i) => a.mime.startsWith('image/')
              ? <img key={i} src={`${BASE}${a.url}`} alt={a.name} className="mt-1 max-h-[240px] max-w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] object-contain" />
              : <a key={i} href={`${BASE}${a.url}`} download={a.name}
                  className="mt-1 flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-left text-[11px]">
                  <b className="grid h-8 w-8 shrink-0 place-items-center rounded-[var(--radius-xs)] bg-[var(--color-ink)] font-mono text-[8px] text-[color:var(--color-surface)]">{(a.name.split('.').pop() || 'file').slice(0, 4).toUpperCase()}</b>
                  <span className="min-w-0 truncate">{a.name}</span>
                </a>)}
            {!mine&&av.artifacts.map((a,i)=><CrewArtifactCard key={i} a={a}/>)}
          </div>
        </div>
      })}
    </div>
    {selecting && <SelectionBar count={selected.length} onCancel={() => { setSelecting(false); setSelected([]) }} onForward={() => setForwarding(msgs.filter(m => selected.includes(m.key)).map(m => ({ id: m.key, role: m.role, content: m.content, ts: m.ts })))} />}
    {forwarding && <ForwardSheet source="group" messages={forwarding} onClose={() => setForwarding(null)} onSent={() => { setSelecting(false); setSelected([]) }} />}
    {!!pendingAtts.length && (
      <div className="mx-3 mb-1 flex flex-wrap gap-1.5">
        {pendingAtts.map((a, i) => (
          <span key={i} className="flex items-center gap-1.5 rounded-full border border-[var(--color-line)] bg-[var(--color-card)] px-2.5 py-1 text-[10px]">
            {a.mime.startsWith('image/') && <img src={`${BASE}${a.url}`} alt="" className="h-5 w-5 rounded object-cover" />}
            <span className="max-w-[120px] truncate">{a.name}</span>
            <button onClick={() => setPendingAtts((p) => p.filter((_, j) => j !== i))} className="text-[color:var(--color-ink-3)]">✕</button>
          </span>
        ))}
      </div>
    )}
    <div className="tg-composer mx-2.5 mb-[max(.4rem,env(safe-area-inset-bottom))] flex items-end gap-2 p-1.5">
      <input ref={fileRef} type="file" multiple className="hidden" onChange={(e) => void pickFiles(e.target.files)} />
      <button onClick={() => fileRef.current?.click()} disabled={uploading}
        className="tg-compose-action grid h-10 w-10 shrink-0 place-items-center rounded-full text-[17px] leading-none disabled:opacity-40">{uploading ? '…' : '+'}</button>
      <button onClick={mentionAll} className="tg-compose-action grid h-10 w-10 shrink-0 place-items-center rounded-full text-sm">@</button>
      <textarea value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();void send()} }} rows={1} placeholder={settings.replyMode === 'mention' ? '@成员，派任务或讨论…' : '说点什么，大家接着聊…'} className="tg-compose-input min-h-10 min-w-0 flex-1 resize-none px-3.5 py-2.5 outline-none"/>
      {anyBusy && <button onClick={() => void stopAll()} title="停：排队的作废，正在说的打断"
        className="tg-compose-action grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px]">■</button>}
      <button onClick={() => void send()} className="tg-compose-action grid h-10 w-10 shrink-0 place-items-center rounded-full">➤</button>
    </div>
    </> : <div className="min-h-0 flex-1 overflow-y-auto bg-[var(--color-bg)] px-3 py-3">
      <div className="mb-3 flex items-center justify-between"><div><b>任务账本</b><span className="ml-2 text-[11px] text-[color:var(--color-ink-3)]">{overview.orders.length} 项</span></div><button onClick={()=>void createTask()} className="rounded-full bg-[var(--color-ink)] px-3 py-1.5 text-[11px] text-[var(--color-surface)]">＋ 新任务</button></div>
      {pending.map(a=><div key={a.id} className="mb-3 rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-[11px] text-red-950"><b>待批准 · {a.requested_by}</b><p className="mt-1">{a.action}</p><div className="mt-2 flex gap-2"><button onClick={()=>void decide(a.id,'approved')} className="rounded-full bg-red-950 px-3 py-1 text-white">批准一次</button><button onClick={()=>void decide(a.id,'rejected')} className="rounded-full border border-red-300 px-3 py-1">拒绝</button></div></div>)}
      {['in_progress','paused','submitted','auditing','accepted','rejected','closed'].map(state=>{const rows=overview.orders.filter(o=>o.status===state);if(!rows.length)return null;return <section key={state} className="mb-4"><div className="mb-1 px-1 text-[10px] uppercase tracking-wider text-[color:var(--color-ink-3)]">{(ORDER_ZH as any)[state]}</div>{rows.map(o=><article key={o.id} className="mb-2 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3"><div className="flex gap-2"><b className="text-[11px]">{o.id}</b><span className="flex-1 font-medium">{o.title}</span>{o.assignee&&<span className="text-[11px] text-[color:var(--color-ink-2)]">@{o.assignee}</span>}</div>{o.description&&<p className="mt-1 text-[12px] text-[color:var(--color-ink-2)]">{o.description}</p>}{orderActions(o)}{(state==='accepted'||state==='closed')&&<button onClick={()=>void foldTask(o)} className="mt-2 rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[10px]">折叠到群聊顶部</button>}</article>)}</section>})}
      {!overview.orders.length&&<p className="py-16 text-center text-[12px] text-[color:var(--color-ink-3)]">还没有任务，点右上角创建</p>}
    </div>}
    {sheet?.kind === 'member' && <MemberSheet m={sheet.m} state={status[sheet.m.id]?.state} onClose={() => setSheet(null)}
      onMention={() => { mention(sheet.m.displayName); setSheet(null) }} onWhisper={() => void openWhisper(sheet.m)} />}
    {sheet?.kind === 'whisper' && <WhisperSheet m={sheet.m} entries={lanes[sheet.m.id] || []} typing={!!laneTyping[sheet.m.id]}
      onSend={(t) => whisper(sheet.m, t)} onClose={() => setSheet(null)} />}
    {sheet?.kind === 'settings' && <SettingsSheet s={settings} onChange={(p) => void changeSettings(p)} onClose={() => setSheet(null)} />}
  </div>
}

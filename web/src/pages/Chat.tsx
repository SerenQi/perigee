import { aiAvatarFor, userAvatarFor, useAvatars } from '../lib/avatars'
import { aiName, userName } from '../lib/identity'
import { API_BASE } from '../lib/config'
import { motion } from 'framer-motion'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchHistoryPage, appendHistory, streamChat, stopChat, newId, extractChoices, type Msg, type Choice , extractSong, songUrl, startListening, type SongCard, extractInvite, type InviteCard } from '../lib/api'
import SlashPanel, { SLASH } from '../shell/SlashPanel'
import { getChannel, getModel } from '../shell/ModelPicker'
import { avatarsOn, voiceTextHidden, PREFS_CHANGED } from '../shell/Settings'
import { getEffort } from '../lib/api'
import Search from '../shell/Search'
import VoiceBubble from '../shell/VoiceBubble'
import PhotoStack from '../shell/PhotoStack'
import { IconMicSolid, IconPhotoSolid } from '../shell/icons'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { answerPermission, fetchRooms, uploadImages, transcribe, pingTyping, getRoom, uploadAudio, attachAudio, colAdd,
  ttsBlob, hasVoiceMarker, stripVoiceMarker, FILE_MARK, stripFileMarkers, outboxUrl, type Block, type OutMsg, type Pic, type ToolRec,
  extractStickers, stickerList, stickerMarker, type Sticker } from '../lib/api'
import StickerPanel from '../shell/StickerPanel'
import { STICKERS_UPDATED } from '../shell/StickerManager'
import { BELL_USER, OPEN_BELL_EVENT, takeBells, ringBell, BellIcon, BellLine } from '../lib/bell'
type ViewMsg = Msg & { bell?: { who: string; text: string }; choice?: Choice }
function takeChoices(content: string, pending?: boolean): { text: string; choice: Choice | null } {
  const r = extractChoices(content)
  const text = pending && !r.choice ? r.cleanText.replace(/\[choices:[\s\S]*$/i, '').trimEnd() : r.cleanText
  return { text, choice: r.choice }
}

const IconSticker = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
       strokeLinecap="round" strokeLinejoin="round" className="h-[17px] w-[17px]">
    <path d="M20 12.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h6.5M20 12.5L12.5 20M20 12.5h-5.5a2 2 0 00-2 2V20" />
    <path d="M9 9.5h.01M14 9.5h.01M8.5 13.5a4 4 0 003.5 1.5" />
  </svg>
)

// 表情包：库里有就出图，库里没有（删了/我写错名字）就留一行淡字，不装成图
function StickerImg({ name, lib }: { name: string; lib: Map<string, string> }) {
  const url = lib.get(name)
  if (!url) return <span className="text-[12px] opacity-60">[表情包：{name}]</span>
  return <img src={url} alt={name} title={name} className="max-h-[140px] max-w-[140px] object-contain" />
}

function ToolsRow({ tools, pending }: { tools: ToolRec[]; pending?: boolean }) {
  const [open, setOpen] = useState(false)
  const running = pending ? tools.filter((t) => !t.done).length : 0
  const failed = tools.filter((t) => t.ok === false).length
  return (
    <div className="mb-1.5 text-[11px]">
      <button type="button" onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }} aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-full bg-black/[.06] px-2 py-0.5 opacity-75 active:opacity-100">
        <svg viewBox="0 0 24 24" className="h-[11px] w-[11px]" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M14.7 6.3a4 4 0 00-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 005.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z" />
        </svg>
        <span>{running ? `正在用 ${tools[tools.length - 1]?.name}…` : `用了 ${tools.length} 个工具`}{failed ? ` · ${failed} 个出错` : ''}</span>
        <span className="text-[9px] transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }}>▸</span>
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 pl-1">
          {tools.map((t, i) => (
            <li key={i} className="flex items-center gap-1.5 opacity-75">
              <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${t.ok === false ? 'bg-[#e5484d]' : t.done ? 'bg-current opacity-50' : 'animate-pulse bg-current'}`} />
              <span className="min-w-0 truncate font-mono text-[10.5px]">{t.name}</span>
              <span className="shrink-0 text-[10px] opacity-70">{t.ok === false ? '出错' : t.done ? '完成' : '进行中'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function plainText(content: string): string {
  const t = extractStickers(extractInvite(extractSong(stripFileMarkers(takeBells(extractChoices(stripVoiceMarker(content || '')).cleanText).text)).cleanText).cleanText).cleanText
  return t.replace(/```[a-z:]*[^\n]*\n?/gi, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '').replace(/^>\s?/gm, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim()
}

/* 剪贴板 API 不给用（非 https / 老 WebView）时退回 execCommand */
function copyFallback(t: string): boolean {
  try {
    const ta = document.createElement('textarea')
    ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta); ta.select()
    const ok = document.execCommand('copy'); ta.remove(); return ok
  } catch { return false }
}

const PIN='perigee.pins'
const readPins=():string[]=>{try{return JSON.parse(localStorage.getItem(PIN)||'[]')}catch{return[]}}

// 听歌卡片：[song:歌名|歌手|id] 渲染成一张卡，点了在新标签打开音乐站的歌曲页（开源版不带内置播放器）
// ncm:<id> 跳网易云歌曲页；其余 id 当 QQ 音乐 mid；没有 id 就按"歌名 歌手"搜索。
function SongBubble({ song }: { song: SongCard }) {
  const [opened, setOpened] = useState(false)
  const go = () => {
    setOpened(true)
    void startListening(song)
    window.open(song.ncm ? `https://music.163.com/#/song?id=${encodeURIComponent(song.ncm)}` : songUrl(song), '_blank', 'noopener')
  }
  return (
    <motion.button onClick={go}
      initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      whileTap={{ scale: 0.97 }}
      transition={{ type: 'spring', stiffness: 400, damping: 26 }}
      className="mt-1 mb-0.5 flex w-full max-w-[280px] items-center gap-3 rounded-[var(--radius-md)]
                 border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2.5 text-left
                 text-[color:var(--color-ink)] transition active:scale-[.99]">
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-[var(--radius-xs)]
                       bg-[var(--color-ink)] text-[17px] text-[color:var(--color-surface)]">♪</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium leading-tight">{song.name}</span>
        {song.artist && (
          <span className="mt-0.5 block truncate text-[11px] text-[color:var(--color-ink-3)]">{song.artist}</span>
        )}
      </span>
      <span className="shrink-0 rounded-full bg-[var(--color-ink)] px-2.5 py-1 text-[10.5px] text-[color:var(--color-surface)]">
        {opened ? '听着呢' : '去听'}
      </span>
    </motion.button>
  )
}

// 回过的记在本机（按消息 id）；换了设备也能从后面那条消息认出来。
const INV = 'perigee.invites'
const readInv = (): Record<string, 'yes' | 'no'> => { try { return JSON.parse(localStorage.getItem(INV) || '{}') } catch { return {} } }
const Twinkle = ({ s = 10, className = '' }: { s?: number; className?: string }) => (
  <svg viewBox="0 0 20 20" width={s} height={s} className={className} aria-hidden>
    <path d="M10 0 C10.8 6.5 13.5 9.2 20 10 C13.5 10.8 10.8 13.5 10 20 C9.2 13.5 6.5 10.8 0 10 C6.5 9.2 9.2 6.5 10 0Z" fill="currentColor" />
  </svg>
)
function InviteBubble({ id, inv, mine, later, onAnswer }: {
  id: string; inv: InviteCard; mine: boolean; later: string[]; onAnswer: (yes: boolean) => void
}) {
  const derived = later.some((t) => t.startsWith('【接受邀请】' + inv.title)) ? 'yes'
    : later.some((t) => t.startsWith('【婉拒邀请】' + inv.title)) ? 'no' : undefined
  const [picked, setPicked] = useState<'yes' | 'no' | undefined>(() => readInv()[id])
  const ans = picked ?? derived
  const answer = (yes: boolean) => {
    if (ans) return
    const v = yes ? 'yes' : 'no'
    setPicked(v)
    try { localStorage.setItem(INV, JSON.stringify({ ...readInv(), [id]: v })) } catch { /* 存不下也照样回话 */ }
    onAnswer(yes)
  }
  const sub = [inv.when, inv.note].filter(Boolean)
  return (
    <motion.div initial={{ opacity: 0, y: 8, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 320, damping: 24 }}
      className="relative mt-1.5 mb-0.5 w-[256px] max-w-full overflow-hidden rounded-[22px] px-4 pb-3.5 pt-4 text-[color:var(--color-ink)]"
      style={{ background: 'linear-gradient(160deg, rgba(255,255,255,.86), rgba(255,255,255,.62))',
        backdropFilter: 'blur(16px) saturate(1.3)', WebkitBackdropFilter: 'blur(16px) saturate(1.3)',
        border: '1px solid rgba(255,255,255,.95)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,.9), 0 10px 28px rgba(0,0,0,.10)' }}>
      {/* 右上角一小簇星星 + 一道细弧 */}
      <svg viewBox="0 0 60 50" className="pointer-events-none absolute right-2 top-1.5 h-[46px] w-[56px] text-[color:var(--color-ink)]" aria-hidden>
        <path d="M8 44 A34 34 0 0 1 52 6" fill="none" stroke="currentColor" strokeOpacity=".18" strokeWidth=".8" />
        <path d="M38 8 C38.5 13 40.5 15 45 15.5 C40.5 16 38.5 18 38 23 C37.5 18 35.5 16 31 15.5 C35.5 15 37.5 13 38 8Z" fill="currentColor" opacity=".55" />
        <circle cx="50" cy="30" r="1.1" fill="currentColor" opacity=".35" /><circle cx="26" cy="6" r=".9" fill="currentColor" opacity=".3" />
      </svg>
      <div className="flex items-center justify-center gap-1.5 px-5">
        <Twinkle s={9} className="shrink-0 opacity-40" />
        <span className="text-center text-[15px] font-semibold leading-snug tracking-[.5px]"
          style={{ fontFamily: "'New York', ui-serif, Georgia, 'Songti SC', serif" }}>{inv.title}</span>
        <Twinkle s={9} className="shrink-0 opacity-40" />
      </div>
      {sub.length > 0 && <div className="mt-1 text-center text-[11.5px] leading-relaxed text-[color:var(--color-ink-2)]">{sub.join(' · ')}</div>}
      {ans ? (
        <div className="mt-3 flex justify-center">
          <span className="-rotate-6 rounded-[8px] border-[1.5px] px-3 py-0.5 text-[13px] font-semibold tracking-[2px]"
            style={{ borderColor: ans === 'yes' ? '#1c1c1e' : '#a1a1a6', color: ans === 'yes' ? '#1c1c1e' : '#8e8e93' }}>
            {ans === 'yes' ? '已赴约' : '改天再约'}
          </span>
        </div>
      ) : mine ? (
        <div className="mt-3 text-center text-[11.5px] text-[color:var(--color-ink-3)]">等 {aiName()} 回应…</div>
      ) : (
        <div className="mt-3 flex gap-2">
          <button onClick={() => answer(false)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-black/15 bg-white/50 py-1.5 text-[13.5px] text-[color:var(--color-ink-2)] active:bg-black/5">
            <span className="text-[8px] opacity-50">✦—</span>拒绝<span className="text-[8px] opacity-50">—✦</span>
          </button>
          <button onClick={() => answer(true)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-[#1c1c1e] py-1.5 text-[13.5px] text-white shadow-[0_4px_12px_rgba(0,0,0,.22)] active:opacity-85">
            <span className="text-[8px] opacity-60">✦—</span>接受<Twinkle s={11} className="opacity-90" />
          </button>
        </div>
      )}
    </motion.div>
  )
}

const INVITE_PRESETS = ['一起睡觉', '一起看月亮', '一起听歌', '一起散步', '一起吃饭', '一起打游戏']
function InviteComposer({ onSend, onClose }: { onSend: (marker: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [when, setWhen] = useState('')
  const [note, setNote] = useState('')
  const clean = (v: string) => v.replace(/[|\[\]]/g, ' ').trim()
  const go = () => {
    if (!clean(title)) return
    onSend(`[invite: ${clean(title)}${clean(when) || clean(note) ? ` | ${clean(when)}` : ''}${clean(note) ? ` | ${clean(note)}` : ''}]`)
  }
  const field = 'w-full rounded-[12px] border border-[var(--color-line)] bg-white/70 px-3 py-2 text-[14px] outline-none focus:border-[var(--color-ink)]'
  return (
    <div className="px-4 pb-3 pt-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-[14px] font-semibold">发一张邀请卡</span>
        <button onClick={onClose} className="text-[13px] text-[color:var(--color-ink-3)]">返回</button>
      </div>
      <div className="mb-2.5 flex flex-wrap gap-1.5">
        {INVITE_PRESETS.map((t) => (
          <button key={t} onClick={() => setTitle(t)}
            className={`rounded-full px-3 py-1 text-[12.5px] ${title === t ? 'bg-[#1c1c1e] text-white' : 'border border-[var(--color-line)] bg-white/60'}`}>{t}</button>
        ))}
      </div>
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`邀请 ${aiName()} 做什么`} className={field} />
      <input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="时间（可不写）" className={`${field} mt-2`} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="想说的一句话（可不写）" className={`${field} mt-2`} />
      <button onClick={go} disabled={!clean(title)}
        className="mt-3 w-full rounded-full bg-[#1c1c1e] py-2.5 text-[14px] text-white disabled:opacity-30">发出邀请</button>
    </div>
  )
}

/** + 展开的功能格子（像微信那样，在输入框下面） */
const PlusIcon = {
  photo: 'M4 6.5A2.5 2.5 0 016.5 4h11A2.5 2.5 0 0120 6.5v11a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 17.5zM8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM20 15l-4.5-4.5L6 20',
  camera: 'M4 8.5A2.5 2.5 0 016.5 6h1.8l1.2-2h5l1.2 2h1.8A2.5 2.5 0 0120 8.5v8a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 16.5zM12 16a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  file: 'M14 3H7.5A2.5 2.5 0 005 5.5v13A2.5 2.5 0 007.5 21h9a2.5 2.5 0 002.5-2.5V8zM14 3v5h5M9 13h6M9 17h4',
  sticker: 'M20 12.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h6.5M20 12.5L12.5 20M20 12.5h-5.5a2 2 0 00-2 2V20M9 9.5h.01M14 9.5h.01M8.5 13.5a4 4 0 003.5 1.5',
  invite: 'M3.5 7.5A2.5 2.5 0 016 5h12a2.5 2.5 0 012.5 2.5v9A2.5 2.5 0 0118 19H6a2.5 2.5 0 01-2.5-2.5zM4 7l8 6 8-6',
}
function PlusPanel({ items }: { items: { key: keyof typeof PlusIcon; label: string; on: () => void }[] }) {
  return (
    <div className="grid grid-cols-4 gap-y-4 px-5 pb-4 pt-4">
      {items.map((it) => (
        <button key={it.key} onClick={it.on} className="flex flex-col items-center gap-1.5">
          <span className="grid h-[54px] w-[54px] place-items-center rounded-[16px] border border-white/90 bg-white/75 shadow-[0_2px_8px_rgba(0,0,0,.06)]">
            <svg viewBox="0 0 24 24" className="h-[24px] w-[24px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={PlusIcon[it.key]} />
            </svg>
          </span>
          <span className="text-[11.5px] text-[color:var(--color-ink-2)]">{it.label}</span>
        </button>
      ))}
    </div>
  )
}

type Artifact = { kind: 'html' | 'markdown'; name: string; content: string }
function extractArtifacts(input: string, withFiles = false): { text: string; artifacts: Artifact[]; files: string[] } {
  const artifacts: Artifact[] = []
  const files: string[] = []
  const re = /```(?:artifact:)?(html|md|markdown)(?:[ \t]+(?:filename=)?["']?([^\n"']+)["']?)?\n([\s\S]*?)```/gi
  const text = String(input || '').replace(re, (whole, rawKind, rawName, content) => {
    const kind: Artifact['kind'] = String(rawKind).toLowerCase() === 'html' ? 'html' : 'markdown'
    if (kind === 'html' && !/<!doctype|<html|<body|<main|<section/i.test(content)) return whole
    const fallback = kind === 'html' ? 'artifact.html' : 'artifact.md'
    const clean = String(rawName || fallback).trim().replace(/^filename=/i, '').replace(/["']/g, '') || fallback
    artifacts.push({ kind, name: clean.includes('.') ? clean : `${clean}.${kind === 'html' ? 'html' : 'md'}`, content: String(content).trim() })
    return ''
  }).trim()
  if (!withFiles) return { text, artifacts, files }
  // [[file:名字]] 只认代码之外的：写在反引号/代码块里的是举例，原样留着
  const withoutFiles = text.split(/(```[\s\S]*?```|`[^`\n]*`)/).map((part, i) => i % 2 ? part : part
    .replace(FILE_MARK, (_whole, rawName) => {
      const name = String(rawName).trim().split(/[\\/]/).pop() || ''
      if (name && !files.includes(name)) files.push(name)
      return ''
    })
    .replace(/\[\[file:[^\]\n]*\]?$/, '')).join('') // 流式时半截的标记先藏起来
    .replace(/[ \t]+\n/g, '\n').trim()
  return { text: withoutFiles, artifacts, files }
}

const IMG_FILE = /\.(png|jpe?g|gif|webp)$/i
const OPENABLE_FILE = /\.(pdf|mp3|m4a|wav|mp4|txt|md|csv|json)$/i
function fmtSize(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}
function FileCard({ name }: { name: string }) {
  const [size, setSize] = useState<number | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const [tries, setTries] = useState(0)
  const url = outboxUrl(name)
  useEffect(() => {
    let alive = true
    let timer = 0
    fetch(url, { method: 'HEAD', cache: 'no-store' })
      .then((r) => {
        if (!alive) return
        if (r.ok) return setSize(Number(r.headers.get('content-length')) || 0)
        // 文件可能还在路上（标记先到、文件后写），隔一会儿再看，最多三次
        if (tries < 3) { timer = window.setTimeout(() => alive && setTries((t) => t + 1), 2000); return }
        setSize(null)
      })
      .catch(() => { if (alive) setSize(null) })
    return () => { alive = false; window.clearTimeout(timer) }
  }, [url, tries])
  const ext = (name.match(/\.([a-z0-9]+)$/i)?.[1] || 'FILE').toUpperCase().slice(0, 4)
  const isImg = IMG_FILE.test(name) && size !== null
  return <>
    <div className="mt-1 w-full min-w-[250px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)]">
      {isImg && <button onClick={() => setOpen(true)} className="block w-full border-b border-[var(--color-line)] bg-[var(--color-bg)]"><img src={url} alt={name} className="mx-auto block max-h-64 w-auto max-w-full object-contain" /></button>}
      <div className="flex items-center gap-3 p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-xs)] bg-[var(--color-ink)] font-mono text-[10px] text-[color:var(--color-surface)]">{ext}</span><span className="min-w-0 flex-1"><b className="block truncate text-[13px]">{name}</b><span className="text-[10px] text-[color:var(--color-ink-3)]">{size === undefined ? '文件 · 正在看' : size === null ? '发件箱里找不到它了' : `文件 · ${fmtSize(size)}`}</span></span></div>
      {typeof size === 'number' && <div className={`grid ${isImg || OPENABLE_FILE.test(name) ? 'grid-cols-2' : 'grid-cols-1'} border-t border-[var(--color-line)]`}>{isImg ? <button onClick={() => setOpen(true)} className="border-r border-[var(--color-line)] py-2 text-[11px]">查看</button> : OPENABLE_FILE.test(name) ? <a href={url} target="_blank" rel="noreferrer" className="border-r border-[var(--color-line)] py-2 text-center text-[11px]">打开</a> : null}<a href={outboxUrl(name, true)} className="py-2 text-center text-[11px]">下载</a></div>}
    </div>
    {open && createPortal(<div className="fixed inset-0 z-[150] flex flex-col bg-[var(--color-bg)]" onClick={() => setOpen(false)}><header className="flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))]" onClick={e => e.stopPropagation()}><button onClick={() => setOpen(false)} className="text-2xl">‹</button><b className="min-w-0 flex-1 truncate">{name}</b><a href={outboxUrl(name, true)} className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[11px]">下载</a></header><div className="grid min-h-0 flex-1 place-items-center overflow-auto p-3"><img src={url} alt={name} className="max-h-full max-w-full object-contain" /></div></div>, document.body)}
  </>
}

function ArtifactCard({ artifact }: { artifact: Artifact }) {
  const [open, setOpen] = useState(false)
  const url = useMemo(() => URL.createObjectURL(new Blob([artifact.content], { type: artifact.kind === 'html' ? 'text/html;charset=utf-8' : 'text/markdown;charset=utf-8' })), [artifact])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return <>
    <div className="mt-1 w-full min-w-[250px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)]">
      <div className="flex items-center gap-3 p-3"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-[var(--radius-xs)] bg-[var(--color-ink)] font-mono text-[10px] text-[color:var(--color-surface)]">{artifact.kind === 'html' ? 'HTML' : 'MD'}</span><span className="min-w-0 flex-1"><b className="block truncate text-[13px]">{artifact.name}</b><span className="text-[10px] text-[color:var(--color-ink-3)]">Artifact · 可预览与下载</span></span></div>
      <div className="grid grid-cols-2 border-t border-[var(--color-line)]"><button onClick={()=>setOpen(true)} className="border-r border-[var(--color-line)] py-2 text-[11px]">预览</button><a href={url} download={artifact.name} className="py-2 text-center text-[11px]">下载</a></div>
    </div>
    {open&&createPortal(<div className="fixed inset-0 z-[150] flex flex-col bg-[var(--color-bg)]" onClick={()=>setOpen(false)}><header className="flex items-center gap-3 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))]" onClick={e=>e.stopPropagation()}><button onClick={()=>setOpen(false)} className="text-2xl">‹</button><b className="min-w-0 flex-1 truncate">{artifact.name}</b><a href={url} download={artifact.name} className="rounded-full border border-[var(--color-line)] px-3 py-1.5 text-[11px]">下载</a></header><div className="min-h-0 flex-1 overflow-auto bg-white" onClick={e=>e.stopPropagation()}>{artifact.kind==='html'?<iframe title={artifact.name} src={url} sandbox="allow-scripts allow-forms" className="h-full w-full border-0"/>:<article className="mx-auto max-w-3xl p-5 text-black"><ReactMarkdown remarkPlugins={[remarkGfm]}>{artifact.content}</ReactMarkdown></article>}</div></div>, document.body)}
  </>
}

function ChoiceCard({ choice, live, onPick }: { choice: Choice; live: boolean; onPick: (text: string) => void }) {
  return (
    <div className={`mt-1 w-[min(280px,100%)] rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-card)] p-2.5 ${live ? '' : 'opacity-55'}`}>
      <p className="mb-2 text-[13px] font-medium">{choice.question}</p>
      {choice.options.map((o) => (
        <button key={o.letter} type="button" disabled={!live} onClick={() => onPick(o.text)}
          className="mb-1.5 flex w-full items-baseline gap-2 rounded-[var(--radius-sm,8px)] border border-[var(--color-line)]
                     bg-[var(--color-surface)] px-2.5 py-2 text-left text-[13px] last:mb-0 enabled:active:bg-[var(--color-line)] disabled:cursor-default">
          <b className="shrink-0">{o.letter}</b><span className="min-w-0 flex-1">{o.text}</span>
        </button>
      ))}
      {!live && <p className="mt-1.5 text-[10px] text-[color:var(--color-ink-4)]">已过期</p>}
    </div>
  )
}

const splitSegs = (content: string): string[] => {
  if (!content) return [content]
  const parts: string[] = []
  const fences = content.split(/(```[\s\S]*?(?:```|$))/)
  let buf: string[] = []
  for (const chunk of fences) {
    if (chunk.startsWith('```')) {
      parts.push([...buf, chunk].join('').trim() ? (buf.join('') + chunk) : chunk)
      buf = []
      continue
    }
    const segs = chunk.split(/\n{2,}/)
    for (let k = 0; k < segs.length; k++) {
      if (k === 0 && parts.length && buf.length === 0 && segs[k] && !chunk.startsWith('\n\n')) {
        // 紧跟代码块后的同段内容并回上一条
        parts[parts.length - 1] += segs[k]
      } else if (k < segs.length - 1) {
        parts.push([...buf, segs[k]].join(''))
        buf = []
      } else {
        buf.push(segs[k])
      }
    }
  }
  if (buf.join('').trim()) parts.push(buf.join(''))
  const out = parts.map((p) => p.trim()).filter(Boolean)
  return out.length ? out : [content]
}

const hhmm = (ts?: string) => {
  if (!ts) return ''
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? '' : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function audioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio()
    let done = false
    const finish = (seconds = 0) => {
      if (done) return
      done = true
      URL.revokeObjectURL(url)
      resolve(Math.max(1, Math.round(Number.isFinite(seconds) ? seconds : 0)))
    }
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => finish(audio.duration)
    audio.onerror = () => finish()
    audio.src = url
    window.setTimeout(() => finish(), 5000)
  })
}

import { ForwardSheet, RecordCard, SelectionBar } from '../forward/Forwarding'
import { forwardReplies, parseRecord, type Selection } from '../forward/records'
import { bubbleBg, bubbleInk, chatRoomStyle, useChatLook } from './ChatAppearance'
import './chat-telegram.css'
import { useSkin } from '../skin/useSkin'

export default function Chat({ preset = '', onPreset }: { preset?: string; onPreset?: () => void }) {
  const telegramPilot = true
  const loop = useSkin() === 'loop'   // 灰阶浮雕：输入区换成一排小圆钮 + 胶囊输入框
  const roomId = getRoom()
  useAvatars()
  // 房间标题：AI 头像没上传时用标题首字占位
  const [roomTitle, setRoomTitle] = useState('')
  useEffect(() => { void fetchRooms().then((d) => setRoomTitle(d.rooms.find((r) => r.id === roomId)?.title || '')) }, [roomId])
  const [msgs, setMsgs] = useState<Msg[]>([])
  // 权限审批（房间的权限模式不是"全放行"时，Claude 要用工具会先来问）：网关事件流里来的待审批请求
  type PermReq = { request_id: string; tool_name?: string; title?: string; display_name?: string; description?: string; input?: Record<string, unknown> }
  const [perms, setPerms] = useState<PermReq[]>([])
  // 草稿按房间存着：应用被系统杀掉、切走再回来，打了一半的话还在
  const DRAFT_KEY = `perigee:draft:${roomId}`
  const [text, setText] = useState(() => { try { return localStorage.getItem(DRAFT_KEY) || '' } catch { return '' } })
  useEffect(() => { try { if (text) localStorage.setItem(DRAFT_KEY, text); else localStorage.removeItem(DRAFT_KEY) } catch { /* 存不下就算了 */ } }, [text, DRAFT_KEY])
  const [busy, setBusy] = useState(false)
  const [bellOpen, setBellOpen] = useState(false)
  const [bellText, setBellText] = useState('')
  useEffect(() => {
    const t = () => setBellOpen((v) => !v)
    window.addEventListener(OPEN_BELL_EVENT, t)
    return () => window.removeEventListener(OPEN_BELL_EVENT, t)
  }, [])
  const [slash, setSlash] = useState(false)
  const [search, setSearch] = useState(false)
  const [pins, setPins] = useState<string[]>(readPins)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<string[]>([])
  const [forwarding, setForwarding] = useState<Selection[] | null>(null)
  const [forwardWaiting, setForwardWaiting] = useState(forwardReplies.has(getRoom()))
  const [thinkingSheet, setThinkingSheet] = useState<string | null>(null)
  const { look } = useChatLook(roomId)
  const toggleSelected = (m: Msg) => {
    if (m.pending) return
    setSelected(ids => ids.includes(m.id) ? ids.filter(id => id !== m.id) : ids.length < 20 ? [...ids, m.id] : ids)
  }

  const togglePin = (id: string) => {
    const next = pins.includes(id) ? pins.filter((x) => x !== id) : [...pins, id]
    setPins(next); localStorage.setItem(PIN, JSON.stringify(next))
  }

  const [showAvatars, setShowAvatars] = useState(avatarsOn())
  const [voiceHide, setVoiceHide] = useState(voiceTextHidden())
  const [voiceOpen, setVoiceOpen] = useState<Record<string, boolean>>({})
  useEffect(() => {
    const sync = () => { setShowAvatars(avatarsOn()); setVoiceHide(voiceTextHidden()) }
    window.addEventListener(PREFS_CHANGED, sync)
    window.addEventListener('storage', sync)
    return () => { window.removeEventListener(PREFS_CHANGED, sync); window.removeEventListener('storage', sync) }
  }, [])
  const [menu, setMenu] = useState<{ id: string; text: string; role: string; ts?: string; x: number; y: number } | null>(null)
  const [toast, setToast] = useState('')
  const press = useRef<number | null>(null)
  const openMenu = (m: Msg, x: number, y: number) => {
    window.getSelection?.()?.removeAllRanges()
    setMenu({ id: m.id, text: m.content || '', role: m.role, ts: m.ts, x, y })
  }
  const input = useRef<HTMLTextAreaElement>(null)
  const quoteIt = (m: { text: string; role: string }) => {
    setMenu(null)
    const p = plainText(m.text).replace(/\s+/g, ' ').trim()
    if (!p) { say('这条没有字'); return }
    const who = m.role === 'user' ? '我' : peer
    const q = `> ${who}：${p.length > 60 ? p.slice(0, 60) + '…' : p}\n\n`
    setText((v) => q + v.replace(/^> [^\n]*\n\n/, ''))
    requestAnimationFrame(() => { const el = input.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length) } })
  }
  const cancelPress = () => { if (press.current) { clearTimeout(press.current); press.current = null } }
  const say = (t: string) => { setToast(t); window.setTimeout(() => setToast(''), 1600) }
  async function keepIt(m: { id: string; text: string; role: string; ts?: string }) {
    setMenu(null)
    if (!m.text.trim()) { say('这条没有字'); return }
    try {
      await colAdd('favorites', {
        text: m.text, by: m.role === 'user' ? 'user' : 'ai',
        msg_id: m.id, msg_ts: m.ts ?? '', room: getRoom(),
      })
      say('收进收藏夹了')
    } catch { say('没存上，等会儿再试') }
  }
  const jump = (id: string) => requestAnimationFrame(() => {
    document.getElementById('m-' + id)?.scrollIntoView({ block: 'center' })
  })
  const scroller = useRef<HTMLDivElement>(null)
  const abort = useRef<AbortController | null>(null)
  const flushRef = useRef<() => void>(() => {})
  const rec = useRef<MediaRecorder | null>(null)
  const [recording, setRecording] = useState(false)
  const [pics, setPics] = useState<Pic[]>([])
  const [pendingAudio, setPendingAudio] = useState<{ name: string; secs: number } | null>(null)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [doc, setDoc] = useState<{ name: string; dataUrl: string } | null>(null)
  const [stickers, setStickers] = useState<Sticker[]>([])
  const [stickerOpen, setStickerOpen] = useState(false)
  const [plusOpen, setPlusOpen] = useState(false)
  const [plusPage, setPlusPage] = useState<'grid' | 'invite'>('grid')
  const pic = useRef<HTMLInputElement>(null)
  const cam = useRef<HTMLInputElement>(null)
  const stickerLib = useMemo(() => new Map(stickers.map((s) => [s.name, s.url])), [stickers])
  const reloadStickers = () => void stickerList().then(setStickers)
  useEffect(() => {
    reloadStickers()
    window.addEventListener(STICKERS_UPDATED, reloadStickers)
    return () => window.removeEventListener(STICKERS_UPDATED, reloadStickers)
  }, [])
  const hasMore = useRef(false)
  const loadingOlder = useRef(false)
  const file = useRef<HTMLInputElement>(null)

  const recStart = useRef(0)
  const recCancel = useRef(false)
  const recStartY = useRef(0)
  const [recCancelHint, setRecCancelHint] = useState(false)
  async function startRec(y: number) {
    if (recording || rec.current) return
    recCancel.current = false; recStartY.current = y; setRecCancelHint(false)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream); const chunks: Blob[] = []
      mr.ondataavailable = (e) => chunks.push(e.data)
      recStart.current = Date.now()
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop()); setRecording(false); rec.current = null; setRecCancelHint(false)
        const ms = Date.now() - recStart.current
        if (recCancel.current) { say('已取消'); return }
        if (ms < 800) { say('说话时间太短'); return }
        const blob = new Blob(chunks)
        const secs = Math.max(1, Math.round(ms / 1000))
        say('发送中…')
        const [name, t] = await Promise.all([uploadAudio(blob, blob.type), transcribe(blob).catch(() => '')])
        if (!t) { say('没听清，再说一遍？'); return }
        if (busyRef.current) { setText((v) => v + t); if (name) setPendingAudio({ name, secs }); say('我还在说，先放进输入框了'); return }
        void sendRef.current(undefined, undefined, { name: name || '', secs, text: t })
      }
      rec.current = mr; mr.start(); setRecording(true)
    } catch { setRecording(false); rec.current = null; say('麦克风没给权限') }
  }
  function stopRec(cancel = false) {
    if (cancel) recCancel.current = true
    if (rec.current && rec.current.state !== 'inactive') rec.current.stop()
  }
  const holdProps = {
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (busy || text.trim() || pics.length || doc) return
      e.preventDefault(); try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* 拿不到也照样录 */ }
      void startRec(e.clientY)
    },
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!recording) return
      const up = recStartY.current - e.clientY > 70
      recCancel.current = up; setRecCancelHint(up)
    },
    onPointerUp: () => { if (rec.current) stopRec(recCancel.current) },
    onPointerCancel: () => { if (rec.current) stopRec(true) },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    style: { touchAction: 'none', WebkitUserSelect: 'none', userSelect: 'none', WebkitTouchCallout: 'none' } as React.CSSProperties,
  }

  // 只有已经贴着底部时才自动跟随，往上翻历史不会被拽回去
  const atBottom = () => {
    const el = scroller.current
    return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  const follow = () => requestAnimationFrame(() => {
    const el = scroller.current; if (el) el.scrollTop = el.scrollHeight
  })
  const [showDown, setShowDown] = useState(false)
  const [unread, setUnread] = useState(false)
  const farRef = useRef(false)
  const onScroll = () => {
    const el = scroller.current; if (!el) return
    if (el.scrollTop < 36) void loadOlder()
    const gap = el.scrollHeight - el.scrollTop - el.clientHeight
    const far = gap > el.clientHeight
    farRef.current = gap > 80
    setShowDown(far)
    if (gap < 80) setUnread(false)
  }
  const toBottom = () => {
    const el = scroller.current; if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    setUnread(false)
  }

  useEffect(() => {
    void fetchHistoryPage().then(({ msgs: h, hasMore: hm }) => { setMsgs(h); hasMore.current = hm; follow() })
  }, [])
  useEffect(() => {
    const update = (e: Event) => {
      if ((e as CustomEvent).detail?.room !== getRoom()) return
      setForwardWaiting(forwardReplies.has(getRoom()))
      if (!busy && !forwardReplies.has(getRoom())) void fetchHistoryPage().then(({ msgs: h }) => {
        setMsgs(p => [...p.filter(m => m.ts && h[0]?.ts && m.ts < h[0].ts), ...h])
      })
    }
    window.addEventListener('perigee:forward-update', update)
    return () => window.removeEventListener('perigee:forward-update', update)
  }, [busy])

  /** 锁屏/切走回来：网关那头可能早说完了，回到前台就去拿（学 Aru：服务器是真相，前端只取） */
  function syncFromServer() {
    if (forwardReplies.has(getRoom())) return
    void fetchHistoryPage().then(({ msgs: h }) => {
      if (!h.length) return
      // 本地比服务器第一条还早的才留；同一句（角色+内容一样）服务器已经有了就不留——
      // 浏览器和服务器的时钟有毫秒级差，刚发的那句会被当成"更早的"而重复显示
      const key = (m: Msg) => `${m.role}\u0000${typeof m.content === 'string' ? m.content.trim() : ''}`
      const have = new Set(h.map(key))
      setMsgs(p => [...p.filter(m => m.ts && h[0]?.ts && Date.parse(m.ts) < Date.parse(h[0].ts!) && !have.has(key(m))), ...h])
    })
  }
  const busyRef = useRef(busy)
  busyRef.current = busy
  // 我这一轮说完那一下也去服务器拿一次：我说话中间落的小条在忙的时候被跳过了
  const wasBusy = useRef(busy)
  useEffect(() => {
    if (wasBusy.current && !busy) { const t = setTimeout(syncFromServer, 800); wasBusy.current = busy; return () => clearTimeout(t) }
    wasBusy.current = busy
  }, [busy])
  useEffect(() => {
    let es: EventSource | null = null
    const open = () => {
      if (es || document.hidden) return
      es = new EventSource(`${API_BASE}/session/events?room=${encodeURIComponent(roomId)}`)
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data)
          if (d?.type === 'connected') setPerms(Array.isArray(d.pending) ? d.pending : [])
          else if (d?.type === 'permission_request' && d.request) setPerms((p) => [...p.filter((x) => x.request_id !== d.request.request_id), d.request])
          else if ((d?.type === 'permission_resolved' || d?.type === 'permission_cancelled') && d.request_id) setPerms((p) => p.filter((x) => x.request_id !== d.request_id))
          if ((d?.type === 'wake_strip' || d?.type === 'turn_done') && !busyRef.current) syncFromServer()
          else if (d?.type === 'turn_done' && busyRef.current) window.setTimeout(() => reviveRef.current(), 3000)   // 网关说完了、我这条流却早没动静：判死放 busy
        } catch { /* 坏包不管 */ }
      }
    }
    const vis = () => { if (document.hidden) { es?.close(); es = null } else open() }
    open()
    document.addEventListener('visibilitychange', vis)
    return () => { es?.close(); document.removeEventListener('visibilitychange', vis) }
  }, [roomId])

  const lastAlive = useRef(0)
  const revived = useRef(false)
  function reviveIfStale() {
    if (!busyRef.current || Date.now() - lastAlive.current < 25_000) return
    if (abort.current) { revived.current = true; abort.current.abort() }
    else { setBusy(false); syncFromServer() }
  }
  const reviveRef = useRef(reviveIfStale)
  reviveRef.current = reviveIfStale
  useEffect(() => {
    let t = 0
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      if (!busy) { syncFromServer(); return }
      window.clearTimeout(t)
      t = window.setTimeout(() => reviveRef.current(), 3000)
    }
    document.addEventListener('visibilitychange', onVis)
    return () => { window.clearTimeout(t); document.removeEventListener('visibilitychange', onVis) }
  }, [busy])

  async function loadOlder() {
    const el = scroller.current
    if (!el || loadingOlder.current || !hasMore.current) return
    loadingOlder.current = true
    const oldHeight = el.scrollHeight, oldTop = el.scrollTop
    const before = msgs[0]?.ts ?? null
    const { msgs: older, hasMore: hm } = await fetchHistoryPage(getRoom(), before)
    hasMore.current = hm
    if (older.length) {
      setMsgs((p) => [...older, ...p])
      requestAnimationFrame(() => { el.scrollTop = el.scrollHeight - oldHeight + oldTop })
    }
    loadingOlder.current = false
  }
  useEffect(() => { if (preset) { setText(preset); onPreset?.() } }, [preset, onPreset])
  useEffect(() => {
    const s = () => setSearch(true)
    window.addEventListener('perigee:search', s)
    return () => window.removeEventListener('perigee:search', s)
  }, [])
  useEffect(() => { setSlash(text.startsWith('/') && !text.includes(' ')) }, [text])

  const picsDraft = pics, docDraft = doc, audioDraft = pendingAudio
  const sendRef = useRef(send); sendRef.current = send
  async function send(sticker?: string, fixed?: string, voice?: { name: string; secs: number; text: string }) {
    const body = voice ? voice.text : sticker ? stickerMarker(sticker) : fixed ?? text.trim()
    const pics = voice || sticker || fixed !== undefined ? [] : picsDraft
    const doc = voice || sticker || fixed !== undefined ? null : docDraft
    const pendingAudio = voice ? (voice.name ? { name: voice.name, secs: voice.secs } : null) : sticker || fixed !== undefined ? null : audioDraft
    if ((!body && !pics.length && !doc) || busy) return
    const mine: Msg = { id: newId(), role: 'user', content: body, ts: new Date().toISOString(), images: pics.map((p) => p.url),
      audio: pendingAudio?.name, seconds: pendingAudio?.secs }
    const reply: Msg = { id: newId(), role: 'assistant', content: '', ts: new Date().toISOString(), pending: true }
    setMsgs((p) => [...p, mine, reply]); if (!voice && !sticker && fixed === undefined) setText(''); setBusy(true); follow()
    lastAlive.current = Date.now(); revived.current = false
    await appendHistory('user', body || (doc ? `[文件：${doc.name}]` : '[图片]'), pics[0]?.url ?? null, null, roomId, pics.map(p => p.url), getChannel(), pendingAudio)
    if (pendingAudio) setPendingAudio(null)
    void pingTyping()
    if (pics.length) setPics([])
    if (doc) setDoc(null)
    if (sticker) setStickerOpen(false)

    abort.current = new AbortController()
    try {
      const history: OutMsg[] = [...msgs, mine].filter((m) => !m.strip).map(({ role, content }) => ({ role, content }))
      if (pics.length || doc) {
        const blocks: Block[] = pics.map((p) => ({ type: 'image_url' as const, image_url: { url: p.dataUrl } }))
        if (doc) blocks.push({ type: 'document_url', document_url: { url: doc.dataUrl, name: doc.name } })
        if (body) blocks.push({ type: 'text', text: body })
        history[history.length - 1] = { role: 'user', content: blocks }   // 图要以内容块进来，我才看得见
      }
      if (/artifact|网页|页面|html|markdown|\.md\b/i.test(body)) {
        const guide = '\n\n[前端 Artifact 格式：若产出完整 HTML 或 Markdown 文件，请把文件放进 ```artifact:html filename=文件名.html 或 ```artifact:markdown filename=文件名.md 代码围栏中。围栏外只写简短说明。]'
        const last = history[history.length - 1]
        if (typeof last.content === 'string') last.content += guide
        else last.content.push({ type: 'text', text: guide })
      }
      const patch = (fn: (m: Msg) => Msg) => {
        const stick = atBottom()
        setMsgs((p) => p.map((m) => m.id === reply.id ? fn(m) : m))
        if (stick) follow()
      }
      // 流式字按帧攒一攒再画：每来一小段就重画整个聊天列表，长回复会卡（学 Polaris）
      const pend = { text: '', think: '', raf: 0 }
      flushRef.current = () => {
        if (pend.raf) { cancelAnimationFrame(pend.raf); pend.raf = 0 }
        const t = pend.text, th = pend.think
        pend.text = ''; pend.think = ''
        if (t || th) patch((m) => ({ ...m, content: t ? stripVoiceMarker(m.content + t) : m.content, thinking: th ? (m.thinking ?? '') + th : m.thinking }))
      }
      const queueFlush = () => { if (!pend.raf) pend.raf = requestAnimationFrame(() => { pend.raf = 0; flushRef.current() }) }
      const full = await streamChat(history, {
        onAlive: () => { lastAlive.current = Date.now() },
        onText: (t) => { pend.text += t; queueFlush() },
        onThinking: (t) => { pend.think += t; queueFlush() },
        onTool: (name, done) => {
          patch((m) => {
            const list = [...(m.tools ?? [])]
            if (!done) return { ...m, tools: [...list, { name: name || 'tool' }] }
            for (let k = list.length - 1; k >= 0; k--) if (!list[k].done) { list[k] = { ...list[k], done: true, ok: list[k].ok ?? true }; break }
            return { ...m, tools: list }
          })
        },
      }, { signal: abort.current.signal, model: getModel() || undefined, channel: getChannel(), effort: getEffort(), roomId })
      flushRef.current()
      const wantsVoice = hasVoiceMarker(full)
      const cleanReply = stripVoiceMarker(full).trim()
      const parsed = extractChoices(cleanReply)
      setMsgs((p) => p.map((m) => m.id === reply.id ? { ...m, pending: false, content: cleanReply || m.content } : m))
      if (parsed.choice) setChoice(parsed.choice)
      if (wantsVoice && stripFileMarkers(takeBells(cleanReply).text).trim()) {
        const blob = await ttsBlob(stripFileMarkers(takeBells(cleanReply).text).trim())
        if (!blob) say('语音没合成上，文字还在')
        else {
          const seconds = await audioDuration(blob)
          const name = await uploadAudio(blob, blob.type || 'audio/mpeg')
          if (!name) say('语音没存上，文字还在')
          else {
            const attached = await attachAudio(name, seconds, roomId)
            if (!attached) say('语音没挂上，文字还在')
            else setMsgs((p) => p.map((m) => m.id === reply.id ? { ...m, audio: name, seconds } : m))
          }
        }
      }
    } catch {
      flushRef.current()
      const stopped = abort.current?.signal.aborted && !revived.current
      setMsgs((p) => p.map((m) => m.id === reply.id
        ? { ...m, pending: false, content: m.content || (stopped ? '（没接上，再说一次）' : '（线断了，他那边说完会自己补上来）') } : m))
      if (!stopped) {
        const since = mine.ts || ''
        let tries = 0
        const poll = () => {
          if (++tries > 90 || getRoom() !== roomId) return
          void fetchHistoryPage(roomId).then(({ msgs: h }) => {
            if (h.some(m => m.role === 'assistant' && Date.parse(m.ts ?? '') > Date.parse(since))) {
              // 本地比服务器第一条还早的才留；同一句（角色+内容一样）服务器已经有了就不留——
      // 浏览器和服务器的时钟有毫秒级差，刚发的那句会被当成"更早的"而重复显示
      const key = (m: Msg) => `${m.role}\u0000${typeof m.content === 'string' ? m.content.trim() : ''}`
      const have = new Set(h.map(key))
      setMsgs(p => [...p.filter(m => m.ts && h[0]?.ts && Date.parse(m.ts) < Date.parse(h[0].ts!) && !have.has(key(m))), ...h])
            } else window.setTimeout(poll, tries > 24 ? 15000 : 5000)
          }).catch(() => window.setTimeout(poll, tries > 24 ? 15000 : 5000))
        }
        window.setTimeout(poll, 3000)
      }
    } finally { setBusy(false); abort.current = null }
  }

  const peer = roomId === 'home' ? aiName() : '他'
  const view: ViewMsg[] = useMemo(() => msgs.flatMap((m0): ViewMsg[] => {
    let m: ViewMsg = m0
    if (m0.role === 'assistant' && typeof m0.content === 'string' && /\[choices:/i.test(m0.content)) {
      const c = takeChoices(m0.content, m0.pending)
      m = { ...m0, content: c.text, choice: c.choice ?? undefined }
    }
    if (m.role === 'user' && typeof m.content === 'string' && m.content.startsWith(BELL_USER))
      return [{ ...m, bell: { who: userName(), text: m.content.slice(BELL_USER.length).trim() } }]
    if (m.role === 'assistant' && typeof m.content === 'string' && m.content.includes('[[铃')) {
      const b = takeBells(m.content)
      const out: ViewMsg[] = []
      if (b.text || m.pending || m.audio || m.images?.length || m.tools?.length) out.push({ ...m, content: b.text })
      b.bells.forEach((t, k) => out.push({ ...m, id: `${m.id}-bell${k}`, bell: { who: peer, text: t } }))
      return out
    }
    return [m]
  }), [msgs, peer])
  const lastAsstId = useMemo(() => {
    const last = [...msgs].reverse().find((m) => !m.strip)
    return last?.role === 'assistant' ? last.id : ''
  }, [msgs])
  // 我摇的铃：新到的（不是翻历史翻出来的）才响。网关回来的记录会换 id，所以按内容认
  const rung = useRef<Set<string> | null>(null)
  useEffect(() => {
    const keys = msgs.filter((m) => m.role === 'assistant' && !m.pending && m.content.includes('[[铃铛'))
      .map((m) => m.content.slice(0, 120))
    if (!rung.current) { if (msgs.length) rung.current = new Set(keys); return }
    let fresh = false
    for (const k of keys) if (!rung.current.has(k)) { rung.current.add(k); fresh = true }
    if (fresh) ringBell()
  }, [msgs])
  const lastKey = useRef('')
  useEffect(() => {
    const last = [...msgs].reverse().find((m) => !m.strip && (m.content || m.audio || m.images?.length))
    const key = last ? `${last.role}:${last.content.slice(0, 40)}` : ''
    if (lastKey.current && key && key !== lastKey.current && farRef.current) setUnread(true)
    lastKey.current = key
  }, [msgs])
  const shake = () => {
    if (busy) return
    ringBell(); setBellOpen(false)
    void send(undefined, BELL_USER + bellText.trim()); setBellText('')
  }

  return (
    <div className={`absolute inset-0 flex flex-col ${telegramPilot ? 'tg-room' : ''} ${look.glass ? 'tg-glass' : ''}`}
      style={chatRoomStyle(look)}>
      <div className="relative flex min-h-0 flex-1 flex-col">
      {perms.length > 0 && (
        <div className="absolute inset-x-3 top-2 z-[60] flex flex-col gap-2">
          {perms.map((r) => (
            <div key={r.request_id} className="rounded-[var(--radius-md)] border border-[var(--color-line)] px-3.5 py-3 text-[#1c1c1e] shadow-[0_8px_28px_rgba(0,0,0,.18)]" style={{ background: '#fff' }}>
              <div className="text-[12.5px] font-medium">{aiName()} 想用工具：{r.display_name || r.title || r.tool_name || 'tool'}</div>
              {(r.description || r.input) && (
                <pre className="mt-1 max-h-[120px] overflow-auto whitespace-pre-wrap break-all text-[11px] text-[#555]">
                  {r.description || JSON.stringify(r.input, null, 1).slice(0, 800)}
                </pre>
              )}
              <div className="mt-2 flex justify-end gap-2">
                <button onClick={() => { void answerPermission(r.request_id, 'deny', roomId); setPerms((p) => p.filter((x) => x.request_id !== r.request_id)) }}
                  className="rounded-full border border-[var(--color-line)] px-3.5 py-1 text-[12px]">拒绝</button>
                <button onClick={() => { void answerPermission(r.request_id, 'allow', roomId); setPerms((p) => p.filter((x) => x.request_id !== r.request_id)) }}
                  className="rounded-full bg-[var(--color-ink)] px-3.5 py-1 text-[12px] text-[color:var(--color-surface)]">允许</button>
              </div>
            </div>
          ))}
        </div>
      )}
      <div ref={scroller} onScroll={onScroll}
        onContextMenu={(e) => e.preventDefault()}
        className={`chat-noselect min-h-0 flex-1 overflow-y-auto ${telegramPilot ? 'tg-scroll px-[10px] py-2' : 'px-2.5 py-3'}`}>
        {view.map((m, i) => {
          if (m.bell) return <BellLine key={m.id} who={m.bell.who} text={m.bell.text} />
          if (m.strip) return (
            <p key={m.id} className="wake-strip my-2 flex justify-center">
              <span className="max-w-[86%] truncate rounded-full bg-black/[0.04] px-2.5 py-0.5 text-[11px] text-[color:var(--color-ink-4)]">
                {m.content}<span className="ml-1.5 opacity-70">{hhmm(m.ts)}</span>
              </span>
            </p>
          )
          if (m.role === 'user' && typeof m.content === 'string' && m.content.trim() === '（拍了拍你）') return (
            <p key={m.id} className="my-2 text-center text-[11px] text-[color:var(--color-ink-4)]">你拍了拍他</p>
          )
          const record = parseRecord(m.content); const artifactView = extractArtifacts(record ? record.comment : m.content, m.role === 'assistant'); return (
          <motion.div key={m.id} id={'m-' + m.id}
            initial={{ opacity: 0, y: 8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            onClickCapture={(e) => { if (selecting) { e.preventDefault(); e.stopPropagation(); toggleSelected(m) } }}
            onContextMenu={(e) => { e.preventDefault(); if (!selecting) openMenu(m, e.clientX, e.clientY) }}
            onTouchStart={(e) => {
              if (selecting) return
              const t = e.touches[0]
              cancelPress()
              press.current = window.setTimeout(() => { navigator.vibrate?.(8); openMenu(m, t.clientX, t.clientY) }, 450)
            }}
            onTouchEnd={cancelPress} onTouchMove={cancelPress} onTouchCancel={cancelPress}
            className={`flex items-end gap-1.5 ${selecting ? 'forward-row' : ''} ${m.role === 'user' ? 'justify-end' : 'justify-start'}
              ${telegramPilot ? (view[i + 1]?.role === m.role && !view[i + 1]?.bell ? 'mb-[2px]' : 'mb-2') : 'mb-1'}`}>
            {selecting && <button className="forward-check" role="checkbox" aria-checked={selected.includes(m.id)} aria-label={`选择消息 ${i + 1}`} disabled={m.pending}>{selected.includes(m.id) ? '✓' : ''}</button>}
            {showAvatars && m.role === 'assistant' && (
              view[i - 1]?.role === 'assistant' && !view[i - 1]?.bell
                ? <span className="h-7 w-7 shrink-0" />
                : <img src={aiAvatarFor(roomId, roomTitle)} alt="" draggable={false} className="mb-0.5 h-7 w-7 shrink-0 rounded-full bg-black/[.06] object-cover" />
            )}
            <div className={`flex flex-col ${telegramPilot ? 'max-w-[88%]' : 'max-w-[82%]'} ${m.role === 'user' ? 'items-end' : 'items-start'}`}>
            {record && <RecordCard id={record.id} title={record.title} room={getRoom()} />}
            {m.thinking && m.role === 'assistant' && (
              <button onClick={() => setThinkingSheet(m.thinking!)}
                className="mb-1 flex items-center gap-1 rounded-full border border-[var(--color-line)]
                           bg-[var(--color-card)] px-2 py-0.5 text-[10px] text-[color:var(--color-ink-3)]">
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <path d="M12 3a7 7 0 0 1 7 7c0 2.4-1.2 4.2-3 5.5V18a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.5c-1.8-1.3-3-3.1-3-5.5a7 7 0 0 1 7-7z" />
                  <path d="M10 21h4" />
                </svg>
                思考过程
              </button>
            )}
            {(record && !artifactView.text ? [] : m.role === 'assistant' && !m.audio ? splitSegs(artifactView.text).filter((x) => extractInvite(extractSong(x).cleanText).cleanText.trim()) : [artifactView.text].filter((x) => !((extractInvite(x).invite || extractSong(x).song) && !extractInvite(extractSong(x).cleanText).cleanText.trim() && !m.images?.length && !m.audio))).map((seg, si, arr) => {
              const last = si === arr.length - 1
              const first = si === 0
              const sv = extractStickers(extractInvite(extractSong(seg).cleanText).cleanText)
              const textShown = !(m.audio && m.role === 'assistant') || (voiceOpen[m.id] ?? !voiceHide)
              // 只有表情包的一段：不套气泡，像别家聊天软件那样直接摆图
              if (sv.names.length && !sv.cleanText && !(first && (m.audio || m.images?.length || m.image || m.tools?.length))) return (
                <div key={si} className={`flex flex-col ${m.role === 'user' ? 'items-end' : 'items-start'} ${last ? '' : 'mb-1'}`}>
                  {sv.names.map((n, k) => <StickerImg key={k} name={n} lib={stickerLib} />)}
                  {last && <span className="mt-0.5 text-[10px] text-[color:var(--color-ink-3)]">{hhmm(m.ts)}</span>}
                  {last && m.role === 'assistant' && extractSong(m.content).song && (
                    <SongBubble song={extractSong(m.content).song!} />
                  )}
                </div>
              )
              return (
              <>
            <div key={si} className={`relative w-fit max-w-full break-words ${last ? '' : 'mb-1'} ${m.role === 'user' ? 'loop-me' : 'loop-you'}
              ${telegramPilot
                ? `tg-bubble ${last ? (m.role === 'user' ? 'tg-bubble-user' : 'tg-bubble-ai') : ''}`
                : `bub rounded-[var(--radius-md)] px-3 py-1.5 ${m.role === 'user'
                    ? 'bub-user bg-[var(--color-ink)] text-[color:var(--color-surface)]'
                    : 'bub-ai border border-[var(--color-line)] bg-[var(--color-surface)]'}`}`}
              style={telegramPilot ? { backgroundColor: bubbleBg(look, m.role === 'user'),
                                       color: bubbleInk(look, m.role === 'user') } : undefined}>
              {first && getRoom() === 'group' && m.role === 'assistant' && (
                <div className="mb-0.5 text-[10px] font-medium text-[color:var(--color-ink-3)]">{aiName()}</div>
              )}
              {first && m.tools?.length ? <ToolsRow tools={m.tools} pending={m.pending} /> : null}
              {first && m.audio && <VoiceBubble name={m.audio} seconds={m.seconds ?? 3} />}
              {first && m.audio && m.role === 'assistant' && sv.cleanText.trim() && (
                <button type="button" onClick={(e) => { e.stopPropagation(); setVoiceOpen((o) => ({ ...o, [m.id]: !textShown })) }}
                  className="mt-0.5 mb-0.5 block text-[11px] opacity-55 active:opacity-90">
                  {textShown ? '收起文字 ▴' : '展开文字 ▾'}
                </button>
              )}
              {first && <PhotoStack srcs={m.images?.length ? m.images : m.image ? [m.image] : []} />}
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p className="mb-2 whitespace-pre-wrap last:mb-0">{children}</p>,
                  ul: ({ children }) => <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>,
                  ol: ({ children }) => <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>,
                  blockquote: ({ children }) => (
                    <blockquote className="my-2 border-l-2 border-current pl-3 opacity-75">{children}</blockquote>
                  ),
                  code: ({ children, className }) => className ? (
                    <code className={`${className} my-2 block overflow-x-auto whitespace-pre rounded-[var(--radius-xs)] bg-black/10 p-2 font-mono text-[12px]`}>
                      {children}
                    </code>
                  ) : (
                    <code className="rounded bg-black/10 px-1 py-0.5 font-mono text-[.9em]">{children}</code>
                  ),
                  a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">{children}</a>
                  ),
                }}
              >
                {textShown ? sv.cleanText : ''}
              </ReactMarkdown>
              {last && m.pending && <span className="ml-0.5 inline-block animate-pulse">▍</span>}
              {last && pins.includes(m.id) && <span className="ml-1 text-[10px] opacity-60">📌</span>}
              <span className={`ml-1.5 inline-flex translate-y-[2px] items-center gap-1 whitespace-nowrap text-[10px] leading-none select-none
                ${telegramPilot ? 'tg-time' : m.role === 'user' ? 'text-[color:var(--color-surface)] opacity-55' : 'text-[color:var(--color-ink-4)]'}`}>
                <span>{hhmm(m.ts)}</span>
                {m.role === 'user' && (
                  <span className={msgs.slice(i + 1).some((x) => x.role === 'assistant' && x.content && !x.strip)
                    ? 'tracking-[-0.18em] opacity-100' : 'opacity-60'}>
                    {msgs.slice(i + 1).some((x) => x.role === 'assistant' && x.content && !x.strip) ? '✓✓' : '✓'}
                  </span>
                )}
              </span>
            </div>
            {sv.names.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {sv.names.map((n, k) => <StickerImg key={k} name={n} lib={stickerLib} />)}
              </div>
            )}
            {last && m.role === 'assistant' && extractSong(m.content).song && (
              <SongBubble song={extractSong(m.content).song!} />
            )}
              </>
              )
            })}
            {m.role === 'user' && extractSong(m.content).song && (
              <SongBubble song={extractSong(m.content).song!} />
            )}
            {!m.pending && m.choice && (
              <ChoiceCard choice={m.choice} live={!busy && m.id === lastAsstId}
                onPick={(t) => { setChoice(null); void send(undefined, t) }} />
            )}
            {!m.pending && extractInvite(m.content).invite && (
              <InviteBubble id={m.id} inv={extractInvite(m.content).invite!} mine={m.role === 'user'}
                later={msgs.slice(i + 1).filter((x) => x.role !== m.role).map((x) => x.content)}
                onAnswer={(yes) => { const t = extractInvite(m.content).invite!.title
                  void send(undefined, yes ? `【接受邀请】${t}\n好呀，我去！` : `【婉拒邀请】${t}\n这次先不啦，下次再约～`) }} />
            )}
            {m.role === 'assistant' && artifactView.artifacts.map((a, ai)=><ArtifactCard key={`${m.id}-artifact-${ai}`} artifact={a}/>)}
            {m.role === 'assistant' && !m.pending && (() => {
              const imgs = artifactView.files.filter((f) => IMG_FILE.test(f))
              const stack = imgs.length >= 2
              return <>
                {stack && <div className="mt-1 w-full min-w-[250px] max-w-[320px] rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-2.5 pb-1"><PhotoStack srcs={imgs.map((f) => outboxUrl(f))} /></div>}
                {artifactView.files.filter((f) => !(stack && IMG_FILE.test(f))).map((f)=><FileCard key={`${m.id}-file-${f}`} name={f}/>)}
              </>
            })()}
            {m.role === 'assistant' && !m.pending && artifactView.files.length > 0 && !artifactView.text && <span className="mt-0.5 text-[10px] text-[color:var(--color-ink-3)]">{hhmm(m.ts)}</span>}
            </div>
            {showAvatars && m.role === 'user' && (
              view[i - 1]?.role === 'user' && !view[i - 1]?.bell
                ? <span className="h-7 w-7 shrink-0" />
                : <img src={userAvatarFor(roomId)} alt="" draggable={false} className="mb-0.5 h-7 w-7 shrink-0 rounded-full bg-black/[.06] object-cover" />
            )}
          </motion.div>
        )})}
      </div>
      {showDown && (
        <motion.button type="button" aria-label="回到最新" onClick={toBottom}
          initial={{ opacity: 0, scale: .8 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: .15 }}
          className="loop-circle no-glass absolute bottom-3 right-3 z-[6] grid h-10 w-10 place-items-center rounded-full border border-black/10
                     bg-white/90 text-[color:var(--color-ink)] shadow-[0_4px_14px_rgba(0,0,0,.14)] backdrop-blur-md">
          <svg viewBox="0 0 24 24" className="h-[20px] w-[20px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5v14M6 13l6 6 6-6" />
          </svg>
          {unread && <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-[#e5484d] ring-2 ring-white" />}
        </motion.button>
      )}
      </div>

      {forwardWaiting && <p role="status" className="px-4 py-1 text-[11px] text-[color:var(--color-ink-3)]">对方正在处理转发记录…</p>}
      {selecting && <SelectionBar count={selected.length} onCancel={() => { setSelecting(false); setSelected([]) }} onForward={() => setForwarding(msgs.filter(m => selected.includes(m.id)).map(m => ({ id: m.id, role: m.role, content: m.content, ts: m.ts })))} />}
      {forwarding && <ForwardSheet source={getRoom()} messages={forwarding} onClose={() => setForwarding(null)} onSent={() => { setSelecting(false); setSelected([]) }} />}

      {choice && (
        <div className="fixed inset-0 z-[120] flex items-end bg-black/20 backdrop-blur-[2px]"
             onClick={() => setChoice(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-[var(--radius-xl)] bg-[var(--color-surface)] p-4
                       pb-[max(1rem,env(safe-area-inset-bottom))]">
            <p className="mb-3 text-[length:var(--text-card)] font-medium">{choice.question}</p>
            {choice.options.map((o) => (
              <button key={o.letter}
                onClick={() => { setChoice(null); void send(undefined, o.text) }}
                className="mb-2 flex w-full items-baseline gap-3 rounded-[var(--radius-md)] border
                           border-[var(--color-line)] bg-[var(--color-card)] p-3 text-left active:bg-[var(--color-line)]">
                <b className="shrink-0">{o.letter}</b>
                <span className="min-w-0 flex-1">{o.text}</span>
              </button>
            ))}
            <button onClick={() => setChoice(null)}
              className="mt-1 w-full rounded-[var(--radius-md)] border border-[var(--color-line)] py-2.5">先不选</button>
          </div>
        </div>
      )}

      {search && <Search all={msgs} onJump={jump} onClose={() => setSearch(false)} />}
      {doc && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-[var(--radius-md)] border
                        border-[var(--color-line)] bg-[var(--color-surface)] p-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[var(--radius-xs)]
                           bg-[var(--color-card)] font-mono text-[10px]">
            {doc.name.split('.').pop()?.toUpperCase().slice(0, 4)}
          </span>
          <span className="min-w-0 flex-1 truncate text-[length:var(--text-sub)]">{doc.name}</span>
          <button onClick={() => setDoc(null)} className="px-2 text-[color:var(--color-ink-3)]">×</button>
        </div>
      )}
      {pics.length > 0 && (
        <div className="mx-3 mb-2 flex gap-2 overflow-x-auto rounded-[var(--radius-md)] border
                        border-[var(--color-line)] bg-[var(--color-surface)] p-2">
          {pics.map((src, i) => (
            <div key={src.url} className="relative shrink-0">
              <img src={src.url} alt="" className="h-16 w-16 rounded-[var(--radius-xs)] object-cover" />
              <button onClick={() => setPics(pics.filter((_, k) => k !== i))}
                className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full
                           bg-[var(--color-ink)] text-[11px] text-[color:var(--color-surface)]">×</button>
            </div>
          ))}
        </div>
      )}
      {slash && <SlashPanel onPick={(c) => { setText(c + ' '); setSlash(false) }} />}
      {stickerOpen && !selecting && (
        <StickerPanel stickers={stickers} onChanged={reloadStickers} onClose={() => setStickerOpen(false)}
          onPick={(n) => { if (!busy) void send(n) }} />
      )}

      {!selecting && (telegramPilot ? <>
      {loop && (
        <div className="loop-tools mx-3 mb-2 flex items-center gap-2">
          {([
            ['相册', () => pic.current?.click(), 'M4 5h16v14H4zM8.5 10a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM4 17l5-5 4 4 3-3 4 4'],
            ['拍摄', () => cam.current?.click(), 'M4 8h3l1.5-2h7L17 8h3v11H4zM12 16a3 3 0 100-6 3 3 0 000 6z'],
            ['文件', () => file.current?.click(), 'M7 3h7l5 5v13H7zM14 3v5h5'],
            ['表情包', () => { setPlusOpen(false); setStickerOpen((v) => !v) }, 'M12 21a9 9 0 110-18 9 9 0 010 18zM9 10h.01M15 10h.01M8.5 14.5a4.5 4.5 0 007 0'],
            ['邀请卡', () => { setStickerOpen(false); setPlusPage('invite'); setPlusOpen((v) => !(v && plusPage === 'invite')) }, 'M4 6h16v12H4zM4 7l8 6 8-6'],
          ] as const).map(([label, on, d]) => (
            <button key={label} type="button" onClick={on} aria-label={label}
              className="loop-tool grid h-[38px] w-[38px] shrink-0 place-items-center rounded-full">
              <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>
            </button>
          ))}
          <span className="loop-tools-note ml-auto truncate rounded-full px-3 py-1.5 text-[10.5px]">长按消息 · 更多操作</span>
        </div>
      )}
      {recording && (
        <div className="pointer-events-none fixed inset-x-0 top-[38%] z-[90] flex justify-center">
          <div className={`rounded-[22px] px-6 py-4 text-center shadow-lg backdrop-blur-md ${recCancelHint ? 'bg-[#e5484d]/90 text-white' : 'bg-black/70 text-white'}`}>
            <div className="text-[15px] font-medium">{recCancelHint ? '松开手指，取消发送' : '正在录音…'}</div>
            <div className="mt-1 text-[12px] opacity-80">{recCancelHint ? '' : '松开发送 · 上滑取消'}</div>
          </div>
        </div>
      )}
      <div className={`tg-composer mx-2.5 flex items-end gap-2 p-1.5 ${plusOpen ? 'mb-1.5' : 'mb-[max(0.4rem,env(safe-area-inset-bottom))]'}`}>
        {([[file, 'image/*,.pdf,.md,.markdown,.txt,.json,.jsonl,.csv,.tsv,.yaml,.yml,.xml,.html,.css,.js,.ts,.py,.zip,.rar,.7z,.tar,.gz,.docx,.doc,.xlsx,.xls,.pptx,.epub,.mp3,.m4a,.wav,.mp4,.mov,application/zip,application/x-zip-compressed,application/octet-stream', undefined],
           [pic, 'image/*', undefined], [cam, 'image/*', 'environment']] as const).map(([ref, accept, capture], k) => (
          <input key={k} ref={ref} type="file" multiple={!capture} hidden accept={accept} capture={capture}
            onChange={async (e) => {
              const fs = e.target.files; if (!fs?.length) return
              const imgs = Array.from(fs).filter((f) => f.type.startsWith('image/'))
              const docs = Array.from(fs).filter((f) => !f.type.startsWith('image/'))
              if (imgs.length) { const urls = await uploadImages(imgs); setPics((p) => [...p, ...urls]) }
              if (docs.length) {
                const f = docs[0], reader = new FileReader()
                reader.onload = () => setDoc({ name: f.name, dataUrl: String(reader.result) })
                reader.readAsDataURL(f)
              }
              e.target.value = ''
            }} />
        ))}
        <textarea ref={input} value={text} rows={1} placeholder="输入消息"
          onChange={(e) => setText(e.target.value)} onFocus={() => setPlusOpen(false)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); void send() } }}
          className="tg-compose-input min-h-10 min-w-0 flex-1 resize-none px-3.5 py-2.5 outline-none" />
        {!loop && <button onClick={() => { setPlusOpen((v) => !v); setPlusPage('grid'); setStickerOpen(false) }} aria-label="更多" aria-expanded={plusOpen}
          className="tg-compose-action grid h-10 w-10 shrink-0 place-items-center rounded-full">
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] transition-transform duration-200" style={{ transform: plusOpen ? 'rotate(45deg)' : 'none' }}
            fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
        </button>}
        <button aria-label={busy ? '停止' : text.trim() || pics.length || doc ? '发送' : recording ? '停止录音' : '录音'}
          {...holdProps}
          onClick={() => busy ? (abort.current?.abort(), void stopChat())
            : text.trim() || pics.length || doc ? void send() : undefined}
          className={`tg-compose-action grid h-10 w-10 shrink-0 place-items-center rounded-full ${recording ? 'animate-pulse ring-2 ring-white/70' : ''}`}>
          {busy ? '■' : text.trim() || pics.length || doc ? '➤' : <IconMicSolid />}
        </button>
      </div>
      {plusOpen && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .18 }}
          className="mx-2.5 mb-[max(0.4rem,env(safe-area-inset-bottom))] rounded-[22px] border border-white/80"
          style={{ background: 'rgba(255,255,255,.55)', backdropFilter: 'blur(20px) saturate(1.4)', WebkitBackdropFilter: 'blur(20px) saturate(1.4)' }}>
          {plusPage === 'grid' ? (
            <PlusPanel items={[
              { key: 'photo', label: '相册', on: () => { setPlusOpen(false); pic.current?.click() } },
              { key: 'camera', label: '拍摄', on: () => { setPlusOpen(false); cam.current?.click() } },
              { key: 'file', label: '文件', on: () => { setPlusOpen(false); file.current?.click() } },
              { key: 'sticker', label: '表情包', on: () => { setPlusOpen(false); setStickerOpen(true) } },
              { key: 'invite', label: '邀请卡', on: () => setPlusPage('invite') },
            ]} />
          ) : (
            <InviteComposer onClose={() => setPlusPage('grid')}
              onSend={(marker) => { if (busy) return; setPlusOpen(false); setPlusPage('grid'); void send(undefined, marker) }} />
          )}
        </motion.div>
      )}
      </> : <div className="mx-3 mb-[max(0.5rem,env(safe-area-inset-bottom))] flex items-center gap-2
                      rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]
                      p-2 shadow-[var(--shadow-sm)]">
        <button onClick={() => file.current?.click()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-ink)]
                     text-[color:var(--color-surface)]"><IconPhotoSolid /></button>
        <input ref={file} type="file" multiple hidden
          accept="image/*,.pdf,.md,.markdown,.txt,.json,.jsonl,.csv,.tsv,.yaml,.yml,.xml,.html,.css,.js,.ts,.py,.zip,.rar,.7z,.tar,.gz,.docx,.doc,.xlsx,.xls,.pptx,.epub,.mp3,.m4a,.wav,.mp4,.mov,application/zip,application/x-zip-compressed,application/octet-stream"
          onChange={async (e) => {
            const fs = e.target.files; if (!fs?.length) return
            const imgs = Array.from(fs).filter((f) => f.type.startsWith('image/'))
            const docs = Array.from(fs).filter((f) => !f.type.startsWith('image/'))
            if (imgs.length) { const urls = await uploadImages(imgs); setPics((p) => [...p, ...urls]) }
            if (docs.length) {
              const f = docs[0]
              const reader = new FileReader()
              reader.onload = () => setDoc({ name: f.name, dataUrl: String(reader.result) })
              reader.readAsDataURL(f)
            }
            e.target.value = ''
          }} />
        <button {...holdProps}
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-full
            ${recording ? 'animate-pulse bg-[var(--color-surface)] text-[color:var(--color-ink)] ring-2 ring-[var(--color-ink)]'
                        : 'bg-[var(--color-ink)] text-[color:var(--color-surface)]'}`}><IconMicSolid /></button>
        <textarea value={text} rows={1} placeholder="说点什么…"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) { e.preventDefault(); void send() } }}
          className="min-w-0 flex-1 resize-none rounded-[var(--radius-md)] border border-[var(--color-line)]
                     bg-[var(--color-card)] px-3.5 py-2.5 outline-none
                     focus:border-[var(--color-ink)] focus:bg-[var(--color-surface)]" />
        <button onClick={() => setStickerOpen((v) => !v)} aria-label="表情包" aria-pressed={stickerOpen}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-ink)]
                     text-[color:var(--color-surface)]"><IconSticker /></button>
        <button onClick={() => busy ? (abort.current?.abort(), void stopChat()) : void send()}
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[var(--color-ink)]
                     text-[color:var(--color-surface)]">
          {busy ? '■' : '➤'}
        </button>
      </div>)}


      {/* 长按小菜单 */}
      {bellOpen && <>
        <div className="fixed inset-0 z-[125]" onClick={() => setBellOpen(false)} />
        <form className="no-glass fixed inset-x-3 top-[calc(max(.625rem,env(safe-area-inset-top))+58px)] z-[126] mx-auto flex max-w-[520px] items-center gap-2 rounded-full
                         bg-[var(--color-surface)] py-1.5 pl-4 pr-1.5 shadow-[0_10px_34px_rgba(0,0,0,.12)]"
              onSubmit={(e) => { e.preventDefault(); shake() }}>
          <span className="shrink-0 text-[13px] text-[color:var(--color-ink-2)]">摇了摇铃铛</span>
          <input autoFocus value={bellText} maxLength={40} onChange={(e) => setBellText(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none" />
          <button type="submit" disabled={busy} aria-label="摇铃铛"
            className="bell-tap grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[var(--color-line)] bg-white shadow-[0_2px_8px_rgba(0,0,0,.06)] disabled:opacity-30">
            <BellIcon className="h-[24px] w-[24px]" />
          </button>
        </form>
      </>}
      {menu && (
        <>
          <div className="fixed inset-0 z-[70]" onClick={() => setMenu(null)} onTouchStart={() => setMenu(null)} />
          <div className="fixed z-[71] w-[128px] overflow-hidden rounded-[var(--radius-sm)] border
                          border-[var(--color-line)] bg-[var(--color-surface)] py-1
                          shadow-[0_10px_40px_rgba(0,0,0,.16)]"
               style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 140)),
                        top: Math.max(8, Math.min(menu.y, window.innerHeight - 220)) }}>
            <button disabled={busy} onClick={() => { setSelecting(true); setSelected([menu.id]); setMenu(null) }}
              className="block w-full px-3.5 py-2 text-left text-[13px] hover:bg-[var(--color-card)] disabled:opacity-40">多选 · 合并转发</button>
            <button onClick={() => { togglePin(menu.id); setMenu(null) }}
              className="block w-full px-3.5 py-2 text-left text-[13px] hover:bg-[var(--color-card)]">
              {pins.includes(menu.id) ? '取消置顶' : '置顶'}
            </button>
            <button onClick={() => void keepIt(menu)}
              className="block w-full px-3.5 py-2 text-left text-[13px] hover:bg-[var(--color-card)]">收藏</button>
            <button onClick={() => quoteIt(menu)}
              className="block w-full px-3.5 py-2 text-left text-[13px] hover:bg-[var(--color-card)]">引用</button>
            <button onClick={() => {
                const t = plainText(menu.text)
                setMenu(null)
                if (!t) { say('这条没有字'); return }
                if (navigator.clipboard?.writeText) void navigator.clipboard.writeText(t).then(() => say('复制好了'), () => say(copyFallback(t) ? '复制好了' : '复制不了'))
                else say(copyFallback(t) ? '复制好了' : '这个浏览器不给复制')
              }}
              className="block w-full px-3.5 py-2 text-left text-[13px] hover:bg-[var(--color-card)]">复制</button>
          </div>
        </>
      )}

      {/* 一闪而过的小提示 */}
      {toast && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[72] -translate-x-1/2 rounded-full
                        bg-[var(--color-ink)] px-3.5 py-1.5 text-[12px] text-[color:var(--color-surface)]">
          {toast}
        </div>
      )}
      {thinkingSheet && (
        <div className="fixed inset-0 z-[160] flex items-end bg-black/25 backdrop-blur-[2px]"
          onClick={() => setThinkingSheet(null)}>
          <div onClick={(e) => e.stopPropagation()}
            className="w-full rounded-t-[var(--radius-lg)] bg-[var(--color-surface)] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
            <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-[var(--color-line)]" />
            <p className="mb-2 text-[11px] tracking-[2px] text-[color:var(--color-ink-3)]">思考过程</p>
            <div className="max-h-[55vh] overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-[color:var(--color-ink-2)]">
              {thinkingSheet}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
export { SLASH }

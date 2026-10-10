import { whoName } from './identity'
import { API_BASE } from './config'
const BASE = API_BASE

export function hasVoiceMarker(text: string): boolean {
  return /\[\[voice\]\]/i.test(String(text || ''))
}

/** `[[voice]]` is a control marker from Claude, never visible or spoken. */
export function stripVoiceMarker(text: string): string {
  return String(text || '').replace(/\s*\[\[voice\]\]\s*/gi, ' ').replace(/\[\[静默\]\]/g, '')
}

export const FILE_MARK = /\[\[file:([^\]\n]{1,200})\]\]/gi
export function stripFileMarkers(text: string): string {
  return String(text || '').replace(FILE_MARK, ' ')
}
export function outboxUrl(name: string, download = false): string {
  return `${BASE}/outbox/${encodeURIComponent(name)}${download ? '?dl=1' : ''}`
}

export type Role = 'user' | 'assistant'
export type ToolRec = { name: string; ok?: boolean; done?: boolean }
export type Msg = {
  id: string; role: Role; content: string; ts?: string; image?: string; pending?: boolean
  thinking?: string; tools?: ToolRec[]; audio?: string; seconds?: number; images?: string[]
  /** 系统小条（唤醒等，记录里 role=system）：不是谁说的话，画成居中浅色小字条 */
  strip?: boolean
}

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36)

type RawMsg = { ts?: string; role?: string; kind?: string; text?: string; image?: string | null; images?: string[]; thinking?: string | null; audio?: string | null; seconds?: number; audio_seconds?: number; tools?: { name?: string; ok?: boolean }[] }

const mapRaw = (m: RawMsg): Msg => ({
  id: String(m.ts ?? uid()),
  role: (m.role === 'user' ? 'user' : 'assistant') as Role,
  content: stripVoiceMarker(String(m.text ?? '')).trim(),
  image: m.image ?? undefined,
  images: Array.isArray(m.images) ? m.images : undefined,
  audio: m.audio ?? undefined,
  seconds: m.seconds ?? (m.audio_seconds || undefined),   // 网关落盘字段叫 audio_seconds
  thinking: (m.thinking as string) ?? undefined,
  tools: Array.isArray(m.tools) && m.tools.length
    ? m.tools.map((t) => ({ name: String(t?.name || 'tool'), ok: t?.ok !== false, done: true })) : undefined,
  ts: m.ts,
  ...(m.role === 'system' ? { strip: true } : {}),
})

export async function fetchHistoryPage(roomId = getRoom(), before?: string | null):
  Promise<{ msgs: Msg[]; hasMore: boolean }> {
  const q = new URLSearchParams({ limit: '50', room: roomId })
  if (before) q.set('before', before)
  const r = await fetch(`${BASE}/history?${q}`, { cache: 'no-store' })
  if (!r.ok) return { msgs: [], hasMore: false }
  const d = await r.json()
  const list: RawMsg[] = Array.isArray(d) ? d : (d.messages ?? [])
  return { msgs: list.filter((m) => (m.text ?? '').trim()).map(mapRaw), hasMore: Boolean(d.hasMore) }
}

export async function fetchHistory(roomId = 'home'): Promise<Msg[]> {
  return (await fetchHistoryPage(roomId)).msgs
}

export async function appendHistory(
  role: Role, text: string, image: string | null = null,
  thinking: string | null = null, roomId = getRoom(),
  images?: string[], channel?: string,
  audio?: { name: string; secs: number } | null,
) {
  try {
    await fetch(`${BASE}/history/append`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, text, image, thinking, room_id: roomId, channel, ...(images?.length ? { images } : {}),
        ...(audio?.name ? { audio: audio.name, audio_seconds: audio.secs } : {}) }),
    })
  } catch { /* 落盘失败不阻断对话 */ }
}

/** 流式发送，每拿到一段就回调 */
export type StreamEvents = {
  onText: (t: string) => void
  onThinking?: (t: string) => void
  onTool?: (name: string, done: boolean) => void
  /** 每收到一块数据（含网关 10 秒一次的心跳）就叫一声——前端据此判断流是不是已经死了 */
  onAlive?: () => void
}

export type Block =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'document_url'; document_url: { url: string; name?: string } }
export type OutMsg = { role: Role; content: string | Block[] }

export async function streamChat(
  messages: OutMsg[],
  onDelta: StreamEvents | ((text: string) => void),
  opts: { model?: string; channel?: string; effort?: string; roomId?: string; signal?: AbortSignal; persist?: boolean } = {},
): Promise<string> {
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: opts.signal,
    body: JSON.stringify({
      model: opts.model, channel: opts.channel, effort: opts.effort, room_id: opts.roomId, stream: true, messages,
      ...(opts.persist === false ? { persist: false } : {}),
    }),
  })
  if (!r.ok || !r.body) throw new Error('HTTP ' + r.status)

  const ev: StreamEvents = typeof onDelta === 'function' ? { onText: onDelta } : onDelta
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = '', full = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    ev.onAlive?.()
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n'); buf = lines.pop() ?? ''
    for (const raw of lines) {
      const line = raw.trimEnd()
      if (!line.startsWith('data: ') || line === 'data: [DONE]') continue
      try {
        const delta = JSON.parse(line.slice(6))?.choices?.[0]?.delta
        if (!delta) continue
        const t = delta.content
        if (typeof t === 'string' && t) { full += t; ev.onText(t) }
        const think = delta.reasoning_content
        if (typeof think === 'string' && think) ev.onThinking?.(think)
        if (delta.tool_use) {
          const tu = delta.tool_use
          const nm = delta.tool_name ?? (typeof tu === 'string' ? tu : tu?.name ?? tu?.tool ?? '')
          if (nm) ev.onTool?.(String(nm), false)      // 别再把对象 String() 成 [object Object]
        }
        if (delta.tool_use_done) ev.onTool?.(String(delta.tool_name ?? ''), true)
      } catch { /* 半包，忽略 */ }
    }
  }
  return full
}

export async function stopChat() {
  try { await fetch(`${BASE}/stop`, { method: 'POST' }) } catch { /* ignore */ }
}

export const newId = uid

export type ModelItem = { id: string; label: string; note?: string }
export type ModelGroup = { group: string; items: ModelItem[] }

export async function fetchModels(): Promise<{ def: string; groups: ModelGroup[] }> {
  try {
    const r = await fetch(`${BASE}/models`, { cache: 'no-store' })
    if (!r.ok) return { def: '', groups: [] }
    const d = await r.json()
    return { def: String(d.default ?? ''), groups: Array.isArray(d.groups) ? d.groups : [] }
  } catch { return { def: '', groups: [] } }
}

export type ChannelModel = { id: string; label: string; note?: string }
export type ChannelItem = { id: string; label: string; note?: string; configured: boolean; available: boolean; models: ChannelModel[] }
export type ApiProvider = {
  id: 'openrouter' | 'deepseek' | 'openai'; label: string; configured: boolean
  baseUrl: string; model: string; models: string[]
}
export const fetchChannels = () => getJSON<{ default: string; channels: ChannelItem[] }>('/channels', { default: 'claude-subscription', channels: [] })
export const fetchApiProviders = () => getJSON<{ providers: ApiProvider[] }>('/settings/providers', { providers: [] })
export async function saveApiProvider(id: ApiProvider['id'], input: { apiKey?: string; baseUrl?: string; models?: string[]; clearKey?: boolean }) {
  const r = await fetch(`${BASE}/settings/providers/${encodeURIComponent(id)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  const data = await r.json().catch(() => null)
  if (!r.ok) throw new Error(data?.error?.message || `保存失败（${r.status}）`)
  return data as { ok: boolean; provider: ApiProvider }
}

export type VoiceProvider = 'elevenlabs' | 'mosi' | 'edge'
export type VoiceSettings = {
  provider: VoiceProvider; configured: boolean; mosiConfigured?: boolean; voiceId: string; model: string
  mosiVoiceId: string; tempo: number; edgeVoice: string
}
export const fetchVoiceSettings = () => getJSON<{ voice: VoiceSettings }>('/settings/voice', {
  voice: { provider: 'edge', configured: false, voiceId: '', model: 'eleven_multilingual_v2', mosiVoiceId: '', tempo: 1.15, edgeVoice: 'zh-CN-YunxiNeural' },
})
export async function saveVoiceSettings(input: Partial<VoiceSettings> & { apiKey?: string; clearKey?: boolean; mosiApiKey?: string; clearMosiKey?: boolean }) {
  const r = await fetch(`${BASE}/settings/voice`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  const data = await r.json().catch(() => null)
  if (!r.ok) throw new Error(data?.error?.message || `保存失败（${r.status}）`)
  return data as { ok: boolean; voice: VoiceSettings }
}

/* 服务器设置（网关 DATA_DIR/settings.json）：名字/时区、会话行为、语音识别、生图、Bark、mousecrew。
   key / token 只进不出，GET 只回"配没配" */
export type AsrProvider = 'off' | 'url' | 'openai' | 'gemini'
export type DrawProvider = 'off' | 'openai' | 'openrouter'
export type Integrations = {
  general: { userName: string; aiName: string; tz: string; turnNote: string; homeApiDoc: string }
  session: { permissionMode: string; forgeEnabled: boolean; forgeSoftPct: number; forgeRetain: number; forgeSquash: number; keepaliveMinutes: number; sideModel: string }
  asr: { provider: AsrProvider; url: string; baseUrl: string; model: string; tone: boolean; configured: boolean }
  draw: { provider: DrawProvider; baseUrl: string; model: string; aspect: string; quality: string; configured: boolean }
  bark: { configured: boolean; push: boolean }
  mousecrew: { url: string; configured: boolean }
}
export const fetchIntegrations = () => getJSON<Integrations | null>('/settings/server', null)
export async function saveIntegrations(input: Record<string, unknown>) {
  const r = await fetch(`${BASE}/settings/server`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input),
  })
  const data = await r.json().catch(() => null)
  if (!r.ok) throw new Error(data?.error?.message || `保存失败（${r.status}）`)
  return data as Integrations
}

export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'bypassPermissions'
export type Room = { id: string; title: string; type: string; agent?: string; permission_mode?: PermissionMode | null; channel?: string; model?: string; selected_model?: string; count?: number; last_ts?: string; last_text?: string; online?: boolean }
export type McpServer = { name: string; status: string; detail: string }
export type GalleryItem = { id: string; ext: string; mime: string; name: string; caption?: string; by?: string; ts?: string }
export type Status = {
  ok: boolean; alive: boolean; busy: boolean; channel?: string; model?: string; effort?: string
  context_tokens?: number; context_percent?: number; context_window_tokens?: number
  session_id?: string; pending_permissions?: number
  rate_limit?: RateLimit | null
}
type RateWindow = { utilization?: number; resetsAt?: number }
export type RateLimit = {
  status?: string; rateLimitType?: string; utilization?: number; resetsAt?: number; isUsingOverage?: boolean
  unifiedWindows?: { five_hour?: RateWindow; seven_day?: RateWindow; [k: string]: RateWindow | undefined }
  seen_at?: number
}

const getJSON = async <T,>(path: string, fallback: T): Promise<T> => {
  try {
    const r = await fetch(`${BASE}${path}`, { cache: 'no-store' })
    if (!r.ok) return fallback
    return (await r.json()) as T
  } catch { return fallback }
}

export const fetchRooms   = () => getJSON<{ rooms: Room[]; active_room?: string }>('/rooms', { rooms: [] })
export const fetchMcp     = () => getJSON<{ servers: McpServer[] }>('/mcp', { servers: [] })
export const fetchGallery = () => getJSON<{ items: GalleryItem[] }>('/gallery', { items: [] })
export const fetchStatus  = (room = getRoom()) => getJSON<Status>(`/status?room=${encodeURIComponent(room)}`, { ok: false, alive: false, busy: false })

export async function reconnectMcp() {
  try { await fetch(`${BASE}/mcp/reconnect`, { method: 'POST' }); return true } catch { return false }
}

export type McpConf = { name: string; type: string; url: string; hasAuth: boolean; disabled: boolean }
export const fetchMcpConfig = () => getJSON<{ servers: McpConf[] }>('/mcp/config', { servers: [] })
export async function patchMcpConfig(name: string, body: { url?: string; type?: string; auth?: string; disabled?: boolean; delete?: boolean }) {
  try {
    const r = await fetch(`${BASE}/mcp/config/${encodeURIComponent(name)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    return r.ok
  } catch { return false }
}
export const galleryUrl = (id: string, ext: string) =>
  `${BASE}/gallery/file/${encodeURIComponent(id + '.' + ext)}`

export async function galleryAdd(dataUrl: string, name: string, caption = '') {
  const r = await fetch(`${BASE}/gallery`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: dataUrl, name, caption, by: 'user' }),
  })
  return r.ok
}
export async function galleryDel(id: string) {
  const r = await fetch(`${BASE}/gallery/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return r.ok
}
export const galleryByLabel = (by?: string) => whoName(by)

export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读不了这个文件'))
    if (file.type === 'image/gif') { reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); return }
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('这张图打不开'))
      img.onload = () => {
        const max = 1600
        const scale = Math.min(1, max / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
        resolve(c.toDataURL('image/jpeg', 0.82))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

/* ═══ 储物柜：八个房间共用的增删改查 ═══ */
export type ColItem = Record<string, unknown> & { id: string; ts: string; by?: string }

export async function colList(name: string): Promise<ColItem[]> {
  try {
    const r = await fetch(`${BASE}/col/${name}`, { cache: 'no-store' })
    if (!r.ok) return []
    return (await r.json()).items ?? []
  } catch { return [] }
}
export async function colAdd(name: string, obj: Record<string, unknown>) {
  const r = await fetch(`${BASE}/col/${name}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj),
  })
  return r.ok
}
export async function colDel(name: string, id: string) {
  const r = await fetch(`${BASE}/col/${name}/${encodeURIComponent(id)}`, { method: 'DELETE' })
  return r.ok
}
export async function colPatch(name: string, id: string, obj: Record<string, unknown>) {
  const r = await fetch(`${BASE}/col/${name}/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj),
  })
  return r.ok
}

/* ═══ 权限 · 语音 · 上传 · 房间 ═══ */
export const ROOM_KEY = 'perigee.room'
export const getRoom = () => localStorage.getItem(ROOM_KEY) || 'home'
export const setRoom = (id: string) => localStorage.setItem(ROOM_KEY, id)

export type Permission = { request_id: string; tool?: string; title?: string; detail?: string }

export async function answerPermission(requestId: string, behavior: 'allow' | 'deny', roomId = getRoom()) {
  try {
    await fetch(`${BASE}/session/permission`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ request_id: requestId, behavior, room_id: roomId }),
    })
    return true
  } catch { return false }
}

/** 录音 → 文字 */
export async function transcribe(blob: Blob): Promise<string> {
  const r = await fetch(`${BASE}/asr`, {
    method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: blob,
  })
  const d = await r.json()
  if (!r.ok || !d.ok) return ''
  return String(d.text ?? '').trim()
}

export type Pic = { url: string; dataUrl: string }

/** 上传一张图：存进图库（拿 url 显示），同时留着 dataUrl —— 我要靠它才看得见 */
export async function uploadImage(file: File): Promise<Pic | null> {
  try {
    const dataUrl = await compressImage(file)
    const r = await fetch(`${BASE}/gallery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: dataUrl, name: file.name, by: 'user' }),
    })
    if (!r.ok) return null
    const d = await r.json()
    const it = d.item ?? d.items?.[0]
    return it ? { url: galleryUrl(it.id, it.ext), dataUrl } : null
  } catch { return null }
}

/** 一次传多张，按顺序回；失败的那张跳过 */
export async function uploadImages(files: FileList | File[]): Promise<Pic[]> {
  const out: Pic[] = []
  for (const f of Array.from(files)) {
    const p = await uploadImage(f)
    if (p) out.push(p)
  }
  return out
}

export async function clearHistory(roomId = getRoom()) {
  try {
    await fetch(`${BASE}/history/clear`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId }),
    })
    return true
  } catch { return false }
}

export async function pingTyping(roomId = getRoom()) {
  try { await fetch(`${BASE}/typing/ping`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ room_id: roomId }) }) } catch { /* ignore */ }
}

/* ═══ 打电话 ═══ */
export type Ring = { ring?: { opening?: string } | null }
export const fetchRing = () => getJSON<Ring>('/call/ring', {})
export const ringUrl = `${BASE}/audio/ring.mp3`
export async function answerCall()  { try { await fetch(`${BASE}/call/answer`,  { method: 'POST' }); return true } catch { return false } }
export async function declineCall() { try { await fetch(`${BASE}/call/decline`, { method: 'POST' }); return true } catch { return false } }

/** 让我把这句话念出来 */
export async function speak(text: string): Promise<string | null> {
  try {
    const clean = cleanForSpeech(text)
    if (!clean) return null
    const r = await fetch(`${BASE}/tts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean }),
    })
    if (!r.ok) return null
    const ct = r.headers.get('content-type') || ''
    if (ct.includes('json')) { const d = await r.json(); return d.url ?? null }
    return URL.createObjectURL(await r.blob())
  } catch { return null }
}

/* ═══ 注册表：服务目录 · 自定义连接 · 连接回执 ═══ */
export type CatalogEntry = { name: string; url: string; transport: 'http' | 'sse' | 'stdio'; blurb: string; official?: boolean }

/* 服务目录不再手写清单——
   直接读前端那个我真实连着的服务（/mcp），按背后的地址认人：同一个服务挂了几个名字就并成一行。
   这张表只管"认出来叫什么、一句话说明"；没认出来的新连接照样显示，说明写域名。
   网址里常带 token，界面上只许露域名。 */
/* 认识的服务按地址认名字、给一句说明；没认出来的照样显示（只露域名，网址里的 token 不出）。想加自己常用的，在这里加一行。 */
const MCP_KNOWN: { re: RegExp; name: string; blurb: string; home?: boolean }[] = [
  { re: /mcp\.notion\.com/, name: 'Notion', blurb: '日记与文档' },
  { re: /api\.anthropic\.com\/v1\/pages/, name: 'Claude Docs', blurb: '文档' },
]
export type LiveService = { name: string; blurb: string; home: boolean; status: string; aliases: string[] }
const rank = (st: string, detail: string) =>
  st === 'connected' ? 3 : /authenticat/i.test(detail) ? 2 : /disabled/i.test(detail) ? 1 : 0
export function liveCatalog(servers: McpServer[]): LiveService[] {
  const out = new Map<string, LiveService & { r: number }>()
  for (const s of servers) {
    if (s.name === 'Checking') continue
    const target = s.detail.split(' - ')[0].trim()
    const k = MCP_KNOWN.find((m) => m.re.test(target))
    let host = target
    try { host = new URL(target.split(' ')[0]).host } catch { host = target.split('/').pop() || target }
    const name = k?.name ?? s.name.replace(/^claude\.ai /, '')
    const r = rank(s.status, s.detail)
    const status = r === 3 ? 'connected' : r === 2 ? 'auth' : r === 1 ? 'disabled' : 'error'
    const prev = out.get(name)
    if (!prev) out.set(name, { name, blurb: k?.blurb ?? host, home: !!k?.home, status, aliases: [s.name], r })
    else {
      prev.aliases.push(s.name)
      if (r > prev.r) { prev.r = r; prev.status = status }
    }
  }
  return [...out.values()].sort((a, b) => (Number(b.home) - Number(a.home)) || (b.r - a.r)).map(({ r: _r, ...x }) => x)
}

export type Receipt = { name: string; status: string; detail: string; at: string }
const RKEY = 'perigee.receipts'
export const readReceipts = (): Receipt[] => { try { return JSON.parse(localStorage.getItem(RKEY) || '[]') } catch { return [] } }
export function writeReceipt(r: Receipt) {
  const all = [r, ...readReceipts()].slice(0, 40)
  localStorage.setItem(RKEY, JSON.stringify(all))
}


/* ═══ 力度 · 声音 ═══ */
export const EFFORTS = ['low', 'medium', 'high', 'max'] as const
export type Effort = typeof EFFORTS[number]
const EKEY = 'perigee.effort'
export const getEffort = () => (localStorage.getItem(EKEY) || 'high') as Effort
export const setEffort = (e: Effort) => localStorage.setItem(EKEY, e)
export const effortLabel = (e: Effort) => ({ low: 'Low', medium: 'Medium', high: 'High', max: 'Max' })[e]

export const VOICE = { id: '', name: '设置内音色', pitch: '', rate: '' }

export function cleanForSpeech(text: string): string {
  return stripFileMarkers(stripVoiceMarker(text)).replace(/\[\[铃铛[^\]\n]*\]\]/g, '')   // 铃铛标记不念
    .replace(/```[\s\S]*?```/g, '，代码我就不念了，')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')                    // 图片语法整个不念
    .replace(/\[([^\]]+)\]\((?:[^)]*)\)/g, '$1')              // [文字](链接) 只念文字
    .replace(/^\s*(?:[-+•·]|\d+[.、)])\s+/gm, '')              // 列表前缀
    .replace(/https?:\/\/\S+/g, '一个链接')
    .replace(/\[挂断\]/g, '')
    .replace(/[*#>`_~|]/g, '')
    .replace(/\[choices:[\s\S]*?\[\/choices\]/gi, '').replace(/\[song:[^\]]*\]/gi, '')
    .replace(/\s+/g, ' ').trim()
}

export function splitReadySentences(buffer: string, minLen = 4) {
  const out: string[] = []
  let rest = buffer
  for (;;) {
    const m = rest.match(/^[\s\S]*?[。！？!?；;…\n]+/)
    if (m && m[0].trim().length >= minLen) { out.push(m[0]); rest = rest.slice(m[0].length); continue }
    if (rest.length > Math.max(90, minLen + 30)) {
      const cut = Math.max(rest.lastIndexOf('，'), rest.lastIndexOf(','))
      if (cut > 20) { out.push(rest.slice(0, cut + 1)); rest = rest.slice(cut + 1); continue }
    }
    break
  }
  return { ready: out, rest }
}

/** 一句话 → 音频 blob（通话里每句单独合成，边出边播） */
export async function ttsBlob(text: string): Promise<Blob | null> {
  const clean = cleanForSpeech(text)
  if (!clean) return null
  try {
    const r = await fetch(`${BASE}/tts`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: clean }),
    })
    if (!r.ok) return null
    return await r.blob()
  } catch { return null }
}

export function moonPhase() {
  const synodic = 29.53058867
  const known = Date.UTC(2000, 0, 6, 18, 14) / 86400000
  const age = ((Date.now() / 86400000 - known) % synodic + synodic) % synodic
  const phases: [string, string][] = [
    ['🌑', '新月'], ['🌒', '娥眉月'], ['🌓', '上弦月'], ['🌔', '盈凸月'],
    ['🌕', '满月'], ['🌖', '亏凸月'], ['🌗', '下弦月'], ['🌘', '残月'],
  ]
  const cuts = [1.85, 5.54, 9.23, 12.92, 16.61, 20.30, 23.99]
  let idx = 7
  for (let i = 0; i < cuts.length; i++) if (age < cuts[i]) { idx = i; break }
  const illumination = Math.round((1 - Math.cos(age / synodic * 2 * Math.PI)) / 2 * 100)
  return { face: phases[idx][0], name: phases[idx][1], age: age.toFixed(1), illumination }
}

export const MOODS: [string, string][] = [
  ['🥰', '甜'], ['😊', '开心'], ['😌', '平静'], ['😪', '累'], ['😤', '烦'], ['😢', '难过'], ['🥺', '想你'],
]
export const byLabel = (by?: string) => whoName(by)

/* ═══ 插件目录（Skills 页只读浏览） ═══ */
export type MarketPlugin = { name: string; desc: string; cat: string; author?: string }

/* ═══ 语音条 ═══ */
export const audioUrl = (name: string) => `${BASE}/audio/${encodeURIComponent(name)}`

export async function uploadAudio(blob: Blob, mime: string): Promise<string | null> {
  try {
    const r = await fetch(`${BASE}/audio/upload`, {
      method: 'POST', headers: { 'Content-Type': mime || 'application/octet-stream' }, body: blob,
    })
    if (!r.ok) return null
    return (await r.json()).name ?? null
  } catch { return null }
}
export async function attachAudio(audio: string, audioSeconds = 0, roomId = getRoom()): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/history/attach-audio`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room_id: roomId, audio, audio_seconds: audioSeconds }),
    })
    return r.ok
  } catch { return false /* 挂不上不影响文字 */ }
}

/* ═══ 朋友圈 ═══ */
export type MomentComment = { id: string; moment_id: string; author: string; content: string; ts: string }
export type Moment = {
  id: string; author: string; content: string; images: string[]; ts: string
  liked?: boolean; reply_content?: string | null; replied_at?: string | null
  reply_status?: string; ai_liked?: boolean; likes?: string[]; comments?: MomentComment[]
}

export const fetchMoments = () => getJSON<{ entries: Moment[] }>('/moments', { entries: [] })

export async function postMoment(content: string, images: string[] = []) {
  const r = await fetch(`${BASE}/moments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, images }),
  })
  return r.ok
}
export async function likeMoment(id: string, liked: boolean) {
  try {
    await fetch(`${BASE}/moments/${encodeURIComponent(id)}/like`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ liked }),
    })
    return true
  } catch { return false }
}
export async function commentMoment(id: string, content: string) {
  const r = await fetch(`${BASE}/moments/${encodeURIComponent(id)}/comments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
  })
  return r.ok
}

export type Choice = { question: string; options: { letter: string; text: string }[] }

export function extractChoices(text: string): { cleanText: string; choice: Choice | null } {
  const match = String(text || '').match(/\[choices:\s*(?:"([^"]+)"|'([^']+)'|([^\]\n]+))\]\s*([\s\S]*?)\[\/choices\]/i)
  if (!match) return { cleanText: String(text || ''), choice: null }
  const options: Choice['options'] = []
  for (const o of match[4].matchAll(/^\s*-\s*([A-D])\s*:\s*(.+)$/gmi))
    options.push({ letter: o[1].toUpperCase(), text: o[2].trim() })
  return {
    cleanText: String(text || '').replace(match[0], '').trim(),
    choice: options.length ? { question: (match[1] || match[2] || match[3] || '').trim(), options } : null,
  }
}

export type SongCard = { name: string; artist: string; mid?: string; ncm?: string }

// 我在回复里写 [song:歌名|歌手|mid]，前端渲染成卡片，原始标记不显示
export type InviteCard = { title: string; when: string; note: string }
export function extractInvite(text: string): { cleanText: string; invite: InviteCard | null } {
  const m = String(text || '').match(/\[invite:\s*([^|\]]+?)\s*(?:\|\s*([^|\]]*?)\s*)?(?:\|\s*([^\]]*?)\s*)?\]/i)
  if (!m) return { cleanText: String(text || ''), invite: null }
  return {
    cleanText: String(text || '').replace(m[0], '').trim(),
    invite: { title: m[1].trim(), when: (m[2] || '').trim(), note: (m[3] || '').trim() },
  }
}
export function extractSong(text: string): { cleanText: string; song: SongCard | null } {
  const m = String(text || '').match(/\[song:\s*([^|\]]+?)\s*(?:\|\s*([^|\]]*?)\s*)?(?:\|\s*([^\]]*?)\s*)?\]/i)
  if (!m) return { cleanText: String(text || ''), song: null }
  return {
    cleanText: String(text || '').replace(m[0], '').trim(),
    song: (() => {
      const third = (m[3] || '').trim()
      const ncm = /^ncm:(\d+)$/i.exec(third)?.[1]
      return { name: m[1].trim(), artist: (m[2] || '').trim(), mid: ncm ? undefined : third || undefined, ncm }
    })(),
  }
}

export const songUrl = (s: SongCard) =>
  s.mid
    ? `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(s.mid)}`
    : `https://y.qq.com/n/ryqq/search?w=${encodeURIComponent(s.name + ' ' + s.artist)}`

export async function startListening(s: SongCard) {
  try {
    await fetch(`${BASE}/history/append`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        role: 'user',
        text: `（点开了你推的歌，开始一起听：${s.name}${s.artist ? ' — ' + s.artist : ''}）`,
        image: null, thinking: null, room_id: getRoom(),
      }),
    })
  } catch { /* 静默失败不影响播放 */ }
}

export type Sticker = { id: string; name: string; url: string; tags?: string[]; by?: string }

const STICKER_RE = /\[sticker:\s*([^\]\n]+?)\s*\]/gi
export const stickerMarker = (name: string) => `[sticker:${name}]`

export function extractStickers(text: string): { cleanText: string; names: string[] } {
  const names: string[] = []
  const cleanText = String(text || '').replace(STICKER_RE, (_, n: string) => { names.push(n.trim()); return '' }).trim()
  return { cleanText, names }
}

/** 表情包不走 compressImage：那边会压成 jpeg，透明底会变黑。动图原样过，静图缩到 512 保留格式 */
function stickerDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('读不了这个文件'))
    if (file.type === 'image/gif' || file.type === 'image/webp') {
      reader.onload = () => resolve(String(reader.result)); reader.readAsDataURL(file); return
    }
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('这张图打不开'))
      img.onload = () => {
        const scale = Math.min(1, 512 / Math.max(img.width, img.height))
        const c = document.createElement('canvas')
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale)
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
        resolve(file.type === 'image/jpeg' ? c.toDataURL('image/jpeg', 0.9) : c.toDataURL('image/png'))
      }
      img.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

export async function stickerAdd(file: File, name: string, tags: string[]): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/gallery`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: await stickerDataUrl(file), name: `表情包·${name}`, by: 'user' }),
    })
    if (!r.ok) return false
    const d = await r.json()
    const it = d.item ?? d.items?.[0]
    if (!it) return false
    return await colAdd('stickers', { name, url: galleryUrl(it.id, it.ext), tags, by: 'user' })
  } catch { return false }
}

export async function stickerList(): Promise<Sticker[]> {
  return (await colList('stickers'))
    .filter((it) => typeof it.name === 'string' && typeof it.url === 'string')
    .map((it) => ({ id: it.id, name: String(it.name), url: String(it.url), tags: Array.isArray(it.tags) ? it.tags.map(String) : [], by: it.by }))
}

export async function createRoom(title: string, agent: 'claude' | 'codex' = 'claude') {
  try {
    const r = await fetch(`${BASE}/rooms`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, agent }),
    })
    return r.ok
  } catch { return false }
}
export async function patchRoom(id: string, body: Record<string, unknown>) {
  try {
    const r = await fetch(`${BASE}/rooms/${encodeURIComponent(id)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })
    return r.ok
  } catch { return false }
}
export async function deleteRoom(id: string) {
  try {
    const r = await fetch(`${BASE}/rooms/${encodeURIComponent(id)}`, { method: 'DELETE' })
    return r.ok
  } catch { return false }
}

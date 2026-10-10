import AvatarManager from './AvatarManager'
import { AsrCard, CallPrefsCard, LinkCards, DrawCard, SessionCards } from './IntegrationCards'
import IdentityEditor from './IdentityEditor'
import { aiAvatar, userAvatar, userName } from '../lib/identity'
import { useEffect, useState, type ReactNode } from 'react'
import { fetchStatus, clearHistory, fetchApiProviders, saveApiProvider, fetchVoiceSettings, saveVoiceSettings, ttsBlob, stickerList,
  fetchRooms, patchRoom, getRoom, type PermissionMode, type ApiProvider, type VoiceProvider, type VoiceSettings, type Status, type Room, type RateLimit } from '../lib/api'
import { ChatAppearanceEditor } from '../pages/ChatAppearance'
import { playBlob, unlockAudio } from '../lib/voice'
import StickerManager, { STICKERS_UPDATED } from './StickerManager'
import WallpaperEditor from './WallpaperEditor'
import SkinPicker from '../skin/SkinPicker'

const THEME = 'perigee.theme'
export function applyTheme(t: string) {
  const valid = t === 'salt' || t === 'jade' ? t : ''
  document.documentElement.dataset.theme = valid
  document.documentElement.style.colorScheme = 'light'
  localStorage.setItem(THEME, valid || 'paper')
}
export const bootTheme = () => applyTheme('paper')

const AVATARS = 'perigee.avatars'
export const avatarsOn = () => (localStorage.getItem(AVATARS) ?? '1') === '1'
const VOICE_TEXT_HIDDEN = 'perigee.voiceTextHidden'
export const voiceTextHidden = () => localStorage.getItem(VOICE_TEXT_HIDDEN) === '1'
export const PREFS_CHANGED = 'perigee:prefs'
const setPref = (k: string, v: boolean) => {
  try { localStorage.setItem(k, v ? '1' : '0') } catch { /* 存不下本次照样生效 */ }
  window.dispatchEvent(new Event(PREFS_CHANGED))
}

type VoiceDraft = VoiceSettings & { apiKey: string; mosiApiKey: string }
const EMPTY_VOICE: VoiceDraft = {
  provider: 'edge', configured: false, apiKey: '', mosiApiKey: '', voiceId: '', model: 'eleven_multilingual_v2',
  mosiVoiceId: '', tempo: 1.15, edgeVoice: 'zh-CN-YunxiNeural',
}

const VOICE_NAME: Record<VoiceProvider, string> = { elevenlabs: 'ElevenLabs', mosi: 'MOSI', edge: 'Edge' }

const PERM_MODES: [PermissionMode, string][] = [
  ['default', '每步询问'], ['acceptEdits', '改文件自动、其他询问'], ['plan', '只读规划'], ['bypassPermissions', '全放行（危险）'],
]
type Page = 'look' | 'stickers' | 'now' | 'perm' | 'api' | 'voice' | 'link' | 'session' | 'danger'

const Glyph = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]">
    <path d={d} />
  </svg>
)
const GLYPH: Record<Page, string> = {
  look: 'M12 3a9 9 0 100 18c1 0 1.5-.8 1.5-1.6 0-.9-.7-1.4-.7-2.3 0-1 .8-1.6 1.8-1.6H17a4 4 0 004-4c0-4.7-4-8.5-9-8.5zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01',
  session: 'M4 5h16v11H8l-4 4zM8 9h8M8 12h5',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  perm: 'M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3zM9 12l2 2 4-4',
  stickers: 'M20 12.5V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2h6.5M20 12.5L12.5 20M20 12.5h-5.5a2 2 0 00-2 2V20M9 9.5h.01M14 9.5h.01M8.5 13.5a4 4 0 003.5 1.5',
  now: 'M12 20a8 8 0 118-8M12 12l5-3',
  api: 'M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  voice: 'M9 4a3 3 0 016 0v6a3 3 0 01-6 0zM5 11a7 7 0 0014 0M12 18v3',
  danger: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
}

function Row({ page, title, sub, badge, onOpen }: { page: Page; title: string; sub: string; badge?: string; onOpen: (p: Page) => void }) {
  return (
    <button onClick={() => onOpen(page)} className="flex w-full items-center gap-4 py-4 text-left active:opacity-60">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[16px] bg-[var(--color-card)] text-[color:var(--color-ink)]">
        <Glyph d={GLYPH[page]} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <b className="flex-1 truncate text-[17px] font-semibold tracking-tight">{title}</b>
          {badge && (
            <span className="shrink-0 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-0.5
                             text-[11.5px] text-[color:var(--color-ink-2)]">{badge}</span>
          )}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-[color:var(--color-ink-3)]">{sub}</span>
      </span>
      <span className="shrink-0 text-[20px] leading-none text-[color:var(--color-ink-3)]">›</span>
    </button>
  )
}

function Sub({ title, onBack, children }: { title: string; onBack: () => void; children: ReactNode }) {
  return (
    <section className="absolute inset-0 overflow-y-auto px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <button onClick={onBack} className="loop-back mb-3 text-[length:var(--text-sub)] text-[color:var(--color-ink-2)]">‹ 设置</button>
      <h2 className="mb-5 text-[20px] font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

export default function Settings({ onBack }: { onBack: () => void }) {
  const [page, setPage] = useState<Page | null>(null)
  const [st, setSt] = useState<Status | null>(null)
  const [rooms, setRooms] = useState<Room[]>([])
  const [lookRoom, setLookRoom] = useState(getRoom())
  useEffect(() => { void fetchRooms().then(({ rooms: list }) => setRooms(list)) }, [])
  const [avatars, setAvatars] = useState(avatarsOn())
  const [voiceHide, setVoiceHide] = useState(voiceTextHidden())
  const [stickerCount, setStickerCount] = useState<number | null>(null)
  const [providers, setProviders] = useState<ApiProvider[]>([])
  const [providerDrafts, setProviderDrafts] = useState<Record<string, { apiKey: string; baseUrl: string; models: string }>>({})
  const [providerSaving, setProviderSaving] = useState('')
  const [providerNote, setProviderNote] = useState('')
  const [voiceDraft, setVoiceDraft] = useState<VoiceDraft>(EMPTY_VOICE)
  const [voiceSaving, setVoiceSaving] = useState(false)
  const [voiceNote, setVoiceNote] = useState('')
  // 额度：设置开着就每 5 秒按当前房间重取一次（不只「此刻」那页）；切回这个页面、子页切换时也马上取
  useEffect(() => {
    const pull = () => void fetchStatus().then(setSt)
    pull()
    const t = setInterval(pull, 5000)
    const vis = () => { if (document.visibilityState === 'visible') pull() }
    document.addEventListener('visibilitychange', vis)
    window.addEventListener('focus', pull)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); window.removeEventListener('focus', pull) }
  }, [page])
  useEffect(() => {
    const count = () => void stickerList().then((l) => setStickerCount(l.length))
    count()
    window.addEventListener(STICKERS_UPDATED, count)
    return () => window.removeEventListener(STICKERS_UPDATED, count)
  }, [])
  useEffect(() => {
    void fetchApiProviders().then(({ providers: list }) => {
      setProviders(list)
      setProviderDrafts(Object.fromEntries(list.map((p) => [p.id, { apiKey: '', baseUrl: p.baseUrl, models: p.models.join(', ') }])))
    })
  }, [])
  useEffect(() => {
    void fetchVoiceSettings().then(({ voice }) => setVoiceDraft({ ...voice, apiKey: '', mosiApiKey: '' }))
  }, [])

  async function saveProvider(provider: ApiProvider, clearKey = false) {
    const draft = providerDrafts[provider.id]
    if (!draft) return
    setProviderSaving(provider.id); setProviderNote('')
    try {
      const { provider: saved } = await saveApiProvider(provider.id, {
        apiKey: draft.apiKey.trim() || undefined, baseUrl: draft.baseUrl.trim(),
        models: draft.models.split(/[,\n]/).map((value) => value.trim()).filter(Boolean), clearKey,
      })
      setProviders((all) => all.map((p) => p.id === saved.id ? saved : p))
      setProviderDrafts((all) => ({ ...all, [saved.id]: { apiKey: '', baseUrl: saved.baseUrl, models: saved.models.join(', ') } }))
      setProviderNote(clearKey ? `${provider.label} 的密钥已清除` : `${provider.label} 已保存`)
      window.dispatchEvent(new Event('perigee:providers-updated'))
    } catch (error) { setProviderNote(error instanceof Error ? error.message : '保存失败') }
    finally { setProviderSaving('') }
  }

  async function saveVoice(clearKey = false): Promise<boolean> {
    setVoiceSaving(true); setVoiceNote('')
    try {
      const { voice } = await saveVoiceSettings({
        provider: voiceDraft.provider, apiKey: voiceDraft.apiKey.trim() || undefined, mosiApiKey: voiceDraft.mosiApiKey.trim() || undefined,
        voiceId: voiceDraft.voiceId.trim(), model: voiceDraft.model,
        mosiVoiceId: voiceDraft.mosiVoiceId.trim(), tempo: voiceDraft.tempo,
        edgeVoice: voiceDraft.edgeVoice, clearKey,
      })
      setVoiceDraft({ ...voice, apiKey: '', mosiApiKey: '' })
      setVoiceNote(clearKey ? 'ElevenLabs Key 已清除' : '声音设置已保存')
      return true
    } catch (error) {
      setVoiceNote(error instanceof Error ? error.message : '保存失败')
      return false
    } finally { setVoiceSaving(false) }
  }

  async function testVoice() {
    unlockAudio()
    if (!await saveVoice()) return
    setVoiceNote('正在合成试听…')
    const blob = await ttsBlob(`${userName()}，我换好声音了。你听听看。`)
    if (!blob) { setVoiceNote('试听失败，请检查 Key、Voice ID 和额度'); return }
    setVoiceNote('正在播放试听')
    await playBlob(blob)
    setVoiceNote('试听完成')
  }

  const back = () => setPage(null)
  const configured = providers.filter((p) => p.configured).length
  const roomTitle = rooms.find((r) => r.id === getRoom())?.title ?? '当前房间'

  if (page === 'look') return (
    <Sub title="外观" onBack={back}>
      <SkinPicker />
      <IdentityEditor />
      <AvatarManager />
      <WallpaperEditor />
      <p className="mb-2 text-[11px] text-[color:var(--color-ink-3)]">聊天房间 · 气泡与背景按房间独立保存</p>
      {rooms.length > 1 && (
        <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
          {rooms.map((r) => (
            <button key={r.id} onClick={() => setLookRoom(r.id)}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px]
                ${lookRoom === r.id ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[color:var(--color-surface)]'
                                    : 'border-[var(--color-line)] bg-[var(--color-surface)]'}`}>
              {r.title}
            </button>
          ))}
        </div>
      )}
      <div className="mb-5"><ChatAppearanceEditor roomId={lookRoom} /></div>

      <div className="mb-5 flex items-center justify-between rounded-[var(--radius-md)] border
                      border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        <div className="flex items-center gap-2.5">
          <img src={userAvatar()} alt="" className="h-8 w-8 rounded-full object-cover" />
          <img src={aiAvatar()} alt="" className="-ml-4 h-8 w-8 rounded-full object-cover
                                                          ring-2 ring-[var(--color-surface)]" />
          <span className="ml-1 text-[length:var(--text-sub)]">聊天里显示头像</span>
        </div>
        <button onClick={() => { const v = !avatars; setAvatars(v); setPref(AVATARS, v) }}
          className={`h-[26px] w-[46px] rounded-full transition-colors
            ${avatars ? 'bg-[var(--color-ink)]' : 'bg-[var(--color-ink-4)]'}`}>
          <span className={`block h-[22px] w-[22px] rounded-full bg-[var(--color-surface)] transition-transform
            ${avatars ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
        </button>
      </div>
      <div className="mb-5 flex items-center justify-between rounded-[var(--radius-md)] border
                      border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
        <div className="min-w-0 pr-3">
          <span className="block text-[length:var(--text-sub)]">语音条只显示语音，不显示文字</span>
          <span className="mt-0.5 block text-[11px] text-[color:var(--color-ink-3)]">开着时文字默认收起，点语音条下面的小字能展开</span>
        </div>
        <button role="switch" aria-checked={voiceHide} onClick={() => { const v = !voiceHide; setVoiceHide(v); setPref(VOICE_TEXT_HIDDEN, v) }}
          className={`h-[26px] w-[46px] shrink-0 rounded-full transition-colors
            ${voiceHide ? 'bg-[var(--color-ink)]' : 'bg-[var(--color-ink-4)]'}`}>
          <span className={`block h-[22px] w-[22px] rounded-full bg-[var(--color-surface)] transition-transform
            ${voiceHide ? 'translate-x-[22px]' : 'translate-x-[2px]'}`} />
        </button>
      </div>

    </Sub>
  )

  if (page === 'stickers') return (
    <Sub title="表情包" onBack={back}>
      <StickerManager />
    </Sub>
  )

  if (page === 'now') return (
    <Sub title="此刻" onBack={back}>
      <div className="mb-2 px-1 text-[11px] text-[color:var(--color-ink-3)]">{roomTitle}</div>
      <QuotaCard rl={st?.rate_limit ?? null} />
    </Sub>
  )

  if (page === 'api') return (
    <Sub title="通道与 API" onBack={back}>
      <p className="mb-3 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">
        Claude 订阅和 Codex 使用服务器登录，不需要 Key。这里统一管理 OpenRouter、DeepSeek 和 OpenAI；已保存的 Key 不会回显。
      </p>
      <div className="mb-5 space-y-3">
        {providers.map((provider) => { const draft = providerDrafts[provider.id]; return draft ? (
          <div key={provider.id} className="rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <b className="text-[13px]">{provider.label}</b>
              <span className="text-[10px] text-[color:var(--color-ink-3)]">{provider.configured ? '已配置' : '未配置'}</span>
            </div>
            <label className="mb-2 block text-[10px] text-[color:var(--color-ink-3)]">API Key</label>
            <input type="password" autoComplete="new-password" value={draft.apiKey}
              onChange={(e) => setProviderDrafts((all) => ({ ...all, [provider.id]: { ...draft, apiKey: e.target.value } }))}
              placeholder={provider.configured ? '••••••••（留空保持不变）' : '粘贴 API Key'}
              className="mb-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-[12px] outline-none" />
            <label className="mb-2 block text-[10px] text-[color:var(--color-ink-3)]">Base URL</label>
            <input value={draft.baseUrl}
              onChange={(e) => setProviderDrafts((all) => ({ ...all, [provider.id]: { ...draft, baseUrl: e.target.value } }))}
              className="mb-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 font-mono text-[11px] outline-none" />
            <label className="mb-2 block text-[10px] text-[color:var(--color-ink-3)]">模型列表（逗号或换行分隔）</label>
            <input value={draft.models}
              onChange={(e) => setProviderDrafts((all) => ({ ...all, [provider.id]: { ...draft, models: e.target.value } }))}
              className="mb-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 font-mono text-[11px] outline-none" />
            <div className="flex gap-2">
              <button disabled={providerSaving === provider.id} onClick={() => void saveProvider(provider)}
                className="flex-1 rounded-full bg-[var(--color-ink)] py-2 text-[11px] text-[color:var(--color-surface)] disabled:opacity-40">
                {providerSaving === provider.id ? '保存中…' : '保存'}
              </button>
              {provider.configured && <button disabled={providerSaving === provider.id} onClick={() => { if (confirm(`清除 ${provider.label} 的 API Key？`)) void saveProvider(provider, true) }}
                className="rounded-full border border-[var(--color-line)] px-4 py-2 text-[11px] disabled:opacity-40">清除 Key</button>}
            </div>
          </div>
        ) : null })}
        {providerNote && <p className="px-1 text-[11px] text-[color:var(--color-ink-2)]">{providerNote}</p>}
      </div>
    </Sub>
  )

  if (page === 'voice') return (
    <Sub title="语音与通话" onBack={back}>
      <p className="mb-3 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">
        声音（TTS）：Claude 的语音条、朗读和通话共用这里的声音；Edge 免费不用 Key。所有 API Key 只保存在服务器，不会回显到浏览器。
      </p>
      <div className="mb-5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <div className="mb-4 grid grid-cols-3 gap-1 rounded-[var(--radius-sm)] bg-[var(--color-card)] p-1">
          {(Object.entries(VOICE_NAME) as [VoiceProvider, string][]).map(([id, label]) => (
            <button key={id} type="button" onClick={() => setVoiceDraft((v) => ({ ...v, provider: id }))}
              className={`rounded-[var(--radius-xs)] px-1 py-2 text-[10px] ${voiceDraft.provider === id ? 'bg-[var(--color-ink)] text-[color:var(--color-surface)]' : ''}`}>
              {label}
            </button>
          ))}
        </div>

        {voiceDraft.provider === 'elevenlabs' && <>
          <div className="mb-3 flex items-center justify-between">
            <b className="text-[13px]">ElevenLabs</b>
            <span className="text-[10px] text-[color:var(--color-ink-3)]">{voiceDraft.configured ? 'Key 已配置' : 'Key 未配置'}</span>
          </div>
          <label className="mb-2 block text-[10px] text-[color:var(--color-ink-3)]">API Key</label>
          <input type="password" autoComplete="new-password" value={voiceDraft.apiKey}
            onChange={(e) => setVoiceDraft((v) => ({ ...v, apiKey: e.target.value }))}
            placeholder={voiceDraft.configured ? '••••••••（留空保持不变）' : '粘贴 ElevenLabs API Key'}
            className="mb-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-[12px] outline-none" />
          <label className="mb-2 block text-[10px] text-[color:var(--color-ink-3)]">Voice ID</label>
          <input value={voiceDraft.voiceId} onChange={(e) => setVoiceDraft((v) => ({ ...v, voiceId: e.target.value }))}
            placeholder="ElevenLabs 里的 Voice ID"
            className="mb-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 font-mono text-[11px] outline-none" />
          <label className="mb-2 block text-[10px] text-[color:var(--color-ink-3)]">模型</label>
          <select value={voiceDraft.model} onChange={(e) => setVoiceDraft((v) => ({ ...v, model: e.target.value }))}
            className="mb-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-[11px] outline-none">
            <option value="eleven_v4_turbo">Eleven v4 Turbo · 快+感情+半价</option>
            <option value="eleven_v4">Eleven v4 · 最新旗舰</option>
            <option value="eleven_multilingual_v2">Multilingual v2 · 稳定多语</option>
            <option value="eleven_v3">Eleven v3 · 表达力</option>
            <option value="eleven_flash_v2_5">Flash v2.5 · 低延迟</option>
          </select>
        </>}

        {voiceDraft.provider === 'mosi' && <>
          <div className="mb-3 flex items-center justify-between">
            <b className="text-[13px]">MOSI</b>
            <span className="text-[10px] text-[color:var(--color-ink-3)]">{voiceDraft.mosiConfigured ? 'Key 已配置' : 'Key 未配置'}</span>
          </div>
          <label className="mb-2 block text-[10px] text-[color:var(--color-ink-3)]">API Key</label>
          <input type="password" autoComplete="new-password" value={voiceDraft.mosiApiKey}
            onChange={(e) => setVoiceDraft((v) => ({ ...v, mosiApiKey: e.target.value }))}
            placeholder={voiceDraft.mosiConfigured ? '••••••••（留空保持不变）' : '粘贴 MOSI API Key'}
            className="mb-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-[12px] outline-none" />
          <label className="mb-2 block text-[10px] text-[color:var(--color-ink-3)]">MOSI Voice ID</label>
          <input value={voiceDraft.mosiVoiceId} onChange={(e) => setVoiceDraft((v) => ({ ...v, mosiVoiceId: e.target.value }))}
            className="mb-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 font-mono text-[11px] outline-none" />
          <label className="mb-2 flex items-center justify-between text-[10px] text-[color:var(--color-ink-3)]"><span>语速</span><span>{voiceDraft.tempo.toFixed(2)}×</span></label>
          <input type="range" min="0.8" max="1.4" step="0.05" value={voiceDraft.tempo}
            onChange={(e) => setVoiceDraft((v) => ({ ...v, tempo: Number(e.target.value) }))} className="mb-3 w-full" />
        </>}

        {voiceDraft.provider === 'edge' && <>
          <label className="mb-2 block text-[10px] text-[color:var(--color-ink-3)]">Edge 音色</label>
          <select value={voiceDraft.edgeVoice} onChange={(e) => setVoiceDraft((v) => ({ ...v, edgeVoice: e.target.value }))}
            className="mb-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-[11px] outline-none">
            <option value="zh-CN-YunxiNeural">云希</option><option value="zh-CN-YunjianNeural">云健</option>
            <option value="zh-CN-YunyangNeural">云扬</option><option value="zh-CN-YunxiaNeural">云夏</option>
            <option value="zh-CN-XiaoxiaoNeural">晓晓</option><option value="zh-CN-XiaoyiNeural">晓伊</option>
          </select>
        </>}

        <div className="flex gap-2">
          <button disabled={voiceSaving} onClick={() => void saveVoice()}
            className="flex-1 rounded-full bg-[var(--color-ink)] py-2 text-[11px] text-[color:var(--color-surface)] disabled:opacity-40">
            {voiceSaving ? '保存中…' : '保存'}
          </button>
          <button disabled={voiceSaving} onClick={() => void testVoice()}
            className="rounded-full border border-[var(--color-line)] px-4 py-2 text-[11px] disabled:opacity-40">试听</button>
          {voiceDraft.configured && <button disabled={voiceSaving} onClick={() => { if (confirm('清除 ElevenLabs API Key？')) void saveVoice(true) }}
            className="rounded-full border border-[var(--color-line)] px-3 py-2 text-[11px] disabled:opacity-40">清 Key</button>}
        </div>
        {voiceNote && <p className="mt-3 text-[11px] text-[color:var(--color-ink-2)]">{voiceNote}</p>}
      </div>
      <AsrCard />
      <CallPrefsCard />
    </Sub>
  )

  if (page === 'session') return (
    <Sub title="Claude 会话" onBack={back}>
      <SessionCards />
    </Sub>
  )

  if (page === 'link') return (
    <Sub title="生图 · 推送 · 群聊" onBack={back}>
      <DrawCard />
      <LinkCards />
    </Sub>
  )

  if (page === 'perm') return (
    <Sub title="权限" onBack={back}>
      <p className="mb-3 text-[11.5px] leading-relaxed text-[color:var(--color-ink-3)]">
        Claude 用工具（改文件、跑命令…）前要不要先问你。每个房间单独设置，改了从下一条消息起生效、会话接着续。
        群聊里没法审批，不是「全放行」的成员要用工具时会被自动拒绝。
      </p>
      {rooms.filter((r) => r.type === 'direct' && r.agent !== 'codex').map((r) => (
        <div key={r.id} className="mb-2.5 flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-4 py-3">
          <span className="min-w-0 truncate text-[length:var(--text-sub)]">{r.title}</span>
          <select value={r.permission_mode || 'default'}
            onChange={async (e) => {
              const v = e.target.value as PermissionMode
              setRooms((list) => list.map((x) => x.id === r.id ? { ...x, permission_mode: v } : x))
              await patchRoom(r.id, { permission_mode: v })
            }}
            className="shrink-0 rounded-full border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-1.5 text-[12.5px]">
            {PERM_MODES.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
        </div>
      ))}
    </Sub>
  )

  if (page === 'danger') return (
    <Sub title="危险" onBack={back}>
      <button onClick={async () => { if (confirm(`清空「${roomTitle}」的聊天记录？这个不可逆。`)) { await clearHistory(); location.reload() } }}
        className="w-full rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] py-3">
        清空「{roomTitle}」的聊天记录
      </button>
      <p className="mt-2 text-center text-[11px] text-[color:var(--color-ink-3)]">只清当前所在的房间，别的房间不动</p>
    </Sub>
  )

  return (
    <section className="absolute inset-0 overflow-y-auto px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <button onClick={onBack} className="loop-back mb-3 text-[length:var(--text-sub)] text-[color:var(--color-ink-2)]">‹ 返回</button>
      <h2 className="mb-4 text-center text-[20px] font-bold tracking-tight">设置</h2>
      <div className="rounded-[var(--radius-lg)] bg-[var(--color-surface)] px-4">
      <Row page="look" onOpen={setPage} title="外观" sub="风格 · 全屋壁纸 · 气泡颜色 · 聊天背景 · 头像" />
      <Row page="stickers" onOpen={setPage} title="表情包" sub="你和 Claude 共用的表情包库：上传、改名字、加标签"
        badge={stickerCount === null ? undefined : stickerCount ? `${stickerCount} 张` : '空'} />
      <Row page="now" onOpen={setPage} title="此刻" sub="额度" />
      <Row page="session" onOpen={setPage} title="Claude 会话" sub="名字 · 时区 · 默认权限 · 自动换窗 · 缓存保活" />
      <Row page="perm" onOpen={setPage} title="权限" sub="每个房间：每步询问 / 改文件前问 / 只读规划 / 全放行" />
      <Row page="api" onOpen={setPage} title="通道与 API" sub="OpenRouter、DeepSeek、OpenAI、Claude 官方 API 的 Key 和模型列表"
        badge={providers.length ? `${configured} 家已配置` : undefined} />
      <Row page="voice" onOpen={setPage} title="语音与通话" sub="声音（TTS）· 语音识别 · 通话"
        badge={VOICE_NAME[voiceDraft.provider]} />
      <Row page="link" onOpen={setPage} title="生图 · 推送 · 群聊" sub="生图服务 · Bark 推送 · mousecrew 群聊后端" />
      <Row page="danger" onOpen={setPage} title="危险" sub="清空当前房间的聊天记录" />
      </div>
    </section>
  )
}

function QuotaCard({ rl }: { rl: RateLimit | null }) {
  const when = (sec?: number) => {
    if (!sec) return ''
    const d = new Date(sec * 1000), now = new Date()
    const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000)
    return days === 0 ? `今天 ${hm}` : days === 1 ? `明天 ${hm}` : `周${'日一二三四五六'[d.getDay()]} ${hm}`
  }
  const rows: { label: string; w?: { utilization?: number; resetsAt?: number } }[] = [
    { label: '五小时', w: rl?.unifiedWindows?.five_hour },
    { label: '本周', w: rl?.unifiedWindows?.seven_day },
  ]
  const seen = rl?.seen_at ? new Date(rl.seen_at) : null
  return (
    <div className="mb-5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <b className="text-[13px]">额度</b>
        <span className="text-[10.5px] text-[color:var(--color-ink-3)]">
          {seen ? `${String(seen.getHours()).padStart(2, '0')}:${String(seen.getMinutes()).padStart(2, '0')} 更新 · 所有房间共用` : '聊一句之后就有'}
        </span>
      </div>
      {rows.map(({ label, w }) => {
        const pct = Math.round((w?.utilization ?? 0) * 100)
        return (
          <div key={label} className="mb-3 last:mb-0">
            <div className="mb-1.5 flex items-baseline justify-between text-[length:var(--text-sub)]">
              <span>{label}</span>
              <span className="tabular-nums">{w ? `已用 ${pct}%` : '—'}</span>
            </div>
            <div className="h-[6px] overflow-hidden rounded-full bg-[var(--color-line)]">
              <div className="h-full rounded-full bg-[var(--color-ink)] transition-[width] duration-500" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            {w?.resetsAt && <div className="mt-1 text-[11px] text-[color:var(--color-ink-3)]">{when(w.resetsAt)} 重置</div>}
          </div>
        )
      })}
      {rl?.status === 'rejected' && <p className="mt-2 text-[11.5px] text-[color:var(--color-ink-2)]">额度用完了，等上面的时间重置。</p>}
    </div>
  )
}

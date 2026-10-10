import { API_BASE } from '../lib/config'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fetchChannels, fetchRooms, fetchStatus, getRoom, type ChannelItem } from '../lib/api'

const KEY = 'perigee.model'
export const getModel = () => localStorage.getItem(KEY) || ''
export const setModel = (id: string) => localStorage.setItem(KEY, id)
const CHANNEL_KEY = 'perigee.channel'
export const getChannel = () => localStorage.getItem(CHANNEL_KEY) || 'claude-subscription'
export const setChannel = (id: string) => localStorage.setItem(CHANNEL_KEY, id)

export default function ModelPicker() {
  const [channels, setChannels] = useState<ChannelItem[]>([])
  const [cur, setCur] = useState(getChannel())
  const [model, setCurrentModel] = useState(getModel())
  /* live：当前房间服务端实际记录的通道。 */
  const [live, setLive] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) { setPos(null); return }
    const place = () => {
      const r = box.current?.getBoundingClientRect()
      if (r) setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - 246)), top: r.bottom + 4 })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true) }
  }, [open])

  useEffect(() => {
    const refresh = () => void fetchChannels().then(({ default: def, channels: items }) => {
      setChannels(items)
      if (!localStorage.getItem(CHANNEL_KEY) && def) { setChannel(def); setCur(def) }
      const selected = items.find((item) => item.id === getChannel())
      if (selected && !selected.models.some((item) => item.id === getModel()) && selected.models[0]) {
        setModel(selected.models[0].id); setCurrentModel(selected.models[0].id)
      }
    })
    refresh()
    window.addEventListener('perigee:providers-updated', refresh)
    /* 显示以服务端为准：每个房间各自记住选择，互不串台。 */
    void fetchRooms().then(({ rooms }) => {
      const mine = rooms.find((r) => r.id === getRoom())
      if (mine?.channel) {
        setCur(mine.channel); setChannel(mine.channel)
        const savedModel = mine.selected_model || mine.model
        if (savedModel) { setModel(savedModel); setCurrentModel(savedModel) }
      }
    })
    void fetchStatus().then((s) => { if (s?.channel) setLive(s.channel) })
    return () => window.removeEventListener('perigee:providers-updated', refresh)
  }, [])
  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => {
      const t = e.target as Node
      if (!document.contains(t)) return
      if (!box.current?.contains(t) && !panel.current?.contains(t)) setOpen(false)
    }
    document.addEventListener('click', away)
    return () => document.removeEventListener('click', away)
  }, [open])

  const selectedChannel = channels.find((i) => i.id === cur)
  const selectedModel = selectedChannel?.models.find((item) => item.id === model)
  const shortChannel = ({ 'claude-subscription': 'Claude', 'claude-api': 'API', 'claude-openrouter': 'OR', codex: 'Codex', deepseek: 'DeepSeek', chatgpt: 'ChatGPT' } as Record<string, string>)[cur] || 'Claude'
  const label = selectedModel ? `${shortChannel} · ${selectedModel.label}` : shortChannel

  /** 选完把房间的 model 也 PATCH 掉，并以服务端回执为准——存不上就退回去，不给"看着切了"的假象 */
  async function pick(channelId: string, modelId: string) {
    const prev = cur, prevModel = model
    const item = channels.find((entry) => entry.id === channelId)
    if (!item?.available) return
    setChannel(channelId); setCur(channelId); setModel(modelId); setCurrentModel(modelId); setOpen(false)
    try {
      const r = await fetch(`${API_BASE}/rooms/${encodeURIComponent(getRoom())}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel: channelId, model: modelId }),
      })
      if (!r.ok) throw new Error(String(r.status))
      const saved = (await r.json().catch(() => null))?.room?.channel
      if (saved && saved !== channelId) { setChannel(saved); setCur(saved) }
      setLive(saved || channelId)
    } catch {
      setChannel(prev); setCur(prev); setModel(prevModel); setCurrentModel(prevModel)
    }
  }

  return (
    <div ref={box} className="relative">
      {/* .model-chip：2.5px 8px · 圆角 99 · 11px */}
      <button onClick={(e) => { e.stopPropagation(); setOpen((v) => !v) }}
        className="inline-flex items-center gap-1 rounded-full border border-[var(--color-line)]
                   bg-[var(--color-card)] px-2 py-[2.5px] text-[11px] text-[color:var(--color-ink-2)]">
        <span className="max-w-[170px] truncate">{label}</span>
        {live && cur && live !== cur && (
          <i title={`当前仍在跑上一个模型，下一条消息生效`}
             className="not-italic text-[8px] leading-none text-[color:var(--color-ink-3)]">•</i>
        )}
        <i className="not-italic text-[7px] opacity-80">▾</i>
      </button>

      {/* .model-panel：width 238 · max-height min(62vh,480) · padding 8 · 圆角 r-md */}
      {open && pos && createPortal(
        <div ref={panel} className="fixed z-[118] w-[238px] overflow-auto rounded-[var(--radius-md)]
                        border border-[var(--color-line)] bg-[var(--color-surface)] p-2 text-[color:var(--color-ink)] shadow-[0_10px_40px_rgba(0,0,0,.14)]"
             style={{ left: pos.left, top: pos.top, maxHeight: 'min(62vh, 480px)' }}>
          {channels.map((channel) => (
            <div key={channel.id} className={!channel.available ? 'opacity-40' : ''}>
              <div className="flex items-center justify-between px-[9px] pb-[3px] pt-2 text-[8px] uppercase tracking-[.16em] text-[color:var(--color-ink-3)]">
                <span>{channel.label}</span><span className="normal-case tracking-normal">{channel.available ? channel.note : '未配置'}</span>
              </div>
              {channel.models.map((item) => (
                <button key={`${channel.id}:${item.id}`} onClick={() => void pick(channel.id, item.id)} disabled={!channel.available}
                  className={`flex w-full items-baseline justify-between gap-2 rounded-[var(--radius-xs)] px-2.5 py-2 text-left
                    ${channel.id === cur && item.id === model ? 'bg-[var(--color-card)]' : ''} ${!channel.available ? 'cursor-not-allowed' : ''}`}>
                  <span className="min-w-0 truncate text-[12px]">{item.label}</span>
                  <small className="whitespace-nowrap text-[8px] text-[color:var(--color-ink-3)]">{item.note || ''}</small>
                </button>
              ))}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

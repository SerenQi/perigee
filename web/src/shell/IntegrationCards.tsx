import { useEffect, useState } from 'react'
import { fetchIntegrations, saveIntegrations, type Integrations, type AsrProvider, type DrawProvider } from '../lib/api'
import { getIdentity } from '../lib/identity'
import { callPrefs, setCallPrefs, type CallPrefs } from '../lib/voice'

/* 设置里"需要人来配"的卡片：Claude 会话、语音识别、通话偏好、生图、Bark 推送、mousecrew 群聊后端。
   服务器那份存在 gateway 的 DATA_DIR/settings.json；key / token 只进不出，浏览器里只看得到"已配置/未配置"。 */

const card = 'mb-5 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4'
const input = 'mb-3 w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)] px-3 py-2 text-[12px] outline-none'
const label = 'mb-1.5 block text-[10px] text-[color:var(--color-ink-3)]'
const btn = 'rounded-full bg-[var(--color-ink)] px-4 py-2 text-[11px] text-[color:var(--color-surface)] disabled:opacity-40'
const ghost = 'rounded-full border border-[var(--color-line)] px-3 py-2 text-[11px] disabled:opacity-40'

function useIntegrations() {
  const [data, setData] = useState<Integrations | null>(null)
  useEffect(() => { void fetchIntegrations().then(setData) }, [])
  return [data, setData] as const
}

const ASR_NAME: Record<AsrProvider, string> = { off: '关', url: '自建服务', openai: 'OpenAI 兼容', gemini: 'Gemini' }

/** 语音识别：语音条转文字、通话里听你说话都靠它 */
export function AsrCard() {
  const [data, setData] = useIntegrations()
  const [draft, setDraft] = useState({ provider: 'off' as AsrProvider, url: '', baseUrl: '', model: '', tone: true, apiKey: '' })
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (data) setDraft({ ...data.asr, tone: data.asr.provider === 'gemini' ? data.asr.tone : true, apiKey: '' }) }, [data])
  async function save(clearKey = false) {
    setBusy(true); setNote('')
    try {
      const d = await saveIntegrations({ asr: { ...draft, apiKey: draft.apiKey.trim() || undefined, clearKey } })
      setData(d); setNote(clearKey ? 'Key 已清除' : '已保存')
    } catch (e) { setNote(e instanceof Error ? e.message : '保存失败') } finally { setBusy(false) }
  }
  const p = draft.provider
  return (
    <div className={card}>
      <div className="mb-1 flex items-center justify-between">
        <b className="text-[13px]">语音识别</b>
        {p !== 'off' && p !== 'url' && <span className="text-[10px] text-[color:var(--color-ink-3)]">{data?.asr.configured ? 'Key 已配置' : 'Key 未配置'}</span>}
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">
        用途：把你发的语音条、通话里说的话转成文字交给 Claude。Gemini 可听语气和环境音：把这段话听起来的情绪（笑声、叹气、鼻音、哽咽…）和背景里明显的环境声（下雨、车流、音乐…）附给 Claude 的下一轮（只给它感受，不进聊天记录）。
      </p>
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-[var(--radius-sm)] bg-[var(--color-card)] p-1">
        {(Object.keys(ASR_NAME) as AsrProvider[]).map((k) => (
          <button key={k} type="button" onClick={() => setDraft((v) => ({ ...v, provider: k }))}
            className={`rounded-[var(--radius-xs)] px-1 py-2 text-[10px] ${p === k ? 'bg-[var(--color-ink)] text-[color:var(--color-surface)]' : ''}`}>{ASR_NAME[k]}</button>
        ))}
      </div>
      {p === 'url' && <>
        <label className={label}>识别服务地址（POST 原始音频字节，返回 {'{"text": "..."}'}，比如自建 faster-whisper）</label>
        <input className={input} value={draft.url} placeholder="http://127.0.0.1:3004/asr" onChange={(e) => setDraft((v) => ({ ...v, url: e.target.value }))} />
      </>}
      {(p === 'openai' || p === 'gemini') && <>
        <label className={label}>{p === 'gemini' ? 'Gemini API Key（Google AI Studio）' : 'API Key'}</label>
        <input className={input} type="password" autoComplete="new-password" value={draft.apiKey}
          placeholder={data?.asr.configured ? '••••••••（留空保持不变）' : '粘贴 API Key'} onChange={(e) => setDraft((v) => ({ ...v, apiKey: e.target.value }))} />
        {p === 'openai' && <>
          <label className={label}>Base URL（可空，默认 https://api.openai.com/v1；兼容 OpenAI 的服务都行）</label>
          <input className={input} value={draft.baseUrl} placeholder="https://api.openai.com/v1" onChange={(e) => setDraft((v) => ({ ...v, baseUrl: e.target.value }))} />
        </>}
        <label className={label}>模型（可空，默认 {p === 'gemini' ? 'gemini-2.5-flash' : 'whisper-1'}）</label>
        <input className={input} value={draft.model} onChange={(e) => setDraft((v) => ({ ...v, model: e.target.value }))} />
        {p === 'gemini' && (
          <label className="mb-3 flex items-center gap-2 text-[12px]">
            <input type="checkbox" checked={draft.tone} onChange={(e) => setDraft((v) => ({ ...v, tone: e.target.checked }))} />
            听语气和环境音（附给 Claude）
          </label>
        )}
      </>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => void save()} className={`flex-1 ${btn}`}>{busy ? '保存中…' : '保存'}</button>
        {data?.asr.configured && <button disabled={busy} onClick={() => { if (confirm('清除语音识别的 API Key？')) void save(true) }} className={ghost}>清 Key</button>}
      </div>
      {note && <p className="mt-3 text-[11px] text-[color:var(--color-ink-2)]">{note}</p>}
    </div>
  )
}

/** 通话偏好：存在这台设备上 */
export function CallPrefsCard() {
  const [p, setP] = useState<CallPrefs>(callPrefs)
  const set = (patch: Partial<CallPrefs>) => { setCallPrefs(patch); setP(callPrefs()) }
  const seg = <K extends keyof CallPrefs>(k: K, opts: [CallPrefs[K], string][]) => (
    <div className="mb-3 grid gap-1 rounded-[var(--radius-sm)] bg-[var(--color-card)] p-1" style={{ gridTemplateColumns: `repeat(${opts.length}, 1fr)` }}>
      {opts.map(([v, t]) => (
        <button key={String(v)} type="button" onClick={() => set({ [k]: v } as Partial<CallPrefs>)}
          className={`rounded-[var(--radius-xs)] px-1 py-2 text-[10px] ${p[k] === v ? 'bg-[var(--color-ink)] text-[color:var(--color-surface)]' : ''}`}>{t}</button>
      ))}
    </div>
  )
  return (
    <div className={card}>
      <b className="mb-1 block text-[13px]">通话</b>
      <p className="mb-3 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">
        通话（聊天页右上角 ⋯ › 通话）用上面的声音念 Claude 的话、用语音识别听你说。下面这几项只存在这台设备上。
      </p>
      <label className={label}>收音灵敏度（总被杂音打断就调低，小声说话收不到就调高）</label>
      {seg('sensitivity', [['low', '低'], ['normal', '中'], ['high', '高']])}
      <label className={label}>停句等待（说完一句后等多久才算说完）</label>
      {seg('endpoint', [['fast', '短'], ['normal', '中'], ['slow', '长']])}
      <label className={label}>安静多久后让 Claude 自己决定要不要开口</label>
      {seg('nudgeSec', [[0, '关'], [30, '30 秒'], [45, '45 秒'], [90, '90 秒']])}
    </div>
  )
}

/** Bark 推送 + mousecrew 群聊后端 */
export function LinkCards() {
  const [data, setData] = useIntegrations()
  const [bark, setBark] = useState('')
  const [mc, setMc] = useState({ url: '', token: '' })
  const [note, setNote] = useState('')
  useEffect(() => { if (data) setMc({ url: data.mousecrew.url, token: '' }) }, [data])
  async function save(body: Record<string, unknown>, ok: string) {
    setNote('')
    try { setData(await saveIntegrations(body)); setBark(''); setMc((m) => ({ ...m, token: '' })); setNote(ok) }
    catch (e) { setNote(e instanceof Error ? e.message : '保存失败') }
  }
  return (
    <>
      <div className={card}>
        <div className="mb-1 flex items-center justify-between">
          <b className="text-[13px]">Bark 推送（iOS）</b>
          <span className="text-[10px] text-[color:var(--color-ink-3)]">{data?.bark.configured ? '已配置' : '未配置'}</span>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">用途：Claude 回完话推一条到你手机（没开网页也收得到）。地址里带着你的设备 key，所以只存服务器。</p>
        <input className={input} type="password" autoComplete="new-password" value={bark} onChange={(e) => setBark(e.target.value)}
          placeholder={data?.bark.configured ? '••••••••（留空保持不变）' : 'https://api.day.app/你的设备key'} />
        <div className="flex gap-2">
          <button onClick={() => void save({ bark: { url: bark.trim() } }, 'Bark 已保存')} disabled={!bark.trim()} className={`flex-1 ${btn}`}>保存</button>
          {data?.bark.configured && <button onClick={() => void save({ bark: { push: !data.bark.push } }, data.bark.push ? '已暂停推送' : '已恢复推送')} className={ghost}>{data.bark.push ? '暂停' : '恢复'}</button>}
          {data?.bark.configured && <button onClick={() => { if (confirm('清掉 Bark 地址？')) void save({ bark: { clear: true } }, 'Bark 地址已清除') }} className={ghost}>清除</button>}
        </div>
        {data?.bark.configured && !data.bark.push && <p className="mt-2 text-[11px] text-[color:var(--color-ink-3)]">推送已暂停（地址还留着）。</p>}
      </div>
      <div className={card}>
        <div className="mb-1 flex items-center justify-between">
          <b className="text-[13px]">mousecrew 群聊后端</b>
          <span className="text-[10px] text-[color:var(--color-ink-3)]">{data?.mousecrew.configured ? 'Token 已配置' : 'Token 未配置'}</span>
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">
          用途：群聊房间跑在 mousecrew 上；网关在"合并转发群聊记录"时要去它那里取记录。浏览器访问 mousecrew 走反向代理（前端 VITE_CREW_API_BASE），这里填的是网关在服务器上能访问到的地址。
        </p>
        <label className={label}>地址</label>
        <input className={input} value={mc.url} placeholder="http://127.0.0.1:8787" onChange={(e) => setMc((m) => ({ ...m, url: e.target.value }))} />
        <label className={label}>Token（可空）</label>
        <input className={input} type="password" autoComplete="new-password" value={mc.token}
          placeholder={data?.mousecrew.configured ? '••••••••（留空保持不变）' : 'mousecrew 的访问 token'} onChange={(e) => setMc((m) => ({ ...m, token: e.target.value }))} />
        <div className="flex gap-2">
          <button onClick={() => void save({ mousecrew: { url: mc.url.trim(), token: mc.token.trim() || undefined } }, 'mousecrew 已保存')} className={`flex-1 ${btn}`}>保存</button>
          {data?.mousecrew.configured && <button onClick={() => void save({ mousecrew: { clearToken: true } }, 'Token 已清除')} className={ghost}>清 Token</button>}
        </div>
      </div>
      {note && <p className="text-center text-[11px] text-[color:var(--color-ink-2)]">{note}</p>}
    </>
  )
}

const DRAW_NAME: Record<DrawProvider, string> = { off: '关', openai: 'OpenAI 兼容', openrouter: 'OpenRouter' }

/** 生图：Claude 用 bin/perigee-draw 画图，存进发件箱，再用 [[file:名字]] 递给你 */
export function DrawCard() {
  const [data, setData] = useIntegrations()
  const [d, setD] = useState({ provider: 'off' as DrawProvider, baseUrl: '', model: '', aspect: '1:1', quality: 'medium', apiKey: '' })
  const [note, setNote] = useState('')
  useEffect(() => { if (data) setD({ ...data.draw, apiKey: '' }) }, [data])
  async function save(clearKey = false) {
    setNote('')
    try { setData(await saveIntegrations({ draw: { ...d, apiKey: d.apiKey.trim() || undefined, clearKey } })); setNote(clearKey ? 'Key 已清除' : '已保存') }
    catch (e) { setNote(e instanceof Error ? e.message : '保存失败') }
  }
  return (
    <div className={card}>
      <div className="mb-1 flex items-center justify-between">
        <b className="text-[13px]">生图</b>
        {d.provider !== 'off' && <span className="text-[10px] text-[color:var(--color-ink-3)]">{data?.draw.configured ? 'Key 已配置' : 'Key 未配置'}</span>}
      </div>
      <p className="mb-3 text-[11px] leading-relaxed text-[color:var(--color-ink-3)]">
        用途：让 Claude 能画图。它在服务器上跑 <code>gateway/bin/perigee-draw "提示词" 名字.png</code>，图存进发件箱，回复里写 [[file:名字.png]] 你就能看到。不配就没有这个能力，别的都不受影响。按张计费，费用走你填的这家。
      </p>
      <div className="mb-3 grid grid-cols-3 gap-1 rounded-[var(--radius-sm)] bg-[var(--color-card)] p-1">
        {(Object.keys(DRAW_NAME) as DrawProvider[]).map((k) => (
          <button key={k} type="button" onClick={() => setD((v) => ({ ...v, provider: k }))}
            className={`rounded-[var(--radius-xs)] px-1 py-2 text-[10px] ${d.provider === k ? 'bg-[var(--color-ink)] text-[color:var(--color-surface)]' : ''}`}>{DRAW_NAME[k]}</button>
        ))}
      </div>
      {d.provider !== 'off' && <>
        <label className={label}>API Key</label>
        <input className={input} type="password" autoComplete="new-password" value={d.apiKey}
          placeholder={data?.draw.configured ? '••••••••（留空保持不变）' : '粘贴 API Key'} onChange={(e) => setD((v) => ({ ...v, apiKey: e.target.value }))} />
        <label className={label}>Base URL（可空，默认 {d.provider === 'openai' ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1'}）</label>
        <input className={input} value={d.baseUrl} onChange={(e) => setD((v) => ({ ...v, baseUrl: e.target.value }))} />
        <label className={label}>模型（{d.provider === 'openai' ? '可空，默认 gpt-image-1' : '必填，填 OpenRouter 上的生图模型 id'}）</label>
        <input className={input} value={d.model} onChange={(e) => setD((v) => ({ ...v, model: e.target.value }))} />
        <label className={label}>默认比例 / 质量（Claude 调用时可以另指定）</label>
        <div className="mb-3 flex gap-2">
          <select className={input + ' mb-0'} value={d.aspect} onChange={(e) => setD((v) => ({ ...v, aspect: e.target.value }))}>
            {['1:1', '3:4', '4:3', '9:16', '16:9'].map((x) => <option key={x}>{x}</option>)}
          </select>
          <select className={input + ' mb-0'} value={d.quality} onChange={(e) => setD((v) => ({ ...v, quality: e.target.value }))}>
            <option value="low">低</option><option value="medium">中</option><option value="high">高</option>
          </select>
        </div>
      </>}
      <div className="flex gap-2">
        <button onClick={() => void save()} className={`flex-1 ${btn}`}>保存</button>
        {data?.draw.configured && <button onClick={() => { if (confirm('清除生图的 API Key？')) void save(true) }} className={ghost}>清 Key</button>}
      </div>
      {note && <p className="mt-3 text-[11px] text-[color:var(--color-ink-2)]">{note}</p>}
    </div>
  )
}

/** Claude 会话：名字、时区、每轮附言、默认权限、自动换窗、缓存保活（存服务器，所有设备一样） */
export function SessionCards() {
  const [data, setData] = useIntegrations()
  const [g, setG] = useState({ userName: '', aiName: '', tz: '', turnNote: '', homeApiDoc: '' })
  const [x, setX] = useState({ permissionMode: 'default', forgeEnabled: false, forgeSoftPct: 80, forgeRetain: 100000, forgeSquash: 4000, keepaliveMinutes: 0, sideModel: '' })
  const [note, setNote] = useState('')
  useEffect(() => { if (data) { setG(data.general); setX(data.session) } }, [data])
  async function save(body: Record<string, unknown>) {
    setNote('')
    try { setData(await saveIntegrations(body)); setNote('已保存，下一条消息起生效') }
    catch (e) { setNote(e instanceof Error ? e.message : '保存失败') }
  }
  const row = (t: string, sub: string, el: React.ReactNode) => (
    <div className="mb-3"><label className={label}>{t}</label>{el}{sub && <p className="-mt-2 mb-2 text-[10.5px] leading-snug text-[color:var(--color-ink-4)]">{sub}</p>}</div>
  )
  const id = getIdentity()
  return (
    <>
      <div className={card}>
        <b className="mb-3 block text-[13px]">称呼与时间</b>
        {row('我的名字', '写进给 Claude 的提示里（朋友圈、群聊、转发记录…）。不填 = "用户"。', <input className={input} value={g.userName} onChange={(e) => setG((v) => ({ ...v, userName: e.target.value }))} />)}
        {row('Claude 的名字', '朋友圈/推送里用。不填 = "Claude"。', <input className={input} value={g.aiName} onChange={(e) => setG((v) => ({ ...v, aiName: e.target.value }))} />)}
        <button onClick={() => setG((v) => ({ ...v, userName: id.userName, aiName: id.aiName }))} className={`${ghost} mb-3`}>用「外观 › 我们」里的名字</button>
        {row('时区', '告诉 Claude 现在几点、按哪天算"今天"。例：Asia/Shanghai。不填 = 跟服务器。', <input className={input} value={g.tz} placeholder="Asia/Shanghai" onChange={(e) => setG((v) => ({ ...v, tz: e.target.value }))} />)}
        {row('每轮附言（可空）', '每条消息前面附给 Claude 的一句固定话，比如"这一轮请用简体中文思考"。不填 = 不附。', <textarea className={input} rows={2} value={g.turnNote} onChange={(e) => setG((v) => ({ ...v, turnNote: e.target.value }))} />)}
        {row('工具说明文档路径（可空）', '服务器上一份写给 Claude 的说明（比如仓库里的 docs/给你的Claude看.md 的绝对路径），填了每轮提醒它用到时先读。', <input className={input} value={g.homeApiDoc} onChange={(e) => setG((v) => ({ ...v, homeApiDoc: e.target.value }))} />)}
        <button onClick={() => void save({ general: g })} className={`w-full ${btn}`}>保存</button>
      </div>
      <div className={card}>
        <b className="mb-3 block text-[13px]">会话行为</b>
        {row('新房间的默认权限', '新建的房间用它；已有房间在「权限」页单独改。', (
          <select className={input} value={x.permissionMode} onChange={(e) => setX((v) => ({ ...v, permissionMode: e.target.value }))}>
            <option value="default">每步询问（推荐）</option><option value="acceptEdits">改文件自动、其他询问</option>
            <option value="plan">只读规划</option><option value="bypassPermissions">全放行（危险）</option>
          </select>
        ))}
        <label className="mb-1 flex items-center gap-2 text-[12px]">
          <input type="checkbox" checked={x.forgeEnabled} onChange={(e) => setX((v) => ({ ...v, forgeEnabled: e.target.checked }))} /> 自动换窗
        </label>
        <p className="mb-3 text-[10.5px] leading-snug text-[color:var(--color-ink-4)]">
          上下文快满时，让 Claude 先写交接，再换到新会话、保留最近的原文。剪切用仓库附带的 forge-reload 脚本；依赖 Claude Code 的会话文件格式，升级后可能失效。不开 = 上下文满了要你手动 /compact 或新开会话。
        </p>
        {x.forgeEnabled && <>
          {row('换窗水位（%）', '上下文用到多少开始换。', <input className={input} type="number" min={30} max={95} value={x.forgeSoftPct} onChange={(e) => setX((v) => ({ ...v, forgeSoftPct: Number(e.target.value) }))} />)}
          {row('保留原文（token）', '换过去时带上最近多少 token 的原对话。', <input className={input} type="number" min={10000} max={500000} step={10000} value={x.forgeRetain} onChange={(e) => setX((v) => ({ ...v, forgeRetain: Number(e.target.value) }))} />)}
          {row('工具输出压缩阈值（字）', '超过这么长的工具输出在换窗时只留头尾。0 = 不压缩。', <input className={input} type="number" min={0} value={x.forgeSquash} onChange={(e) => setX((v) => ({ ...v, forgeSquash: Number(e.target.value) }))} />)}
        </>}
        {row('缓存保活（分钟）', '主房间闲置满这么久，悄悄发一个"·"让提示缓存不过期，下一句回得快。会消耗额度；0 = 关。', <input className={input} type="number" min={0} max={59} value={x.keepaliveMinutes} onChange={(e) => setX((v) => ({ ...v, keepaliveMinutes: Number(e.target.value) }))} />)}
        {row('小活用的模型', '朋友圈里 Claude 过一会儿来点赞评论，用的是一次性的轻量调用，这里填模型 id。不填 = claude-sonnet-5。', <input className={input} value={x.sideModel} onChange={(e) => setX((v) => ({ ...v, sideModel: e.target.value }))} />)}
        <button onClick={() => void save({ session: x })} className={`w-full ${btn}`}>保存</button>
      </div>
      {note && <p className="mb-4 text-center text-[11px] text-[color:var(--color-ink-2)]">{note}</p>}
    </>
  )
}

import { useEffect, useState } from 'react'
import {
  fetchMcp, reconnectMcp, liveCatalog, readReceipts, writeReceipt,
  fetchMcpConfig, patchMcpConfig, type McpConf,
  type McpServer, type Receipt,
} from '../lib/api'


type Tab = 'catalog' | 'custom' | 'receipt'
type Draft = { name: string; type: 'http' | 'sse'; url: string; auth: string }
const EMPTY: Draft = { name: '', type: 'http', url: '', auth: '' }

const statusDot = (s: string) =>
  s === 'connected' ? 'bg-[var(--color-ink)]'
    : s.includes('auth') ? 'bg-[var(--color-ink-2)]' : 'bg-[var(--color-ink-4)]'

export default function Registry({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<Tab>('catalog')
  const [servers, setServers] = useState<McpServer[]>([])
  const [loaded, setLoaded] = useState(false)
  const [conf, setConf] = useState<McpConf[]>([])
  const [receipts, setReceipts] = useState<Receipt[]>(readReceipts)
  const [form, setForm] = useState<Draft | null>(null)
  const [editing, setEditing] = useState<string | null>(null)   /* 正在编辑的服务名 */
  const [edit, setEdit] = useState<{ url: string; auth: string }>({ url: '', auth: '' })
  const [json, setJson] = useState(false)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState('')

  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 2600) }
  const reload = () => {
    void fetchMcp().then((d) => { setServers(d.servers); setLoaded(true) })
    void fetchMcpConfig().then((d) => setConf(d.servers))
  }
  useEffect(reload, [])

  /* 显示名和配置 key 可能不同（liveCatalog 会改名），拿 aliases 一起对 */
  const confOf = (name: string, aliases?: string[]) =>
    conf.find((c) => c.name === name || aliases?.includes(c.name))
  const cat = liveCatalog(servers)
  const confOnly = conf.filter((c) => !cat.some((e) => e.name === c.name || e.aliases.includes(c.name)))

  function openEdit(c: McpConf | undefined) {
    if (!c) { say('这个服务不在可编辑配置里'); return }
    setEditing(editing === c.name ? null : c.name)
    setEdit({ url: c.url, auth: '' })
  }

  async function saveEdit(name: string) {
    const c = confOf(name)
    const body: Parameters<typeof patchMcpConfig>[1] = {}
    if (edit.url.trim() && edit.url.trim() !== c?.url) body.url = edit.url.trim()
    if (edit.auth.trim()) body.auth = edit.auth.trim()
    if (!Object.keys(body).length) { setEditing(null); return }
    setBusy(true)
    const ok = await patchMcpConfig(name, body)
    setBusy(false); setEditing(null)
    say(ok ? '已保存，点 ✨ 同步生效' : '保存失败')
    if (ok) reload()
  }

  async function toggleDisabled(name: string, disabled: boolean) {
    setBusy(true)
    const ok = await patchMcpConfig(name, { disabled })
    setBusy(false)
    say(ok ? (disabled ? '已停用，点 ✨ 同步生效' : '已启用，点 ✨ 同步生效') : '操作失败')
    if (ok) reload()
  }

  async function clearAuth(name: string) {
    setBusy(true)
    const ok = await patchMcpConfig(name, { auth: '' })
    setBusy(false)
    say(ok ? '鉴权头已清除' : '操作失败')
    if (ok) reload()
  }

  async function removeServer(name: string) {
    if (!confirm(`把「${name}」从配置里删掉？`)) return
    setBusy(true)
    const ok = await patchMcpConfig(name, { delete: true })
    setBusy(false); setEditing(null)
    say(ok ? '已删除，点 ✨ 同步生效' : '删除失败')
    if (ok) reload()
  }

  async function addServer(d: Draft) {
    setBusy(true)
    const ok = await patchMcpConfig(d.name.trim(), {
      url: d.url.trim(), type: d.type, ...(d.auth.trim() ? { auth: d.auth.trim() } : {}),
    })
    setBusy(false)
    if (ok) {
      writeReceipt({ name: d.name.trim(), status: 'saved', detail: `${d.type} · ${d.url.trim()}`, at: new Date().toISOString() })
      setReceipts(readReceipts()); setForm(null); reload()
      say('已保存，点 ✨ 同步生效')
    } else say('保存失败')
  }

  async function sync() {
    setBusy(true)
    await reconnectMcp()
    setTimeout(() => {
      void fetchMcp().then((d) => {
        setServers(d.servers)
        d.servers.forEach((s) => writeReceipt({ name: s.name, status: s.status, detail: s.detail, at: new Date().toISOString() }))
        setReceipts(readReceipts()); setBusy(false)
      })
    }, 1800)
  }

  return (
    <section className="absolute inset-0 overflow-y-auto px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onBack}
          className="loop-back grid h-10 w-10 place-items-center rounded-full border border-[var(--color-line)] bg-[var(--color-surface)]">‹</button>
        <div className="flex gap-1 rounded-full border border-[var(--color-line)] bg-[var(--color-surface)] p-1">
          <button onClick={sync} title="同步工具"
            className="grid h-8 w-9 place-items-center rounded-full">{busy ? '⋯' : '✨'}</button>
          <button onClick={() => setJson((v) => !v)} title="JSON"
            className={`grid h-8 w-9 place-items-center rounded-full font-mono ${json ? 'bg-[var(--color-card)]' : ''}`}>{'{}'}</button>
          <button onClick={() => { setTab('custom'); setForm(EMPTY) }} title="添加"
            className="grid h-8 w-9 place-items-center rounded-full text-[18px]">+</button>
        </div>
      </div>

      <p className="text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">注册表</p>
      <h2 className="text-[22px] font-bold tracking-tight">MCP</h2>
      <p className="mb-4 leading-relaxed text-[color:var(--color-ink-3)]">
        点一个已接的服务可以改地址、换鉴权、停用或删除；改完点 ✨ 同步生效。
      </p>

      <div className="mb-4 flex gap-2">
        {([['catalog', '服务目录'], ['custom', '添加连接'], ['receipt', '连接回执']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`flex-1 rounded-[var(--radius-md)] border py-2.5 text-[length:var(--text-sub)]
              ${tab === k ? 'border-[var(--color-ink)] bg-[var(--color-card)] font-medium'
                          : 'border-[var(--color-line)] bg-[var(--color-surface)]'}`}>{label}</button>
        ))}
      </div>

      {json && (
        <pre className="mb-4 max-h-[40vh] overflow-auto rounded-[var(--radius-md)] border border-[var(--color-line)]
                        bg-[var(--color-ink)] p-3 font-mono text-[11px] leading-relaxed text-[#e8e8e8]">
{JSON.stringify({ mcpServers: Object.fromEntries(conf.map((c) => [c.name, { type: c.type, url: c.url, auth: c.hasAuth ? '（已设，不回显）' : undefined, disabled: c.disabled || undefined }])) }, null, 2)}
        </pre>
      )}

      {/* 服务目录 = 真实配置 + 实时连接状态；点卡片展开编辑 */}
      {tab === 'catalog' && cat.map((e) => {
        const c = confOf(e.name, e.aliases)
        const open = editing === (c?.name ?? e.name)
        return (
          <div key={e.name} className="mb-2 rounded-[var(--radius-md)] border border-[var(--color-line)]
                                       bg-[var(--color-surface)] shadow-[var(--shadow-xs)]">
            <button onClick={() => openEdit(c)} className="flex w-full items-center gap-3 p-3.5 text-left">
              <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot(c?.disabled ? 'disabled' : e.status)}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <b>{e.name}</b>
                  {e.home && <span className="rounded-full bg-[var(--color-card)] px-2 text-[10px] text-[color:var(--color-ink-3)]">自家</span>}
                  {c?.hasAuth && <span className="rounded-full bg-[var(--color-card)] px-2 text-[10px] text-[color:var(--color-ink-3)]">带鉴权</span>}
                </span>
                <span className="block truncate text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">{e.blurb}</span>
              </span>
              <span className="shrink-0 text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">
                {c?.disabled ? '停用' : e.status === 'connected' ? '已连' : e.status === 'auth' ? '待授权' : e.status === 'disabled' ? '停用' : '断开'}
              </span>
            </button>
            {open && c && (
              <div className="border-t border-[var(--color-line)] p-3.5">
                <label className="mb-3 block">
                  <span className="mb-1 block text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">endpoint</span>
                  <input value={edit.url} onChange={(ev) => setEdit({ ...edit, url: ev.target.value })}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)]
                               px-3 py-2.5 font-mono text-[12px] outline-none focus:border-[var(--color-ink)]" />
                </label>
                <label className="mb-3 block">
                  <span className="mb-1 block text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">
                    鉴权头{c.hasAuth ? '（已设置，不回显；留空 = 不动）' : '（可选）'}
                  </span>
                  <input value={edit.auth} placeholder={c.hasAuth ? '••••••' : 'Bearer …'}
                    onChange={(ev) => setEdit({ ...edit, auth: ev.target.value })}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)]
                               px-3 py-2.5 font-mono text-[12px] outline-none focus:border-[var(--color-ink)]" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void saveEdit(c.name)} disabled={busy}
                    className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-[12px] text-[color:var(--color-surface)] disabled:opacity-40">保存</button>
                  <button onClick={() => void toggleDisabled(c.name, !c.disabled)} disabled={busy}
                    className="rounded-full border border-[var(--color-line)] px-4 py-2 text-[12px]">{c.disabled ? '重新启用' : '停用'}</button>
                  {c.hasAuth && (
                    <button onClick={() => void clearAuth(c.name)} disabled={busy}
                      className="rounded-full border border-[var(--color-line)] px-4 py-2 text-[12px]">清除鉴权</button>
                  )}
                  <button onClick={() => void removeServer(c.name)} disabled={busy}
                    className="ml-auto rounded-full border border-[var(--color-line)] px-4 py-2 text-[12px] text-[color:var(--color-ink-3)]">删除</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {/* 配置里有、但当前没出现在连接列表里的（刚添加还没同步、或停用中）也要能编辑 */}
      {tab === 'catalog' && confOnly.map((c) => {
        const open = editing === c.name
        return (
          <div key={c.name} className="mb-2 rounded-[var(--radius-md)] border border-dashed border-[var(--color-line)]
                                       bg-[var(--color-surface)]">
            <button onClick={() => openEdit(c)} className="flex w-full items-center gap-3 p-3.5 text-left">
              <span className={`h-2 w-2 shrink-0 rounded-full ${c.disabled ? 'bg-[var(--color-ink-4)]' : 'bg-[var(--color-ink-3)]'}`} />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <b>{c.name}</b>
                  {c.hasAuth && <span className="rounded-full bg-[var(--color-card)] px-2 text-[10px] text-[color:var(--color-ink-3)]">带鉴权</span>}
                </span>
                <span className="block truncate text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">{c.url}</span>
              </span>
              <span className="shrink-0 text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">{c.disabled ? '停用' : '未同步'}</span>
            </button>
            {open && (
              <div className="border-t border-[var(--color-line)] p-3.5">
                <label className="mb-3 block">
                  <span className="mb-1 block text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">endpoint</span>
                  <input value={edit.url} onChange={(ev) => setEdit({ ...edit, url: ev.target.value })}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)]
                               px-3 py-2.5 font-mono text-[12px] outline-none focus:border-[var(--color-ink)]" />
                </label>
                <label className="mb-3 block">
                  <span className="mb-1 block text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">
                    鉴权头{c.hasAuth ? '（已设置，不回显；留空 = 不动）' : '（可选）'}
                  </span>
                  <input value={edit.auth} placeholder={c.hasAuth ? '••••••' : 'Bearer …'}
                    onChange={(ev) => setEdit({ ...edit, auth: ev.target.value })}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)]
                               px-3 py-2.5 font-mono text-[12px] outline-none focus:border-[var(--color-ink)]" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => void saveEdit(c.name)} disabled={busy}
                    className="rounded-full bg-[var(--color-ink)] px-4 py-2 text-[12px] text-[color:var(--color-surface)] disabled:opacity-40">保存</button>
                  <button onClick={() => void toggleDisabled(c.name, !c.disabled)} disabled={busy}
                    className="rounded-full border border-[var(--color-line)] px-4 py-2 text-[12px]">{c.disabled ? '重新启用' : '停用'}</button>
                  {c.hasAuth && (
                    <button onClick={() => void clearAuth(c.name)} disabled={busy}
                      className="rounded-full border border-[var(--color-line)] px-4 py-2 text-[12px]">清除鉴权</button>
                  )}
                  <button onClick={() => void removeServer(c.name)} disabled={busy}
                    className="ml-auto rounded-full border border-[var(--color-line)] px-4 py-2 text-[12px] text-[color:var(--color-ink-3)]">删除</button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      {tab === 'catalog' && servers.length === 0 && confOnly.length === 0 && (
        <p className="py-8 text-center text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">{loaded ? '还没有 MCP 服务。点「添加连接」加一个，所有房间的 Claude 会话都会挂上它。' : '正在读取 MCP 配置…'}</p>
      )}

      {tab === 'custom' && (
        <>
          <button onClick={() => setForm(form ? null : EMPTY)}
            className="mb-3 flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-line)]
                       bg-[var(--color-surface)] p-4 text-left shadow-[var(--shadow-xs)]">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[var(--radius-sm)]
                             bg-[var(--color-ink)] text-[22px] text-[color:var(--color-surface)]">+</span>
            <span className="min-w-0 flex-1">
              <b className="block text-[length:var(--text-card)]">添加新连接</b>
              <span className="block text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">直接写进真配置；保存后点 ✨ 同步接入。</span>
            </span>
            <span className="shrink-0 text-[color:var(--color-ink-3)]">›</span>
          </button>

          {form && (
            <div className="mb-4 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
              {([['name', '名称', 'my-memory'], ['url', 'endpoint', 'https://…/mcp'], ['auth', '鉴权头（可选，只进不出）', 'Bearer …']] as const).map(([k, label, ph]) => (
                <label key={k} className="mb-3 block">
                  <span className="mb-1 block text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">{label}</span>
                  <input value={form[k]} placeholder={ph} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                    className="w-full rounded-[var(--radius-sm)] border border-[var(--color-line)] bg-[var(--color-card)]
                               px-3 py-2.5 outline-none focus:border-[var(--color-ink)]" />
                </label>
              ))}
              <div className="mb-3 flex gap-2">
                {(['http', 'sse'] as const).map((t) => (
                  <button key={t} onClick={() => setForm({ ...form, type: t })}
                    className={`flex-1 rounded-[var(--radius-sm)] border py-2 text-[length:var(--text-sub)]
                      ${form.type === t ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[color:var(--color-surface)]'
                                        : 'border-[var(--color-line)]'}`}>{t}</button>
                ))}
              </div>
              <button onClick={() => void addServer(form)} disabled={busy || !form.name.trim() || !form.url.trim()}
                className="w-full rounded-[var(--radius-md)] bg-[var(--color-ink)] py-3 text-[color:var(--color-surface)] disabled:opacity-40">
                保存进配置
              </button>
            </div>
          )}

          {!form && (
            <p className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-line)] p-4
                          text-[length:var(--text-sub)] leading-relaxed text-[color:var(--color-ink-3)]">
              已接的服务在「服务目录」里点开就能编辑，这里只管添新的。
            </p>
          )}
        </>
      )}

      {tab === 'receipt' && (
        <>
          {receipts.length === 0 && (
            <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-line)] p-6
                            text-center text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">
              还没有回执。点右上角 ✨ 同步一次工具，结果会记在这里。
            </div>
          )}
          {receipts.map((r, i) => (
            <div key={i} className="mb-2 rounded-[var(--radius-md)] border border-[var(--color-line)]
                                    bg-[var(--color-surface)] p-3">
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 shrink-0 rounded-full ${statusDot(r.status)}`} />
                <b className="min-w-0 flex-1 truncate">{r.name}</b>
                <span className="shrink-0 text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">{r.at.slice(5, 16).replace('T', ' ')}</span>
              </div>
              <div className="mt-1 break-all text-[11px] leading-snug text-[color:var(--color-ink-3)]">{r.detail}</div>
            </div>
          ))}
        </>
      )}

      {toast && (
        <div className="pointer-events-none fixed bottom-24 left-1/2 z-[72] -translate-x-1/2 rounded-full
                        bg-[var(--color-ink)] px-3.5 py-1.5 text-[12px] text-[color:var(--color-surface)]">
          {toast}
        </div>
      )}
    </section>
  )
}

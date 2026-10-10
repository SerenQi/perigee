import { useMemo, useState } from 'react'
import RAW from '../lib/plugins.json'
import { type MarketPlugin } from '../lib/api'

/* Skills：只读的插件目录，方便浏览和搜索。v1 不在网页上装插件——安装请在终端里用 claude 命令。 */
const MARKET = RAW as MarketPlugin[]

export default function Skills({ onBack }: { onBack: () => void }) {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('全部')
  const cats = useMemo(() => ['全部', ...[...new Set(MARKET.map((p) => p.cat))].sort()], [])
  const list = useMemo(() => {
    const k = q.trim().toLowerCase()
    return MARKET.filter((p) =>
      (cat === '全部' || p.cat === cat) &&
      (!k || p.name.toLowerCase().includes(k) || p.desc.toLowerCase().includes(k)))
      .slice(0, 60)
  }, [q, cat])

  return (
    <section className="absolute inset-0 overflow-y-auto px-5 pb-6 pt-[max(1.25rem,env(safe-area-inset-top))]">
      <button onClick={onBack}
        className="loop-back mb-4 grid h-10 w-10 place-items-center rounded-full border border-[var(--color-line)]
                   bg-[var(--color-surface)]">‹</button>
      <p className="text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">插件目录</p>
      <h2 className="mb-1 text-[22px] font-bold tracking-tight">Skills</h2>
      <p className="mb-3 leading-relaxed text-[color:var(--color-ink-3)]">
        这里只是浏览插件目录。安装请在终端（底栏 › 终端，或服务器上）用 claude 命令，装好后新开会话生效：
      </p>
      <pre className="mb-4 overflow-x-auto rounded-[var(--radius-md)] bg-[var(--color-card)] px-3.5 py-3 font-mono text-[11.5px] leading-relaxed">{`claude plugin marketplace add <插件市场的仓库或地址>
claude plugin install <插件名>@<市场名>
claude plugin list            # 看已经装了哪些
claude plugin uninstall <插件名>
# 或者在 claude 里输入 /plugin 用交互界面装`}</pre>

      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜插件…"
        className="mb-3 w-full rounded-[var(--radius-md)] border border-[var(--color-line)]
                   bg-[var(--color-surface)] px-3.5 py-2.5 outline-none focus:border-[var(--color-ink)]" />
      <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-[length:var(--text-sub)]
              ${cat === c ? 'border-[var(--color-ink)] bg-[var(--color-ink)] text-[color:var(--color-surface)]'
                          : 'border-[var(--color-line)] bg-[var(--color-surface)]'}`}>{c}</button>
        ))}
      </div>

      {list.map((p) => (
        <div key={p.name} className="mb-2 rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] p-3.5 shadow-[var(--shadow-xs)]">
          <b className="text-[length:var(--text-card)]">{p.name}</b>
          {p.author && <span className="ml-2 text-[11px] text-[color:var(--color-ink-4)]">{p.author}</span>}
          <span className="mt-0.5 block text-[length:var(--text-sub)] leading-snug text-[color:var(--color-ink-3)]">{p.desc}</span>
        </div>
      ))}
      <p className="mt-3 text-[length:var(--text-cap)] text-[color:var(--color-ink-3)]">
        最多显示 60 条，搜一下能找到全部 {MARKET.length} 个。
      </p>
    </section>
  )
}

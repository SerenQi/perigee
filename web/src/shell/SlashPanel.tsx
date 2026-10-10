export const SLASH = [
  { cmd: '/new', desc: '开一个新会话' },
  { cmd: '/list', desc: '列出所有会话' },
  { cmd: '/switch', desc: '切到某个会话' },
  { cmd: '/compact', desc: '压缩上下文' },
  { cmd: '/clear', desc: '清空当前会话' },
  { cmd: '/stop', desc: '让我停下' },
  { cmd: '/model', desc: '换模型' },
  { cmd: '/help', desc: '看命令列表' },
]

export default function SlashPanel({ onPick }: { onPick: (cmd: string) => void }) {
  return (
    <div className="mx-3 mb-2 max-h-[42vh] overflow-y-auto rounded-[var(--radius-lg)] border
                    border-[var(--color-line)] bg-[var(--color-surface)] p-1.5 shadow-[var(--shadow-md)]">
      {SLASH.map((s) => (
        <button key={s.cmd} onClick={() => onPick(s.cmd)}
          className="flex w-full items-baseline gap-3 rounded-[var(--radius-xs)] px-3 py-2.5 text-left
                     active:bg-[var(--color-card)]">
          <code className="font-mono text-[length:var(--text-body)] font-medium">{s.cmd}</code>
          <span className="text-[length:var(--text-sub)] text-[color:var(--color-ink-3)]">{s.desc}</span>
        </button>
      ))}
    </div>
  )
}

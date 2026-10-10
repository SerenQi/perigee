/** 按分类画杯型 · 线性黑白 */
const PATHS: Record<string, string> = {
  无酒精:   'M7 3h10l-1 15a2 2 0 01-2 2h-4a2 2 0 01-2-2L7 3zM7.6 9h8.8',
  低度:     'M6 4h10v14a2 2 0 01-2 2H8a2 2 0 01-2-2V4zM16 7h2a2 2 0 012 2v3a2 2 0 01-2 2h-2M6 9h10',
  鸡尾酒:   'M4 4h16l-8 8v8M8 20h8M6.5 7h11',
  烈酒:     'M6 8h12l-1 11a2 2 0 01-2 2H9a2 2 0 01-2-2L6 8zM6.4 13h11.2M9 3l1 4M15 3l-1 4',
  私藏特调: 'M8 3h8l-1 7a3 3 0 01-6 0L8 3zM12 10v8M9 21h6M9.2 6h5.6',
}
export default function Glass({ cat, size = 22 }: { cat: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}
         strokeLinecap="round" strokeLinejoin="round" style={{ width: size, height: size }}>
      <path d={PATHS[cat] ?? PATHS['无酒精']} />
    </svg>
  )
}

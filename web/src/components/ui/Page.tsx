import type { ReactNode } from 'react'

export function PageHeader({ kicker, title, right }: { kicker: ReactNode; title: ReactNode; right?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="k">{kicker}</p>
        <h1 className="h1">{title}</h1>
      </div>
      {right}
    </header>
  )
}

export function SimBanner({ children, tag = 'SIMULATION' }: { children: ReactNode; tag?: string }) {
  return (
    <div role="note" className="flex items-center gap-3 px-4 py-3 rounded-xl border border-dashed border-line3 bg-deep text-sm text-subtle">
      <span className="tag simt">{tag}</span>
      <span>{children}</span>
    </div>
  )
}

export function Segmented<T extends string | number>({
  label, options, value, onChange,
}: { label: string; options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="segs">
      {options.map((o) => (
        <button key={String(o.value)} type="button" className="seg" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Stat({ k, children, color }: { k: string; children: ReactNode; color?: string }) {
  return (
    <div>
      <p className="k">{k}</p>
      <p className="big" style={{ marginTop: 4, fontSize: 26, color }}>{children}</p>
    </div>
  )
}

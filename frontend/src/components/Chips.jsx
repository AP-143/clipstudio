// Reusable segmented chip selector used across the edit panels.
export default function Chips({ label, value, options, onChange }) {
  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const val = typeof o === 'string' ? o : o.value
          const text = typeof o === 'string' ? o : o.label
          const active = val === value
          return (
            <button
              key={val}
              onClick={() => onChange(val)}
              className={`px-3 py-1.5 text-xs uppercase tracking-wide border rounded-md transition-all active:scale-95
                ${active
                  ? 'bg-[#ededed] text-[#0a0a0a] border-[#ededed]'
                  : 'bg-white text-ink border-line hover:border-faint'}`}
            >
              {text}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function ColorChips({ label, value, colors, onChange }) {
  return (
    <div>
      {label && <span className="label">{label}</span>}
      <div className="flex flex-wrap gap-2">
        {colors.map((c) => (
          <button
            key={c.value}
            title={c.label}
            onClick={() => onChange(c.value)}
            className={`w-8 h-8 rounded border transition-transform active:scale-95 ${value === c.value ? 'ring-2 ring-[#ededed] ring-offset-2 ring-offset-[#181818]' : 'border-line'}`}
            style={{ background: c.hex }}
          />
        ))}
      </div>
    </div>
  )
}

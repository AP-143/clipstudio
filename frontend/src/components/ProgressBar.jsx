import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'

const STAGES = [
  [0, 'Downloading / Validating'],
  [10, 'Transcribing (Whisper)'],
  [30, 'Detecting scenes'],
  [35, 'Analyzing with Groq'],
  [50, 'Cutting & cropping'],
  [80, 'Applying effects & subtitles'],
  [95, 'Finalizing'],
]

function estimate(progress, startedAt) {
  if (!progress || progress <= 1 || !startedAt) return null
  const elapsed = (Date.now() - startedAt) / 1000
  const total = (elapsed / progress) * 100
  const remain = Math.max(0, total - elapsed)
  if (remain < 1) return null
  return remain < 60 ? `${Math.round(remain)} dtk` : `${Math.round(remain / 60)} mnt`
}

export default function ProgressBar({ status }) {
  const progress = status?.progress || 0
  const started = useRef(Date.now())
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const eta = estimate(progress, started.current)

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <span className="font-display text-2xl flex items-center gap-3">
          <Loader2 size={20} className="animate-spin text-soft shrink-0" />
          {status?.step || 'Memproses'}
        </span>
        <span className="font-display text-4xl">{progress}%</span>
      </div>
      {/* Track: a filled bar for real progress + an always-moving shimmer so the
          UI clearly reads as "working" even while the percentage sits still. */}
      <div className="w-full h-1 bg-gray-border relative overflow-hidden rounded-full">
        <div className="absolute left-0 top-0 h-full bg-btn transition-all duration-500 rounded-full"
             style={{ width: `${progress}%` }} />
        <div className="indeterminate-bar bg-ink/30" />
      </div>
      <div className="flex items-center justify-between mt-3 text-sm text-gray-mid">
        <span>{status?.message || ''}</span>
        {eta && <span>± {eta} tersisa</span>}
      </div>
      <div className="mt-6 space-y-1">
        {STAGES.map(([at, label]) => {
          const done = progress >= at
          const current = progress >= at &&
            progress < (STAGES[STAGES.findIndex((s) => s[0] === at) + 1]?.[0] ?? 101)
          return (
            <div key={at}
              className={`flex items-center gap-3 text-sm ${done ? 'text-ink' : 'text-gray-border'}`}>
              <span className={`w-2 h-2 border border-current ${current ? 'bg-btn animate-pulse' : done ? 'bg-btn' : ''}`} />
              <span className={current ? 'font-medium' : ''}>{label}</span>
              {current && <Loader2 size={13} className="animate-spin text-soft" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

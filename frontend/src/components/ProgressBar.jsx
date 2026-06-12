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

// ETA from the RECENT progress velocity (sliding ~60s window), not a linear
// projection from the job's start. The phases run at very different speeds
// (download/model-load is slow, later stages fast), so extrapolating the early
// rate over the whole job wildly over-estimated (e.g. "100 mnt" while it was
// really ~5). A rolling rate adapts as the work moves between phases.
function estimateRolling(samples, progress) {
  if (progress <= 1 || progress >= 100 || samples.length < 2) return null
  const first = samples[0]
  const last = samples[samples.length - 1]
  const dp = last.p - first.p
  const dt = (last.t - first.t) / 1000
  if (dp <= 0 || dt <= 0) return null
  const remain = ((100 - progress) / (dp / dt))
  if (!isFinite(remain) || remain < 1) return null
  return remain < 60 ? `${Math.round(remain)} dtk` : `${Math.round(remain / 60)} mnt`
}

export default function ProgressBar({ status }) {
  const progress = status?.progress || 0
  const samples = useRef([])
  const [, force] = useState(0)

  // Record a sample whenever the percentage changes; keep the last 60s.
  useEffect(() => {
    const now = Date.now()
    const arr = samples.current
    if (!arr.length || arr[arr.length - 1].p !== progress) {
      arr.push({ t: now, p: progress })
      while (arr.length > 2 && arr[0].t < now - 60000) arr.shift()
    }
  }, [progress])

  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const eta = estimateRolling(samples.current, progress)

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

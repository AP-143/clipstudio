import { useEffect, useState } from 'react'
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

// The % bar is NOT linear in wall-clock: download and transcribe each cover a
// small slice of the bar yet take minutes, while later stages fly. Projecting
// the current %/time rate over the rest therefore wildly over-estimated (a
// "download 4%" once read "90 mnt" when the real total was ~10). Instead, map
// the bar % onto a weighted time line (rough relative wall-clock per phase) and
// extrapolate from elapsed time since the job was created — a stable, honest ETA.
const PHASES = [
  [0, 10, 4],     // download (network-bound, the most variable)
  [10, 30, 4],    // transcribe (Whisper)
  [30, 35, 0.3],  // scene detect
  [35, 50, 2.5],  // analyze (Groq, chunked w/ backoff)
  [50, 95, 3],    // cut & crop
  [95, 100, 0.3], // finalize
]
const TOTAL_W = PHASES.reduce((s, p) => s + p[2], 0)

function weightedFraction(progress) {
  let acc = 0
  for (const [a, b, w] of PHASES) {
    if (progress >= b) { acc += w; continue }
    if (progress > a) acc += (w * (progress - a)) / (b - a)
    break
  }
  return acc / TOTAL_W
}

function estimateETA(progress, createdAt) {
  if (!createdAt || progress <= 1 || progress >= 100) return null
  const elapsed = (Date.now() - new Date(createdAt).getTime()) / 1000
  const f = weightedFraction(progress)
  if (elapsed < 5 || f <= 0.001) return null
  const remain = (elapsed * (1 - f)) / f
  if (!isFinite(remain) || remain < 5) return null
  return remain < 90 ? `${Math.round(remain)} dtk` : `${Math.round(remain / 60)} mnt`
}

export default function ProgressBar({ status }) {
  const progress = status?.progress || 0
  const [, force] = useState(0)
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const eta = estimateETA(progress, status?.created_at)
  // The big number is OVERALL job progress (matches the bar). The current phase
  // has its own percentage inside the status message (e.g. "Transkripsi 71%") —
  // surface it next to the step name so "Transcribing 24%" no longer reads as if
  // transcription itself were only 24% done.
  const phasePct = (status?.message || '').match(/(\d+)\s*%/)?.[1]

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <span className="font-display text-2xl flex items-center gap-3">
          <Loader2 size={20} className="animate-spin text-soft shrink-0" />
          {status?.step || 'Memproses'}
          {phasePct && <span className="text-base text-gray-mid font-sans">· {phasePct}%</span>}
        </span>
        <span className="font-display text-4xl flex items-baseline gap-2">
          {progress}%
          <span className="text-[10px] uppercase text-gray-mid font-sans tracking-[0.2em]">total</span>
        </span>
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

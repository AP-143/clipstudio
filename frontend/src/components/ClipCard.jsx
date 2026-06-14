import { useState } from 'react'
import { Download, Play, Wand2, Sparkles } from 'lucide-react'
import { API_BASE } from '../config.js'
import Modal from './Modal.jsx'
import ClipEditor from './ClipEditor.jsx'

function fmtTime(sec) {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

// Color + label the viral score so the user knows which clips to prioritize.
function scoreTier(score) {
  if (score >= 85) return { cls: 'bg-green-500/90 text-white', tip: 'Prioritas posting' }
  if (score >= 70) return { cls: 'bg-amber-400/90 text-[#0a0a0a]', tip: 'Berpotensi' }
  return { cls: 'bg-white/90 text-[#0a0a0a]', tip: 'Biasa' }
}

// Plain clip card: play the result + download. (Editing features removed — to be
// rebuilt from scratch.)
export default function ClipCard({ jobId, clip, channel }) {
  const [playing, setPlaying] = useState(false)
  const [editing, setEditing] = useState(false)

  const rev = clip.rev || 0
  const thumb = `${API_BASE}/api/clip/${jobId}/${clip.index}/preview?v=${rev}`
  const downloadUrl = `${API_BASE}/api/clip/${jobId}/${clip.index}`
  const videoUrl = `${downloadUrl}?v=${rev}`

  return (
    <div className="card flex flex-col overflow-hidden">
      {/* Preview — click to play the actual clip inline */}
      <div className="relative bg-alt aspect-[9/16] overflow-hidden">
        {playing ? (
          <video src={videoUrl} controls autoPlay playsInline
            className="w-full h-full object-contain bg-ink" />
        ) : (
          <>
            <img src={thumb} alt={clip.title} loading="lazy"
              className="w-full h-full object-cover" />
            <button onClick={() => setPlaying(true)} aria-label="Putar"
              className="absolute inset-0 flex items-center justify-center group">
              <span className="w-14 h-14 rounded-full bg-white/90 backdrop-blur
                flex items-center justify-center transition-transform group-hover:scale-110">
                <Play size={22} className="text-[#0a0a0a] translate-x-0.5" fill="currentColor" />
              </span>
            </button>
            <span title={scoreTier(clip.score).tip}
              className={`absolute top-3 left-3 backdrop-blur text-xs px-2.5 py-1 rounded-full font-medium ${scoreTier(clip.score).cls}`}>
              <span className="font-display text-sm mr-0.5">{clip.score}</span> skor
            </span>
          </>
        )}
      </div>

      {/* Meta */}
      <div className="p-4 flex flex-col gap-2 flex-1">
        <p className="font-display text-xl leading-tight line-clamp-2">{clip.title}</p>
        <p className="text-xs text-gray-mid">
          {fmtTime(clip.start)} – {fmtTime(clip.end)} · {Math.round(clip.duration)} dtk
        </p>
        {clip.reason && (
          <p className="text-[11px] text-soft leading-snug flex gap-1.5 items-start">
            <Sparkles size={13} className="text-amber-400 shrink-0 mt-0.5" />
            <span className="line-clamp-2">{clip.reason}</span>
          </p>
        )}
        <div className="flex gap-2 mt-auto">
          <button onClick={() => setEditing(true)} className="btn btn-solid flex-1 !py-2">
            <Wand2 size={15} /> Edit
          </button>
          <a href={downloadUrl} download
            className="btn btn-outline !py-2 px-3" title="Unduh">
            <Download size={15} />
          </a>
        </div>
      </div>

      {editing && (
        <Modal onClose={() => setEditing(false)}>
          <ClipEditor jobId={jobId} clip={clip} channel={channel} />
        </Modal>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ExternalLink, Youtube, Plus, Film } from 'lucide-react'
import ClipCard from '../components/ClipCard.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import CancelButton from '../components/CancelButton.jsx'
import { useJob } from '../hooks/useJob.js'
import { API_BASE, api } from '../config.js'
import { buildShortProps } from '../remotion/buildProps.js'
import { renderInBrowser, downloadBlobUrl } from '../remotion/renderInBrowser.js'

const U = (id, w = 1400) =>
  `https://images.unsplash.com/${id}?w=${w}&q=80&fit=crop`
const imgFallback = (e) => {
  e.currentTarget.style.display = 'none'
  if (e.currentTarget.parentElement)
    e.currentTarget.parentElement.style.background = '#0a0a0a'
}

export default function Results() {
  const navigate = useNavigate()
  const { jobId, status, active, result, refreshResult, clear, cancel } = useJob()

  const startNew = () => { clear(); navigate('/app') }

  const [renderAll, setRenderAll] = useState(null) // {i,total,pct} | null
  const runRenderAll = async () => {
    const clips = result?.clips || []
    setRenderAll({ i: 0, total: clips.length, pct: 0 })
    for (let n = 0; n < clips.length; n++) {
      const clip = clips[n]
      setRenderAll({ i: n + 1, total: clips.length, pct: 0 })
      try {
        const cap = await api(`/api/clip/${jobId}/${clip.index}/captions`)
        const blob = await fetch(`${API_BASE}/api/clip/${jobId}/${clip.index}/web`).then((r) => r.blob())
        const videoUrl = URL.createObjectURL(blob)
        try {
          const { inputProps, durationInSeconds, fps } = buildShortProps(clip.editConfig || {}, {
            captions: cap.captions || [], durationSec: cap.durationSec || clip.duration,
            fps: cap.fps || 30, videoUrl, musicUrl: null,
          })
          const url = await renderInBrowser({
            videoUrl: inputProps.videoUrl, durationInSeconds, fps,
            trimBefore: inputProps.trimBefore, subtitles: inputProps.subtitles,
            hook: inputProps.hook, effects: inputProps.effects, music: inputProps.music,
            onProgress: (p) => setRenderAll({ i: n + 1, total: clips.length, pct: Math.round(p * 100) }),
          })
          const name = (clip.title || `clip_${clip.index}`).replace(/[^\w\s-]/g, '').trim().slice(0, 60) || `clip_${clip.index}`
          downloadBlobUrl(url, `${name}.mp4`)
        } finally { URL.revokeObjectURL(videoUrl) }
      } catch { /* skip failed clip, continue */ }
    }
    setRenderAll(null)
  }

  useEffect(() => { if (jobId) refreshResult().catch(() => {}) }, [jobId])

  // A job is still running — show its progress here too, so opening Hasil
  // mid-generate doesn't "lose" the progress view.
  if (active && status) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-16 space-y-8">
        <ProgressBar status={status} />
        <CancelButton onCancel={cancel} />
      </div>
    )
  }

  if (!result || !result.clips?.length) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="card overflow-hidden">
          <div className="relative h-56">
            <img src={U('photo-1492619375914-88005aa9e8fb', 1400)} alt=""
              onError={imgFallback} className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'grayscale(100%) brightness(0.5)' }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-6">
              <p className="text-[11px] uppercase text-white/70" style={{ letterSpacing: '0.3em' }}>
                Hasil klip
              </p>
              <h2 className="font-display text-5xl mt-1">Belum ada hasil</h2>
            </div>
          </div>
          <div className="p-8 text-center space-y-5">
            <p className="text-gray-mid">
              Upload video atau tempel link YouTube — AI akan menemukan momen viral
              dan memotongnya jadi klip 9:16 siap posting.
            </p>
            <button className="btn btn-solid" onClick={() => navigate('/app')}>
              Mulai Upload
            </button>
          </div>
        </div>
      </div>
    )
  }

  const meta = result.metadata || {}
  const ytLink = meta.source_url

  return (
    <div className="max-w-6xl mx-auto px-6 py-12">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="font-display text-4xl sm:text-6xl leading-none">
            {result.clips.length} klip ditemukan
          </h1>
          <p className="text-gray-mid mt-2 text-sm">
            {meta.video_title || 'Video'}
            {meta.duration ? ` · ${Math.round(meta.duration / 60)} mnt` : ''}
            {result.crop_mode ? ` · mode ${result.crop_mode}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button className="btn btn-outline" onClick={startNew}>
            <Plus size={15} /> Generate Baru
          </button>
          <button className="btn btn-solid" onClick={runRenderAll} disabled={!!renderAll}>
            <Film size={15} />
            {renderAll ? `Render ${renderAll.i}/${renderAll.total} · ${renderAll.pct}%` : 'Render Semua (edit)'}
          </button>
        </div>
      </div>

      {/* Source bar */}
      {(meta.channel_name || ytLink) && (
        <div className="card p-3 mb-8 flex items-center gap-3 text-sm">
          <Youtube size={18} />
          <span className="font-medium">{meta.channel_name || 'Unknown'}</span>
          <span className="text-gray-mid truncate flex-1">{meta.video_title}</span>
          {ytLink && (
            <a href={ytLink} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 underline shrink-0">
              YouTube <ExternalLink size={14} />
            </a>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {result.clips.map((clip) => (
          <ClipCard key={clip.index} jobId={jobId} clip={clip} channel={meta.channel_name} />
        ))}
      </div>

      <div className="mt-12 -mx-6 px-6 py-6 bg-btn flex justify-center">
        <button className="btn btn-outline bg-white"
          onClick={() => result.clips.forEach((c, i) =>
            setTimeout(() => window.open(`${API_BASE}/api/clip/${jobId}/${c.index}`), i * 400))}>
          Unduh Semua
        </button>
      </div>
    </div>
  )
}

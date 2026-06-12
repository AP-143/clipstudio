import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import UploadZone from '../components/UploadZone.jsx'
import UrlInput from '../components/UrlInput.jsx'
import ProgressBar from '../components/ProgressBar.jsx'
import CancelButton from '../components/CancelButton.jsx'
import ErrorAlert from '../components/ErrorAlert.jsx'
import Chips from '../components/Chips.jsx'
import { useJob } from '../hooks/useJob.js'
import { useSettings } from '../hooks/useSettings.js'

const U = (id, w = 1200) =>
  `https://images.unsplash.com/${id}?w=${w}&q=80&fit=crop`
const gray = { filter: 'grayscale(100%) contrast(1.02)' }
const imgFallback = (e) => {
  e.currentTarget.style.display = 'none'
  if (e.currentTarget.parentElement)
    e.currentTarget.parentElement.style.background = '#0a0a0a'
}

export default function Upload() {
  const navigate = useNavigate()
  const { settings } = useSettings()
  const hasKey = !!localStorage.getItem('clipstudio_groq_key')
  const { status, active, submit, cancel, error, result, clear } = useJob()
  const [cropMode, setCropMode] = useState(settings.cropMode)
  const [localErr, setLocalErr] = useState(null)

  const start = async ({ file, url }) => {
    if (!hasKey) {
      navigate('/app/settings', { state: { needKey: true } })
      return
    }
    if (active) {
      setLocalErr({ message: 'Masih ada job berjalan',
        solution: 'Tunggu selesai atau batalkan dulu.' })
      return
    }
    setLocalErr(null)
    try {
      await submit({ file, url, cropMode, language: settings.language })
    } catch (e) {
      setLocalErr(e)
    }
  }

  // Processing view
  if (active && status) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="card overflow-hidden">
          <div className="relative h-44">
            <img src={U('photo-1574717024653-61fd2cf4d44d', 1400)} alt=""
              onError={imgFallback} className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'grayscale(100%) brightness(0.45)' }} />
            <div className="absolute inset-0 flex flex-col justify-end p-6 text-white">
              <p className="text-[11px] uppercase text-white/70" style={{ letterSpacing: '0.3em' }}>
                Sedang diproses
              </p>
              <h2 className="font-display text-4xl">AI sedang bekerja</h2>
            </div>
          </div>
          <div className="p-6 sm:p-8 space-y-8">
            <ProgressBar status={status} />
            <CancelButton onCancel={cancel} />
          </div>
        </div>
      </div>
    )
  }

  // Done -> nudge to results, or start a fresh generate
  if (status?.status === 'done' && result) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="card overflow-hidden">
          <div className="relative h-60">
            <img src={U('photo-1492619375914-88005aa9e8fb', 1400)} alt=""
              onError={imgFallback} className="absolute inset-0 w-full h-full object-cover"
              style={{ filter: 'grayscale(100%) brightness(0.5)' }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center text-white px-6">
              <p className="text-[11px] uppercase text-white/70" style={{ letterSpacing: '0.3em' }}>
                Selesai
              </p>
              <h2 className="font-display text-5xl sm:text-6xl mt-1">{result.clips.length} klip siap</h2>
              <p className="text-white/85 mt-3 font-light">
                Klip 9:16 siap diedit, diunduh, dan diposting.
              </p>
            </div>
          </div>
          <div className="p-8 flex flex-wrap gap-3 justify-center">
            <button className="btn btn-solid" onClick={() => navigate('/app/results')}>
              Lihat Hasil
            </button>
            <button className="btn btn-outline" onClick={clear}>
              Generate Baru
            </button>
          </div>
        </div>
      </div>
    )
  }

  const STEPS = [
    ['01', 'Upload / tempel link YouTube'],
    ['02', 'AI cari momen paling viral'],
    ['03', 'Crop 9:16, subtitle, hook, efek'],
  ]

  return (
    <div className="max-w-6xl mx-auto px-6 py-10">
      <div className="grid md:grid-cols-2 gap-10 items-stretch">
        {/* Left: editorial visual panel (matches landing aesthetic) */}
        <div className="relative rounded-xl overflow-hidden min-h-[360px] hidden md:block">
          <img src={U('photo-1626785774573-4b799315345d', 1400)} alt=""
            onError={imgFallback} className="absolute inset-0 w-full h-full object-cover"
            style={gray} />
          <div className="absolute inset-0"
            style={{ background: 'linear-gradient(to top, rgba(10,10,10,0.85) 0%, rgba(10,10,10,0.15) 60%, rgba(10,10,10,0.05) 100%)' }} />
          <div className="absolute inset-0 flex flex-col justify-between p-8 text-white">
            <p className="text-[11px] uppercase text-white/70" style={{ letterSpacing: '0.3em' }}>
              ClipStudio
            </p>
            <div>
              <h2 className="font-display text-5xl leading-[0.95]">Ubah panjang<br />jadi viral</h2>
              <ul className="mt-7 space-y-3">
                {STEPS.map(([n, t]) => (
                  <li key={n} className="flex items-center gap-3 text-sm text-white/85">
                    <span className="font-display text-lg text-white/60">{n}</span> {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Right: the actual upload form */}
        <div className="space-y-7 flex flex-col justify-center">
          <div>
            <h1 className="font-display text-5xl sm:text-6xl leading-none">Unggah video</h1>
            <p className="text-gray-mid mt-2">
              Upload file atau tempel link YouTube. AI akan menemukan momen viral.
            </p>
          </div>

          {!hasKey && (
            <ErrorAlert error={{
              message: 'Groq API Key belum diset',
              solution: 'Buka Settings dan masukkan API key dari console.groq.com',
            }} />
          )}
          {(localErr || error) && (
            <ErrorAlert error={localErr || error} onClose={() => setLocalErr(null)} />
          )}

          <Chips label="Mode Crop" value={cropMode} onChange={setCropMode} options={[
            { value: 'track', label: 'Track (face)' },
            { value: 'general', label: 'General (blur)' },
          ]} />

          <UploadZone onFile={(file) => start({ file })} disabled={active} />

          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-gray-border" />
            <span className="text-xs uppercase tracking-widest text-gray-mid">atau</span>
            <div className="flex-1 h-px bg-gray-border" />
          </div>

          <UrlInput onSubmit={(url) => start({ url })} disabled={active} />
        </div>
      </div>
    </div>
  )
}

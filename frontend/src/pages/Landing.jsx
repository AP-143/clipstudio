import { useNavigate } from 'react-router-dom'
import { Check, Sparkles, Captions, Type, Crop } from 'lucide-react'
import Navbar from '../components/Navbar.jsx'

const U = (id, w = 1400) =>
  `https://images.unsplash.com/${id}?w=${w}&q=80&fit=crop`

// Pure monochrome photo treatment — full grayscale.
const gray = { filter: 'grayscale(100%)' }

// Kalau gambar gagal load, sembunyikan img & jadikan kotak hitam
// supaya tidak muncul placeholder/alt-text yang berantakan.
const imgFallback = (e) => {
  e.currentTarget.style.display = 'none'
  if (e.currentTarget.parentElement)
    e.currentTarget.parentElement.style.background = '#0a0a0a'
}

function Hero({ navigate }) {
  return (
    <section className="relative h-screen min-h-[600px] overflow-hidden text-white">
      <img src={U('photo-1626785774573-4b799315345d', 2400)} alt="" onError={imgFallback}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: 'grayscale(100%) contrast(1.02)' }} />
      {/* Light gradient: image stays bright, text stays readable bottom-left. */}
      <div className="absolute inset-0"
        style={{ background: 'linear-gradient(to top right, rgba(10,10,10,0.72) 0%, rgba(10,10,10,0.25) 45%, rgba(10,10,10,0) 75%)' }} />
      {/* Top scrim so the transparent navbar text stays legible. */}
      <div className="absolute inset-x-0 top-0 h-28"
        style={{ background: 'linear-gradient(to bottom, rgba(10,10,10,0.45), rgba(10,10,10,0))' }} />
      <div className="relative h-full w-full px-10 flex flex-col justify-center">
        <p className="text-[11px] uppercase mb-6 text-white/75"
          style={{ letterSpacing: '0.32em' }}>The art of the clip</p>
        <h1 className="font-display font-light text-[52px] sm:text-[84px] leading-[0.95] max-w-3xl"
          style={{ letterSpacing: '0.04em' }}>
          TURN LONG<br />INTO SHORT
        </h1>
        <p className="mt-6 text-lg font-light max-w-md text-white/85">
          Ubah video panjang jadi klip viral 9:16 otomatis dengan AI.
        </p>
        <div className="mt-9 flex flex-wrap gap-4 items-center">
          <button className="btn bg-white text-ink border-white hover:bg-transparent hover:text-white"
            onClick={() => navigate('/app')}>Mulai gratis</button>
          <a href="#cara-kerja"
            className="text-sm border-b border-white/60 pb-1 hover:border-white transition-colors"
            style={{ letterSpacing: '0.04em' }}>
            Lihat cara kerjanya
          </a>
        </div>
      </div>
    </section>
  )
}

function Stats() {
  const stats = [
    ['9:16', 'Format output'], ['2–6', 'Klip per video'],
    ['1080P', 'Kualitas output'], ['GRATIS', 'Biaya platform'],
  ]
  return (
    <section className="max-w-6xl mx-auto px-6 py-16">
      <div className="grid grid-cols-2 md:grid-cols-4 border-t border-l border-line rounded-lg overflow-hidden">
        {stats.map(([n, l]) => (
          <div key={n} className="p-8 text-center border-r border-b border-line">
            <p className="font-display text-5xl">{n}</p>
            <p className="text-sm text-gray-mid mt-1">{l}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Marquee() {
  const items = ['CLIP GENERATOR', 'AUTO SUBTITLE', 'AI VIDEO EFFECTS', '9:16 CROP',
    'FACE TRACKING', 'GROQ AI', 'SELF HOSTED']
  const row = [...items, ...items]
  return (
    <section className="bg-alt py-5 overflow-hidden border-y border-line">
      <div className="marquee-track">
        {row.map((t, i) => (
          <span key={i} className="text-[11px] uppercase text-soft px-7"
            style={{ letterSpacing: '0.18em' }}>{t} ·</span>
        ))}
      </div>
    </section>
  )
}

function HowItWorks() {
  const steps = [
    ['01', 'Upload Video', 'photo-1611532736597-de2d4265fba3', 'Upload file atau tempel link YouTube. Mendukung video hingga 2GB.'],
    ['02', 'AI Analisa', 'photo-1677442135703-1787eea5ce01', 'Whisper transkripsi, Groq (Llama 3.3) deteksi 2–6 momen paling viral.'],
    ['03', 'Edit & Download', 'photo-1593376853899-fbb47a057fa0', 'Atur hook, subtitle, efek, lalu unduh klip 1080×1920 siap publish.'],
  ]
  return (
    <section id="cara-kerja" className="max-w-6xl mx-auto px-6 py-24">
      <p className="label">Prosesnya</p>
      <h2 className="font-display text-5xl sm:text-6xl mb-14 font-light">Cara kerjanya</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
        {steps.map(([n, title, img, desc]) => (
          <div key={n}>
            <div className="aspect-[4/3] border border-line overflow-hidden mb-5 bg-alt rounded-lg">
              <img src={U(img, 800)} alt={title} loading="lazy" onError={imgFallback}
                className="w-full h-full object-cover" style={gray} />
            </div>
            <p className="font-display text-6xl text-gray-border leading-none">{n}</p>
            <h3 className="font-display text-2xl mt-2">{title}</h3>
            <p className="text-sm text-gray-mid mt-2 font-light">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Features() {
  const feats = [
    [Sparkles, 'AI Video Effects', 'Groq menghasilkan filter FFmpeg dinamis otomatis.'],
    [Captions, 'Auto Subtitle', 'Word-level timestamp dari Whisper, 4 gaya viral.'],
    [Type, 'Hook Overlay', 'Badge sumber + teks hook untuk 3 detik pertama.'],
    [Crop, 'Smart 9:16 Crop', 'Face tracking MediaPipe + YOLOv8 fallback.'],
  ]
  return (
    <section id="fitur" className="relative overflow-hidden border-y border-line text-white">
      {/* Full-bleed dark photo backdrop — grayscale, dimmed (CTA-style). */}
      <img src={U('photo-1574717024653-61fd2cf4d44d', 2000)} alt="" onError={imgFallback}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: 'grayscale(100%) brightness(0.4)' }} />
      <div className="absolute inset-0 bg-ink/40" />
      <div className="relative max-w-6xl mx-auto px-6 py-24">
        <p className="label !text-white/70">Apa yang kamu dapat</p>
        <h2 className="font-display text-5xl sm:text-6xl mb-14 font-light">Fitur utama</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 border-t border-l border-white/20 rounded-lg overflow-hidden">
          {feats.map(([Icon, title, desc]) => (
            <div key={title} className="p-10 border-r border-b border-white/20">
              <Icon size={32} />
              <h3 className="font-display text-3xl mt-4">{title}</h3>
              <p className="text-white/70 mt-2 font-light">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Split({ img, reverse, label, title, desc, items }) {
  const Photo = (
    <div className="aspect-[4/3] overflow-hidden border border-line bg-alt rounded-lg">
      <img src={U(img, 1000)} alt={title} loading="lazy" onError={imgFallback}
        className="w-full h-full object-cover" style={gray} />
    </div>
  )
  const Text = (
    <div className="flex flex-col justify-center">
      {label && <p className="label">{label}</p>}
      <h2 className="font-display text-5xl font-light">{title}</h2>
      <p className="text-gray-mid mt-5 font-light leading-relaxed">{desc}</p>
      <ul className="mt-7 space-y-3">
        {items.map((it) => (
          <li key={it} className="flex items-center gap-3 text-sm">
            <Check size={15} className="shrink-0 text-clay" /> {it}
          </li>
        ))}
      </ul>
    </div>
  )
  return (
    <section className="max-w-5xl mx-auto px-6 py-20">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        {reverse ? <>{Text}{Photo}</> : <>{Photo}{Text}</>}
      </div>
    </section>
  )
}

function Stack() {
  const items = ['FastAPI', 'React + Vite', 'Whisper', 'Groq',
    'FFmpeg', 'MediaPipe', 'Docker', 'YOLOv8']
  return (
    <section id="stack" className="relative overflow-hidden border-y border-line text-white">
      {/* Full-bleed dark photo backdrop — grayscale, dimmed (CTA-style). */}
      <img src={U('photo-1518770660439-4636190af475', 2000)} alt="" onError={imgFallback}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: 'grayscale(100%) brightness(0.4)' }} />
      <div className="absolute inset-0 bg-ink/40" />
      <div className="relative max-w-6xl mx-auto px-6 py-24">
        <p className="label !text-white/70">Dibangun dengan</p>
        <h2 className="font-display text-5xl sm:text-6xl mb-14 font-light">Teknologi</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 border-t border-l border-white/20 rounded-lg overflow-hidden">
          {items.map((s) => (
            <div key={s}
              className="p-10 text-center font-display text-3xl border-r border-b border-white/20">
              {s}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function CTA({ navigate }) {
  return (
    <section className="relative h-[460px] flex items-center justify-center text-white border-b border-line overflow-hidden">
      <img src={U('photo-1492724441997-5dc865305da7')} alt="" onError={imgFallback}
        className="absolute inset-0 w-full h-full object-cover"
        style={{ filter: 'grayscale(100%) brightness(0.34)' }} />
      <div className="relative text-center px-6">
        <p className="label !text-white/70 mb-5">Mulai sekarang</p>
        <h2 className="font-display text-5xl sm:text-7xl font-light">Siap buat konten viral?</h2>
        <p className="mt-4 font-light text-white/85">Self-hosted · Open source · Gratis selamanya</p>
        <button className="btn bg-white text-ink border-white mt-9 hover:bg-transparent hover:text-white"
          onClick={() => navigate('/app')}>
          Mulai sekarang — gratis
        </button>
      </div>
    </section>
  )
}

function Quote() {
  return (
    <section className="border-y border-line bg-alt">
      <div className="max-w-3xl mx-auto px-6 py-24 text-center">
        <p className="label">Filosofinya</p>
        <blockquote className="font-display text-3xl sm:text-5xl font-light leading-tight mt-2">
          “Konten panjang menyimpan momen terbaik —
          tugas kami menemukannya, lalu menyerahkannya padamu dalam 9:16.”
        </blockquote>
        <p className="text-gray-mid mt-8 font-light text-sm uppercase"
          style={{ letterSpacing: '0.18em' }}>
          Self-hosted · Tanpa langganan · Tanpa batas
        </p>
      </div>
    </section>
  )
}

function Footer() {
  const cols = [
    ['Produk', ['Cara kerja', 'Fitur', 'Teknologi', 'Mulai sekarang']],
    ['Sumber', ['Dokumentasi', 'GitHub', 'Self-hosted guide', 'Lisensi']],
    ['Bantuan', ['FAQ', 'Kontak', 'Privasi', 'Syarat']],
  ]
  return (
    <footer className="border-t border-line">
      <div className="max-w-6xl mx-auto px-6 py-20 grid grid-cols-1 md:grid-cols-2 gap-12">
        <div>
          <span className="font-display text-3xl text-ink">CLIPSTUDIO</span>
          <p className="text-sm text-gray-mid mt-4 max-w-xs font-light leading-relaxed">
            Platform AI video clip generator self-hosted. Ubah video panjang
            jadi klip viral 9:16 — gratis, open source.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-6">
          {cols.map(([head, links]) => (
            <div key={head}>
              <p className="label">{head}</p>
              <ul className="space-y-3">
                {links.map((l) => (
                  <li key={l}>
                    <a href="#" className="text-sm hover:text-clay transition-colors">{l}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="bg-clay text-white text-center py-3 text-[11px] uppercase"
        style={{ letterSpacing: '0.22em' }}>
        Self-hosted · Open source · Gratis selamanya — Sejak 2026
      </div>
    </footer>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  return (
    <div>
      <Navbar />
      <Hero navigate={navigate} />
      <Stats />
      <Marquee />
      <HowItWorks />
      <Features />
      <Split img="photo-1492619375914-88005aa9e8fb"
        label="Efek otomatis"
        title="AI video effects"
        desc="Groq (Llama 3.3) menganalisa konten dan menghasilkan filter FFmpeg dinamis — zoom, vignette, color pop — tanpa kerja manual."
        items={['Filter dihasilkan AI', 'Editable filter string', 'Preview 1 frame instan']} />
      <Split img="photo-1542744094-3a31f272c490" reverse
        label="Teks otomatis"
        title="Auto subtitle"
        desc="Subtitle word-level akurat dari Whisper, dibakar langsung ke video dalam 4 gaya viral."
        items={['Word by Word', 'Pop · Glow · Karaoke', 'Warna & posisi custom']} />
      <Stack />
      <Quote />
      <CTA navigate={navigate} />
      <Footer />
    </div>
  )
}

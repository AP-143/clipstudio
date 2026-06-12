import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { useJob } from '../hooks/useJob.js'

const appTabs = [
  { to: '/app', label: 'Upload', end: true },
  { to: '/app/results', label: 'Hasil' },
  { to: '/app/history', label: 'Riwayat' },
  { to: '/app/settings', label: 'Settings' },
]

// Small live processing pill, visible on every app tab and clickable to jump
// back to the progress view so an in-flight job is never "lost".
function JobIndicator() {
  const navigate = useNavigate()
  const { status, active } = useJob()
  if (!active || !status) return null
  return (
    <button onClick={() => navigate('/app')}
      className="flex items-center gap-1.5 text-[11px] uppercase text-ink border border-line
        rounded-full pl-2 pr-2.5 py-1 hover:border-faint transition-colors"
      style={{ letterSpacing: '0.1em' }}>
      <Loader2 size={12} className="animate-spin" />
      {status.progress || 0}%
    </button>
  )
}

export default function Navbar({ app = false }) {
  const navigate = useNavigate()
  const [scrolled, setScrolled] = useState(false)

  // On the landing page the navbar floats transparently over the hero photo
  // and turns solid white once you scroll past it.
  useEffect(() => {
    if (app) return
    const onScroll = () => setScrolled(window.scrollY > 60)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [app])

  const overlay = !app && !scrolled  // transparent, light-on-dark mode

  const headerClass = app
    ? 'sticky top-0 bg-white border-b border-line'
    : `fixed top-0 left-0 right-0 ${overlay
        ? 'bg-transparent'
        : 'bg-white border-b border-line'}`

  return (
    <header className={`z-40 transition-colors duration-300 ${headerClass}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
        {/* Left group: logo + (on landing) section links — yonobi style. */}
        <div className="flex items-center gap-4 sm:gap-10 min-w-0">
          <Link to="/"
            className={`font-display text-lg sm:text-2xl shrink-0 transition-all duration-300 active:scale-95 ${overlay ? 'text-white' : 'text-ink'}`}
            style={{ letterSpacing: '0.18em' }}>
            CLIPSTUDIO
          </Link>

          {!app && (
            <nav className={`hidden md:flex items-center gap-8 text-[11px] uppercase transition-colors duration-300 ${overlay ? 'text-white/80' : 'text-soft'}`}
              style={{ letterSpacing: '0.12em' }}>
              <a href="#cara-kerja" className={overlay ? 'hover:text-white' : 'hover:text-ink'}>Cara Kerja</a>
              <a href="#fitur" className={overlay ? 'hover:text-white' : 'hover:text-ink'}>Fitur</a>
              <a href="#stack" className={overlay ? 'hover:text-white' : 'hover:text-ink'}>Stack</a>
            </nav>
          )}
        </div>

        {/* Right side: dashboard tabs, or landing CTA. */}
        {app ? (
          <nav className="flex items-center gap-3 sm:gap-6 overflow-x-auto no-scrollbar">
            <JobIndicator />
            {appTabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className={({ isActive }) =>
                  `text-[11px] uppercase pb-1 border-b whitespace-nowrap shrink-0 transition-all duration-300 active:opacity-50 ` +
                  (isActive
                    ? 'text-ink border-ink'
                    : 'text-soft border-transparent hover:text-ink')
                }
                style={{ letterSpacing: '0.12em' }}
              >
                {t.label}
              </NavLink>
            ))}
          </nav>
        ) : (
          <button
            className={(overlay
              ? 'btn bg-transparent text-white border border-white hover:bg-white hover:text-ink'
              : 'btn btn-solid') + ' shrink-0 active:scale-95 transition-transform'}
            onClick={() => navigate('/app')}>
            Mulai Sekarang
          </button>
        )}
      </div>
    </header>
  )
}

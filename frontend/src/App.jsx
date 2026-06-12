import { Routes, Route, useLocation } from 'react-router-dom'
import Landing from './pages/Landing.jsx'
import Upload from './pages/Upload.jsx'
import Results from './pages/Results.jsx'
import History from './pages/History.jsx'
import Settings from './pages/Settings.jsx'
import Navbar from './components/Navbar.jsx'
import { JobProvider } from './hooks/useJob.js'

function AppShell({ children }) {
  const location = useLocation()
  return (
    <JobProvider>
      <div className="min-h-screen flex flex-col">
        <Navbar app />
        {/* key re-triggers the fade on each navigation so pages ease in softly */}
        <main key={location.pathname} className="flex-1 page-enter">{children}</main>
      </div>
    </JobProvider>
  )
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/app" element={<AppShell><Upload /></AppShell>} />
      <Route path="/app/results" element={<AppShell><Results /></AppShell>} />
      <Route path="/app/history" element={<AppShell><History /></AppShell>} />
      <Route path="/app/settings" element={<AppShell><Settings /></AppShell>} />
    </Routes>
  )
}

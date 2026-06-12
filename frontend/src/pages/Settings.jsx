import { useState } from 'react'
import { Eye, EyeOff, Check, X } from 'lucide-react'
import { api } from '../config.js'
import { useSettings } from '../hooks/useSettings.js'
import Chips from '../components/Chips.jsx'

export default function Settings() {
  const { settings, update, groqKey, saveKey, cookies, saveCookies } = useSettings()
  const [keyInput, setKeyInput] = useState(groqKey)
  const [cookieInput, setCookieInput] = useState(cookies)
  const [show, setShow] = useState(false)
  const [test, setTest] = useState(null) // null | 'testing' | 'ok' | 'fail'
  const [testMsg, setTestMsg] = useState('')
  const [saved, setSaved] = useState(false)

  const testKey = async () => {
    saveKey(keyInput)
    setTest('testing'); setTestMsg('')
    try {
      const res = await api('/api/validate-key', { method: 'POST' })
      if (res.ok) { setTest('ok'); setTestMsg(res.reply || 'Terhubung') }
      else { setTest('fail'); setTestMsg('Gagal') }
    } catch (e) {
      setTest('fail')
      setTestMsg([e.message, e.detail].filter(Boolean).join(' — ') || 'Gagal terhubung')
    }
  }

  const save = () => {
    saveKey(keyInput)
    saveCookies(cookieInput)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-12 space-y-10">
      <h1 className="font-display text-4xl sm:text-6xl leading-none">Pengaturan</h1>

      {/* Groq key */}
      <section className="space-y-3">
        <span className="label">Groq API Key</span>
        <div className="flex items-center border border-line">
          <input className="flex-1 px-4 py-3 outline-none text-sm bg-transparent"
            type={show ? 'text' : 'password'} value={keyInput}
            placeholder="gsk_..." onChange={(e) => setKeyInput(e.target.value)} />
          <button className="px-3" onClick={() => setShow((s) => !s)}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn btn-outline" onClick={testKey}
            disabled={!keyInput || test === 'testing'}>
            {test === 'testing' ? 'Menguji...' : 'Test Connection'}
          </button>
          {test === 'ok' && <span className="flex items-center gap-1 text-sm"><Check size={16} /> {testMsg}</span>}
          {test === 'fail' && <span className="flex items-center gap-1 text-sm"><X size={16} /> {testMsg}</span>}
        </div>
        <p className="text-xs text-gray-mid">
          Dapatkan key gratis di console.groq.com. Key hanya disimpan di browser ini.
        </p>
      </section>

      {/* Cookies */}
      <section className="space-y-3">
        <span className="label">YouTube Cookies (opsional)</span>
        <textarea className="input min-h-[100px] font-mono text-xs" value={cookieInput}
          placeholder="# Netscape HTTP Cookie File..."
          onChange={(e) => setCookieInput(e.target.value)} />
        <p className="text-xs text-gray-mid">
          Untuk membuka unduhan 1080p. Export via ekstensi "Get cookies.txt".
        </p>
      </section>

      {/* Preferences */}
      <section className="space-y-5">
        <Chips label="Default Gaya Subtitle" value={settings.subtitleStyle}
          onChange={(v) => update({ subtitleStyle: v })} options={[
            { value: 'word_by_word', label: 'Word by Word' }, { value: 'pop', label: 'Pop' },
            { value: 'glow', label: 'Glow' }, { value: 'karaoke', label: 'Karaoke' },
          ]} />
        <Chips label="Default Mode Crop" value={settings.cropMode}
          onChange={(v) => update({ cropMode: v })} options={[
            { value: 'track', label: 'Track' }, { value: 'general', label: 'General' },
          ]} />
        <Chips label="Bahasa Whisper" value={settings.language}
          onChange={(v) => update({ language: v })} options={[
            { value: 'auto', label: 'Auto-detect' }, { value: 'id', label: 'Indonesia' },
            { value: 'en', label: 'English' },
          ]} />
        <Chips label="Auto-delete Jobs" value={settings.autoDeleteHours}
          onChange={(v) => update({ autoDeleteHours: v })} options={[
            { value: 1, label: '1 jam' }, { value: 6, label: '6 jam' },
            { value: 24, label: '24 jam' }, { value: 0, label: 'Never' },
          ]} />
      </section>

      <button className="btn btn-solid" onClick={save}>
        {saved ? 'Tersimpan ✓' : 'Simpan'}
      </button>
    </div>
  )
}

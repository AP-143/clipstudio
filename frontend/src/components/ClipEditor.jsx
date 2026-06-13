import { useEffect, useMemo, useRef, useState } from 'react'
import { Player } from '@remotion/player'
import { Download, Sparkles, Copy, Check, Type, RotateCcw, Music } from 'lucide-react'
import { API_BASE, api } from '../config.js'
import { ShortVideo } from '../remotion/ShortVideo.jsx'
import { buildShortProps } from '../remotion/buildProps.js'
import { renderInBrowser, downloadBlobUrl } from '../remotion/renderInBrowser.js'
import Chips, { ColorChips } from './Chips.jsx'

const BADGE_COLORS = [
  { value: '#2D7FF9', label: 'Biru', hex: '#2D7FF9' },
  { value: '#0a0a0a', label: 'Hitam', hex: '#0a0a0a' },
  { value: '#E53935', label: 'Merah', hex: '#E53935' },
  { value: '#2E7D32', label: 'Hijau', hex: '#2E7D32' },
  { value: '#7B1FA2', label: 'Ungu', hex: '#7B1FA2' },
  { value: '#F57C00', label: 'Oranye', hex: '#F57C00' },
]
const SUB_COLORS = [
  { value: '#FFFFFF', label: 'Putih', hex: '#FFFFFF' },
  { value: '#FFDD00', label: 'Kuning', hex: '#FFDD00' },
  { value: '#39E0A5', label: 'Hijau', hex: '#39E0A5' },
  { value: '#36C5FF', label: 'Cyan', hex: '#36C5FF' },
]
const TABS = [
  { id: 'auto', label: 'Auto' }, { id: 'sub', label: 'Subtitle' },
  { id: 'hook', label: 'Hook' },
  { id: 'trim', label: 'Trim' }, { id: 'music', label: 'Musik' },
  { id: 'caption', label: 'Teks' },
]

export default function ClipEditor({ jobId, clip, channel }) {
  const [captions, setCaptions] = useState([])
  const [durationSec, setDurationSec] = useState(clip.duration || 10)
  const [fps, setFps] = useState(30)
  const [videoUrl, setVideoUrl] = useState(null)
  const [tab, setTab] = useState('auto')

  const [subOn, setSubOn] = useState(true)
  const [subPos, setSubPos] = useState('bottom')
  const [subColor, setSubColor] = useState('#FFFFFF')
  const [subHi, setSubHi] = useState('#FFDD00')
  const [subAnim, setSubAnim] = useState('pop')
  const [subSize, setSubSize] = useState('M')
  const [subFont, setSubFont] = useState('Impact')
  const [subBg, setSubBg] = useState('none')
  const [subStyleBusy, setSubStyleBusy] = useState(false)

  const [hookOn, setHookOn] = useState(!!clip.hook_text)
  const [hookText, setHookText] = useState(clip.hook_text || '')
  const [badgeText, setBadgeText] = useState(`Source: ${channel || 'Unknown'}`)
  const [badgeColor, setBadgeColor] = useState('#2D7FF9')
  const [hookTemplate, setHookTemplate] = useState('box')
  const [hookTextColor, setHookTextColor] = useState('#FFFFFF')
  const [hookAlign, setHookAlign] = useState('center')
  const [hookPosY, setHookPosY] = useState(16)
  const [hookSize, setHookSize] = useState('M')
  const [hookDur, setHookDur] = useState(3)
  const [hookGenBusy, setHookGenBusy] = useState(false)

  const [autoBusy, setAutoBusy] = useState(false)
  const [autoErr, setAutoErr] = useState(null)

  const [trimIn, setTrimIn] = useState(0)
  const [trimOut, setTrimOut] = useState(null) // null => durationSec

  const [musicUrl, setMusicUrl] = useState(null) // blob (session only)
  const [musicName, setMusicName] = useState('')
  const [musicVolume, setMusicVolume] = useState(0.5)

  const [cap, setCap] = useState(null)
  const [capBusy, setCapBusy] = useState(false)
  const [capErr, setCapErr] = useState(null)
  const [copied, setCopied] = useState(null)

  const [rendering, setRendering] = useState(null)
  const [renderErr, setRenderErr] = useState(null)
  const [saved, setSaved] = useState(false)
  const loadedRef = useRef(false)

  // --- load captions + fps + clip blob -------------------------------------
  useEffect(() => {
    api(`/api/clip/${jobId}/${clip.index}/captions`).then((r) => {
      setCaptions(r.captions || [])
      if (r.durationSec) setDurationSec(r.durationSec)
      if (r.fps) setFps(r.fps)
    }).catch(() => {})
  }, [jobId, clip.index])

  useEffect(() => {
    let url = null, alive = true
    fetch(`${API_BASE}/api/clip/${jobId}/${clip.index}/web`)
      .then((r) => r.blob())
      .then((b) => { if (alive) { url = URL.createObjectURL(b); setVideoUrl(url) } })
      .catch(() => {})
    return () => { alive = false; if (url) URL.revokeObjectURL(url) }
  }, [jobId, clip.index])

  // --- restore saved config once -------------------------------------------
  useEffect(() => {
    const c = clip.editConfig
    if (c) {
      if (c.subOn != null) setSubOn(c.subOn)
      if (c.subPos) setSubPos(c.subPos)
      if (c.subColor) setSubColor(c.subColor)
      if (c.subHi) setSubHi(c.subHi)
      if (c.subAnim) setSubAnim(c.subAnim)
      if (c.subSize) setSubSize(c.subSize)
      if (c.subFont) setSubFont(c.subFont)
      if (c.subBg) setSubBg(c.subBg)
      if (c.hookOn != null) setHookOn(c.hookOn)
      if (c.hookText != null) setHookText(c.hookText)
      if (c.badgeText != null) setBadgeText(c.badgeText)
      if (c.badgeColor) setBadgeColor(c.badgeColor)
      if (c.hookTemplate) setHookTemplate(c.hookTemplate)
      if (c.hookTextColor) setHookTextColor(c.hookTextColor)
      if (c.hookAlign) setHookAlign(c.hookAlign)
      if (typeof c.hookPosY === 'number') setHookPosY(c.hookPosY)
      if (c.hookSize) setHookSize(c.hookSize)
      if (c.hookDur != null) setHookDur(c.hookDur)
      if (c.trimIn != null) setTrimIn(c.trimIn)
      if (c.trimOut !== undefined) setTrimOut(c.trimOut)
      if (c.musicVolume != null) setMusicVolume(c.musicVolume)
      if (c.cap) setCap(c.cap)
    }
    loadedRef.current = true
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  const cfg = useMemo(() => ({
    subOn, subPos, subColor, subHi, subAnim, subSize, subFont, subBg,
    hookOn, hookText, badgeText, badgeColor, hookTemplate, hookTextColor, hookAlign, hookPosY, hookSize, hookDur,
    trimIn, trimOut, musicVolume, cap,
  }), [subOn, subPos, subColor, subHi, subAnim, subSize, subFont, subBg, hookOn, hookText, badgeText,
    badgeColor, hookTemplate, hookTextColor, hookAlign, hookPosY, hookSize, hookDur, trimIn, trimOut, musicVolume, cap])

  // --- debounced persist ---------------------------------------------------
  useEffect(() => {
    if (!loadedRef.current) return
    const id = setTimeout(() => {
      api(`/api/clip/${jobId}/${clip.index}/edit-config`, { method: 'POST', json: cfg })
        .then(() => { setSaved(true); setTimeout(() => setSaved(false), 1200) })
        .catch(() => {})
    }, 700)
    return () => clearTimeout(id)
  }, [cfg, jobId, clip.index])

  const { inputProps, durationInSeconds } = useMemo(
    () => buildShortProps(cfg, { captions, durationSec, fps, videoUrl, musicUrl }),
    [cfg, captions, durationSec, fps, videoUrl, musicUrl])
  const durationInFrames = Math.max(1, Math.round(durationInSeconds * fps))

  // --- actions -------------------------------------------------------------
  const runAuto = async () => {
    setAutoBusy(true); setAutoErr(null)
    try {
      const [s, h] = await Promise.all([
        api(`/api/clip/${jobId}/${clip.index}/subtitle-style`, { method: 'POST' }),
        api(`/api/clip/${jobId}/${clip.index}/hook-text`, { method: 'POST' }),
      ])
      if (s.fontColor) setSubColor(s.fontColor)
      if (s.highlightColor) setSubHi(s.highlightColor)
      if (s.animation) setSubAnim(s.animation)
      if (s.position) setSubPos(s.position)
      if (s.size) setSubSize(s.size)
      setSubOn(true)
      if (h.hook) setHookText(h.hook)
      if (h.badgeText != null) setBadgeText(h.badgeText)
      if (h.badgeColor) setBadgeColor(h.badgeColor)
      if (h.template) setHookTemplate(h.template)
      if (h.size) setHookSize(h.size)
      setHookOn(true)
    } catch (e) {
      setAutoErr([e?.message, e?.solution].filter(Boolean).join(' — ') || 'Auto AI gagal')
    } finally { setAutoBusy(false) }
  }
  const regenHook = async () => {
    setHookGenBusy(true)
    try {
      const r = await api(`/api/clip/${jobId}/${clip.index}/hook-text`, { method: 'POST' })
      if (r.hook) setHookText(r.hook)
      if (r.badgeText != null) setBadgeText(r.badgeText)
      if (r.badgeColor) setBadgeColor(r.badgeColor)
      if (r.template) setHookTemplate(r.template)
      if (r.size) setHookSize(r.size)
      setHookOn(true)
    } catch { /* ignore */ } finally { setHookGenBusy(false) }
  }
  const genSubStyle = async () => {
    setSubStyleBusy(true)
    try {
      const r = await api(`/api/clip/${jobId}/${clip.index}/subtitle-style`, { method: 'POST' })
      if (r.fontColor) setSubColor(r.fontColor)
      if (r.highlightColor) setSubHi(r.highlightColor)
      if (r.animation) setSubAnim(r.animation)
      if (r.position) setSubPos(r.position)
      if (r.size) setSubSize(r.size)
      setSubOn(true)
    } catch { /* ignore */ } finally { setSubStyleBusy(false) }
  }
  const runCaption = async () => {
    setCapBusy(true); setCapErr(null)
    try { setCap(await api(`/api/clip/${jobId}/${clip.index}/caption`, { method: 'POST' })) }
    catch (e) { setCapErr([e?.message, e?.solution].filter(Boolean).join(' — ') || 'Gagal') }
    finally { setCapBusy(false) }
  }
  const onMusicFile = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (musicUrl) URL.revokeObjectURL(musicUrl)
    setMusicUrl(URL.createObjectURL(f)); setMusicName(f.name)
  }
  const copy = (text, key) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(key); setTimeout(() => setCopied(null), 1500)
    }).catch(() => {})
  }
  const resetAll = () => {
    setSubOn(false); setHookOn(false)
    setCap(null); setAutoErr(null); setCapErr(null)
    setSubPos('bottom'); setSubColor('#FFFFFF'); setSubHi('#FFDD00'); setSubAnim('pop'); setSubSize('M')
    setSubFont('Impact'); setSubBg('none')
    setHookTemplate('box'); setHookTextColor('#FFFFFF'); setHookAlign('center')
    setHookPosY(16); setHookSize('M'); setHookDur(3); setBadgeColor('#2D7FF9')
    setHookText(clip.hook_text || ''); setBadgeText(`Source: ${channel || 'Unknown'}`)
    setTrimIn(0); setTrimOut(null)
    if (musicUrl) URL.revokeObjectURL(musicUrl)
    setMusicUrl(null); setMusicName('')
  }
  const hasEdits = subOn || hookOn || cap || trimIn > 0 || trimOut != null || musicUrl

  const doRender = async () => {
    if (!videoUrl) return
    setRendering({ pct: 0 }); setRenderErr(null)
    try {
      const url = await renderInBrowser({
        videoUrl: inputProps.videoUrl, durationInSeconds, fps,
        trimBefore: inputProps.trimBefore, subtitles: inputProps.subtitles,
        hook: inputProps.hook, effects: inputProps.effects, music: inputProps.music,
        onProgress: (p) => setRendering({ pct: Math.round(p * 100) }),
      })
      const name = (clip.title || 'clip').replace(/[^\w\s-]/g, '').trim().slice(0, 60) || 'clip'
      downloadBlobUrl(url, `${name}.mp4`)
    } catch (e) { setRenderErr(e?.message || 'Render gagal') }
    finally { setRendering(null) }
  }

  const trimEndVal = trimOut != null ? trimOut : durationSec

  return (
    <div className="p-4 space-y-4 bg-alt rounded-b-lg">
      <div className="flex items-center justify-between">
        <h4 className="font-display text-xl">Editor {saved && <span className="text-[10px] text-green-500 align-middle">✓ tersimpan</span>}</h4>
        <button onClick={resetAll} disabled={!hasEdits}
          className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-soft hover:text-red-400 disabled:opacity-40 transition-colors">
          <RotateCcw size={13} /> Hapus editan
        </button>
      </div>

      <div className="rounded-lg overflow-hidden mx-auto bg-ink flex items-center justify-center max-w-full"
        style={{ width: 250, height: 444 }}>
        {videoUrl ? (
          <Player component={ShortVideo} inputProps={inputProps}
            durationInFrames={durationInFrames} fps={fps}
            compositionWidth={1080} compositionHeight={1920}
            style={{ width: 250, height: 444 }} controls loop />
        ) : <span className="text-white/60 text-xs">Memuat video…</span>}
      </div>

      <div className="flex gap-1 border-b border-line overflow-x-auto no-scrollbar">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-2.5 py-2 text-[11px] uppercase tracking-wide border-b-2 -mb-px whitespace-nowrap transition-colors
              ${tab === t.id ? 'border-ink text-ink font-medium' : 'border-transparent text-soft hover:text-ink'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="min-h-[150px] space-y-4">
        {tab === 'auto' && (
          <div className="space-y-3">
            <p className="text-xs text-gray-mid">Sekali klik: AI analisa klip lalu bikin subtitle (gaya otomatis) + hook (teks & gaya otomatis).</p>
            <button className="btn btn-solid w-full" onClick={runAuto} disabled={autoBusy}>
              <Sparkles size={15} />{autoBusy ? 'Menganalisa (Groq)…' : 'Auto AI'}
            </button>
            {autoErr && <p className="text-xs text-red-400 break-all">{autoErr}</p>}
          </div>
        )}

        {tab === 'sub' && (
          <div className="space-y-4">
            <Toggle label="Subtitle" on={subOn} setOn={setSubOn} />
            {subOn && (
              <>
                <button className="btn btn-solid w-full" onClick={genSubStyle} disabled={subStyleBusy}>
                  <Sparkles size={15} />{subStyleBusy ? 'Menganalisa (Groq)…' : 'AI: buatkan gaya subtitle'}
                </button>
                <p className="text-[11px] text-gray-mid">AI analisa vibe klip lalu pilih warna, animasi & posisi sendiri. Atur manual di bawah kalau mau ubah.</p>
                <details className="border-t border-line pt-2">
                  <summary className="label cursor-pointer select-none">Atur manual (opsional)</summary>
                  <div className="space-y-4 pt-3">
                    <Chips label="Posisi" value={subPos} onChange={setSubPos} options={[
                      { value: 'top', label: 'Atas' }, { value: 'middle', label: 'Tengah' }, { value: 'bottom', label: 'Bawah' }]} />
                    <div>
                      <span className="label">Warna teks</span>
                      <ColorChips value={subColor} colors={SUB_COLORS} onChange={setSubColor} />
                    </div>
                    <div>
                      <span className="label">Warna kata aktif (highlight)</span>
                      <div className="flex items-center gap-3">
                        <ColorChips value={subHi} colors={SUB_COLORS} onChange={setSubHi} />
                        <input type="color" value={subHi} onChange={(e) => setSubHi(e.target.value)} title="Custom"
                          className="w-8 h-8 rounded border border-line bg-transparent cursor-pointer p-0" />
                      </div>
                    </div>
                    <Chips label="Animasi" value={subAnim} onChange={setSubAnim} options={[
                      { value: 'pop', label: 'Pop' }, { value: 'word-highlight', label: 'Glow' },
                      { value: 'karaoke', label: 'Karaoke' }, { value: 'word-by-word', label: 'Per Kata' },
                      { value: 'none', label: 'Polos' }]} />
                    <Chips label="Font" value={subFont} onChange={setSubFont} options={[
                      { value: 'Impact', label: 'Impact' }, { value: 'Inter', label: 'Inter' },
                      { value: 'Arial', label: 'Arial' }, { value: 'Georgia', label: 'Serif' }]} />
                    <Chips label="Latar teks" value={subBg} onChange={setSubBg} options={[
                      { value: 'none', label: 'Tanpa' }, { value: 'box', label: 'Kotak gelap' }]} />
                    <Chips label="Ukuran" value={subSize} onChange={setSubSize} options={[
                      { value: 'S', label: 'Kecil' }, { value: 'M', label: 'Sedang' }, { value: 'L', label: 'Besar' }]} />
                  </div>
                </details>
              </>
            )}
          </div>
        )}

        {tab === 'hook' && (
          <div className="space-y-4">
            <Toggle label="Hook" on={hookOn} setOn={setHookOn} />
            {hookOn && (
              <>
                <button className="btn btn-solid w-full" onClick={regenHook} disabled={hookGenBusy}>
                  <Sparkles size={15} />{hookGenBusy ? 'Membuat (Groq)…' : 'AI: buat hook + gaya'}
                </button>
                <p className="text-[11px] text-gray-mid">AI bikin teks hook + pilih badge, warna & template. Edit manual di bawah kalau mau.</p>

                <Chips label="Template" value={hookTemplate} onChange={setHookTemplate} options={[
                  { value: 'box', label: 'Box' }, { value: 'minimal', label: 'Minimal' },
                  { value: 'bar', label: 'Bar' }, { value: 'outline', label: 'Garis' }]} />

                <div>
                  <span className="label">Teks hook</span>
                  <textarea className="input min-h-[60px]" value={hookText} onChange={(e) => setHookText(e.target.value)} placeholder="Judul hook…" />
                </div>
                <div>
                  <span className="label">Badge</span>
                  <input className="input" value={badgeText} onChange={(e) => setBadgeText(e.target.value)} placeholder="Source: … / BREAKING / kosong" />
                </div>
                <div>
                  <span className="label">Warna badge</span>
                  <div className="flex items-center gap-3">
                    <ColorChips value={badgeColor} colors={BADGE_COLORS} onChange={setBadgeColor} />
                    <input type="color" value={badgeColor} onChange={(e) => setBadgeColor(e.target.value)} title="Custom"
                      className="w-8 h-8 rounded border border-line bg-transparent cursor-pointer p-0" />
                  </div>
                </div>

                {hookTemplate !== 'box' && (
                  <div>
                    <span className="label">Warna teks</span>
                    <div className="flex items-center gap-3">
                      <ColorChips value={hookTextColor} colors={SUB_COLORS} onChange={setHookTextColor} />
                      <input type="color" value={hookTextColor} onChange={(e) => setHookTextColor(e.target.value)} title="Custom"
                        className="w-8 h-8 rounded border border-line bg-transparent cursor-pointer p-0" />
                    </div>
                  </div>
                )}
                <Chips label="Perataan" value={hookAlign} onChange={setHookAlign} options={[
                  { value: 'left', label: 'Kiri' }, { value: 'center', label: 'Tengah' }, { value: 'right', label: 'Kanan' }]} />
                <div>
                  <span className="label">Posisi vertikal: {hookPosY}%</span>
                  <input type="range" min={4} max={92} step={1} value={hookPosY}
                    onChange={(e) => setHookPosY(parseInt(e.target.value, 10))} className="w-full" />
                  <div className="flex gap-2 flex-wrap mt-2">
                    {[['Atas', 16], ['Tengah', 48], ['Bawah', 82]].map(([l, y]) => (
                      <button key={l} onClick={() => setHookPosY(y)}
                        className="text-[11px] px-2.5 py-1 rounded-full border border-line hover:border-faint">{l}</button>
                    ))}
                  </div>
                </div>

                <Chips label="Ukuran" value={hookSize} onChange={setHookSize} options={[
                  { value: 'S', label: 'Kecil' }, { value: 'M', label: 'Sedang' }, { value: 'L', label: 'Besar' }]} />
                <Chips label="Durasi tampil" value={hookDur} onChange={setHookDur} options={[
                  { value: 3, label: '3 dtk' }, { value: 5, label: '5 dtk' }, { value: 'full', label: 'Sepanjang' }]} />
              </>
            )}
          </div>
        )}

        {tab === 'trim' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-mid">Potong awal/akhir klip. Durasi: <b>{durationInSeconds.toFixed(1)}s</b> dari {durationSec.toFixed(1)}s.</p>
            <div>
              <span className="label">Mulai: {trimIn.toFixed(1)}s</span>
              <input type="range" min={0} max={Math.max(0, durationSec - 0.5)} step={0.1} value={trimIn}
                onChange={(e) => setTrimIn(Math.min(parseFloat(e.target.value), trimEndVal - 0.5))} className="w-full" />
            </div>
            <div>
              <span className="label">Selesai: {trimEndVal.toFixed(1)}s</span>
              <input type="range" min={0.5} max={durationSec} step={0.1} value={trimEndVal}
                onChange={(e) => setTrimOut(Math.max(parseFloat(e.target.value), trimIn + 0.5))} className="w-full" />
            </div>
            <button className="btn-link text-xs" onClick={() => { setTrimIn(0); setTrimOut(null) }}>Reset trim</button>
          </div>
        )}

        {tab === 'music' && (
          <div className="space-y-4">
            <label className="btn btn-outline w-full cursor-pointer">
              <Music size={15} /> {musicName ? 'Ganti musik' : 'Pilih file musik'}
              <input type="file" accept="audio/*" onChange={onMusicFile} className="hidden" />
            </label>
            {musicName && (
              <>
                <p className="text-xs text-gray-mid truncate">🎵 {musicName}</p>
                <div>
                  <span className="label">Volume musik: {Math.round(musicVolume * 100)}%</span>
                  <input type="range" min={0} max={1} step={0.05} value={musicVolume}
                    onChange={(e) => setMusicVolume(parseFloat(e.target.value))} className="w-full" />
                </div>
                <button className="btn-link text-xs" onClick={() => { if (musicUrl) URL.revokeObjectURL(musicUrl); setMusicUrl(null); setMusicName('') }}>Hapus musik</button>
              </>
            )}
            <p className="text-[11px] text-gray-mid">Musik dari file lokal (belum tersimpan permanen, pilih ulang tiap sesi).</p>
          </div>
        )}

        {tab === 'caption' && (
          <div className="space-y-3">
            <button className="btn btn-outline w-full" onClick={runCaption} disabled={capBusy}>
              <Type size={15} />{capBusy ? 'Membuat (Groq)…' : 'Buat Caption & Judul (AI)'}
            </button>
            {capErr && <p className="text-xs text-red-400 break-all">{capErr}</p>}
            {cap && (
              <div className="space-y-3 text-sm">
                <CopyBlock label="Caption" text={cap.caption} k="cap" copied={copied} copy={copy} />
                {cap.hashtags?.length > 0 && <CopyBlock label="Hashtag" text={cap.hashtags.join(' ')} k="tags" copied={copied} copy={copy} />}
                {cap.titles?.length > 0 && (
                  <div>
                    <span className="label">Opsi Judul</span>
                    <div className="space-y-1.5">
                      {cap.titles.map((t, i) => (
                        <button key={i} onClick={() => copy(t, `t${i}`)}
                          className="w-full text-left px-3 py-2 rounded-md border border-line bg-white hover:border-faint flex items-center justify-between gap-2">
                          <span className="text-ink">{t}</span>
                          {copied === `t${i}` ? <Check size={14} className="text-green-500 shrink-0" /> : <Copy size={13} className="text-soft shrink-0" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {renderErr && <p className="text-xs text-red-400 break-all">{renderErr}</p>}
      <button className="btn btn-solid w-full" onClick={doRender} disabled={!!rendering || !videoUrl}>
        <Download size={15} />{rendering ? `Merender… ${rendering.pct}%` : 'Render & Unduh .mp4'}
      </button>
      <p className="text-xs text-gray-mid text-center">Render di browser — hasil = preview, persis.</p>
    </div>
  )
}

function CopyBlock({ label, text, k, copied, copy }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-start gap-2">
        <p className="flex-1 px-3 py-2 rounded-md border border-line bg-white text-ink break-words">{text}</p>
        <button onClick={() => copy(text, k)} title="Salin"
          className="shrink-0 w-9 h-9 rounded-md border border-line bg-white flex items-center justify-center hover:border-faint">
          {copied === k ? <Check size={15} className="text-green-500" /> : <Copy size={14} className="text-soft" />}
        </button>
      </div>
    </div>
  )
}

function Toggle({ label, on, setOn }) {
  return (
    <label className="flex items-center justify-between cursor-pointer select-none">
      <span className="label !mb-0">{label}</span>
      <button onClick={() => setOn(!on)}
        className={`w-11 h-6 rounded-full relative transition-colors ${on ? 'bg-btn' : 'bg-gray-border'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </button>
    </label>
  )
}

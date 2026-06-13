import { createContext, createElement, useCallback, useContext, useEffect, useState } from 'react'
import { LS, api } from '../config.js'
import { usePolling } from './usePolling.js'

const TERMINAL = new Set(['done', 'failed', 'cancelled'])

// Internal: the actual job lifecycle state machine. Instantiated EXACTLY ONCE by
// JobProvider so every component (pages + navbar) shares one job, one poller and
// one source of truth — otherwise each useJob() call kept its own copy and a
// cancel/clear in one place left stale state (and extra pollers) in the others.
function useJobState() {
  const [jobId, setJobId] = useState(() => localStorage.getItem(LS.jobId) || null)
  const [status, setStatus] = useState(null)
  const [result, setResult] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS.jobResult) || 'null') }
    catch { return null }
  })
  const [error, setError] = useState(null)
  const [notified, setNotified] = useState(false)

  const active = !!jobId && status && !TERMINAL.has(status.status)

  const clear = useCallback(() => {
    localStorage.removeItem(LS.jobId)
    localStorage.removeItem(LS.jobStatus)
    localStorage.removeItem(LS.jobResult)
    setJobId(null); setStatus(null); setResult(null); setError(null)
    document.title = 'ClipStudio'
  }, [])

  // Recover on first load. If a job id is stored, fetch its status (and the
  // result if it already finished). If there's no tracked job — or the tracked
  // one already finished/failed while a NEWER job is actually running on the
  // server — adopt that running job, so the UI never gets stuck showing a stale
  // job while a fresh generate progresses in the background.
  useEffect(() => {
    let cancelled = false
    const adoptActive = async () => {
      try {
        const { jobs: list } = await api('/api/jobs')
        const live = (list || []).find((j) => !TERMINAL.has(j.status))
        if (live && !cancelled) {
          localStorage.setItem(LS.jobId, live.job_id)
          setJobId(live.job_id)
          setStatus(null)
        }
      } catch { /* ignore */ }
    }
    if (!jobId) { adoptActive(); return () => { cancelled = true } }
    api(`/api/status/${jobId}`).then((st) => {
      if (cancelled) return
      setStatus(st)
      if (st.status === 'done') {
        api(`/api/result/${jobId}`).then((res) => {
          setResult(res)
          localStorage.setItem(LS.jobResult, JSON.stringify(res))
        }).catch(() => {})
      } else if (TERMINAL.has(st.status)) {
        adoptActive()  // this one's done/failed — pick up a newer running job
      }
    }).catch(() => clear())
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onStatus = useCallback((st) => {
    setStatus(st)
    localStorage.setItem(LS.jobStatus, st.status)
    if (st.status === 'done') {
      api(`/api/result/${st.job_id || jobId}`).then((res) => {
        setResult(res)
        localStorage.setItem(LS.jobResult, JSON.stringify(res))
      }).catch(() => {})
    } else if (st.status === 'failed') {
      setError({ message: st.message, code: st.error })
    }
  }, [jobId])

  usePolling(jobId, onStatus, active || (status == null && !!jobId))

  // Tab title + browser notification on completion.
  useEffect(() => {
    if (!status) return
    if (status.status === 'done' && result) {
      const n = result.clips?.length || 0
      document.title = `✅ ${n} Klip Siap — ClipStudio`
      if (!notified) {
        setNotified(true)
        try {
          if (Notification?.permission === 'granted') {
            new Notification('ClipStudio', { body: `${n} klip siap diunduh!` })
          }
        } catch { /* ignore */ }
      }
    } else if (active) {
      document.title = `${status.progress || 0}% — ClipStudio`
    } else {
      document.title = 'ClipStudio'
    }
  }, [status, result, active, notified])

  const submit = useCallback(async ({ file, url, cropMode, language }) => {
    setError(null); setResult(null); setNotified(false)
    localStorage.removeItem(LS.jobResult)
    try { if (Notification?.permission === 'default') Notification.requestPermission() }
    catch { /* ignore */ }

    const fd = new FormData()
    if (file) fd.append('file', file)
    if (url) fd.append('url', url)
    fd.append('crop_mode', cropMode || 'track')
    fd.append('language', language || 'auto')
    const res = await api('/api/process', { method: 'POST', body: fd })
    localStorage.setItem(LS.jobId, res.job_id)
    setJobId(res.job_id)
    setStatus({ job_id: res.job_id, status: 'queued', progress: 0,
                step: 'Antrian', message: 'Menunggu giliran' })
    return res.job_id
  }, [])

  const cancel = useCallback(async () => {
    if (!jobId) return
    const id = jobId
    // Leave the progress view instantly — the backend cancel can take a few
    // seconds (it waits to kill ffmpeg/yt-dlp), and the UI must not appear stuck
    // on the Yes/No dialog while that happens. Fire the request in the background.
    clear()
    try { await api(`/api/cancel/${id}`, { method: 'POST' }) } catch { /* ignore */ }
  }, [jobId, clear])

  const refreshResult = useCallback(async () => {
    if (!jobId) return
    const res = await api(`/api/result/${jobId}`)
    setResult(res)
    localStorage.setItem(LS.jobResult, JSON.stringify(res))
    return res
  }, [jobId])

  return { jobId, status, result, error, active, submit, cancel, clear,
           refreshResult, hasActiveJob: !!jobId && !TERMINAL.has(status?.status) }
}

// One shared job instance for the whole app subtree.
const JobContext = createContext(null)

export function JobProvider({ children }) {
  const job = useJobState()
  return createElement(JobContext.Provider, { value: job }, children)
}

// Components keep calling useJob() unchanged — it now reads the shared context.
export function useJob() {
  const ctx = useContext(JobContext)
  if (!ctx) throw new Error('useJob must be used within <JobProvider>')
  return ctx
}

import { useCallback, useEffect, useState } from 'react'
import { LS, api } from '../config.js'
import { usePolling } from './usePolling.js'

const TERMINAL = new Set(['done', 'failed', 'cancelled'])

// Central job lifecycle: localStorage persistence + polling + refresh recovery.
export function useJob() {
  const [jobId, setJobId] = useState(() => localStorage.getItem(LS.jobId) || null)
  const [status, setStatus] = useState(null)
  const [result, setResult] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LS.jobResult) || 'null') }
    catch { return null }
  })
  const [error, setError] = useState(null)
  const [notified, setNotified] = useState(false)

  const active = !!jobId && status && !TERMINAL.has(status.status)

  // Recover on first load: if a job id is stored, fetch its status.
  useEffect(() => {
    if (!jobId) return
    api(`/api/status/${jobId}`).then(setStatus).catch(() => {
      clear()
    })
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
    try { await api(`/api/cancel/${jobId}`, { method: 'POST' }) } catch { /* ignore */ }
    clear()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId])

  const clear = useCallback(() => {
    localStorage.removeItem(LS.jobId)
    localStorage.removeItem(LS.jobStatus)
    localStorage.removeItem(LS.jobResult)
    setJobId(null); setStatus(null); setResult(null); setError(null)
    document.title = 'ClipStudio'
  }, [])

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

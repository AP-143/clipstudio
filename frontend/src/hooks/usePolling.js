import { useEffect, useRef } from 'react'
import { API_BASE } from '../config.js'

const TERMINAL = new Set(['done', 'failed', 'cancelled'])

// Try WebSocket first, fall back to HTTP polling every 2s. Calls onStatus with
// each status object; stops on terminal states.
export function usePolling(jobId, onStatus, active) {
  const cbRef = useRef(onStatus)
  cbRef.current = onStatus

  useEffect(() => {
    if (!jobId || !active) return
    let stopped = false
    let ws = null
    let timer = null

    const handle = (st) => {
      if (stopped || !st) return
      cbRef.current(st)
      if (TERMINAL.has(st.status)) cleanup()
    }

    const poll = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/status/${jobId}`)
        if (res.ok) handle(await res.json())
      } catch {
        /* keep trying */
      }
    }

    const startHttp = () => {
      poll()
      timer = setInterval(poll, 2000)
    }

    const cleanup = () => {
      stopped = true
      if (timer) clearInterval(timer)
      if (ws && ws.readyState <= 1) ws.close()
    }

    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const base = API_BASE || `${proto}://${location.host}`
      const wsUrl = base.replace(/^http/, 'ws') + `/ws/status/${jobId}`
      ws = new WebSocket(wsUrl)
      ws.onmessage = (e) => {
        try { handle(JSON.parse(e.data)) } catch { /* ignore */ }
      }
      ws.onerror = () => { if (!timer && !stopped) startHttp() }
      ws.onclose = () => { if (!stopped && !TERMINAL.has('')) { /* noop */ } }
      // Safety net: if WS never connects within 3s, start HTTP polling too.
      setTimeout(() => { if (!stopped && (!ws || ws.readyState !== 1) && !timer) startHttp() }, 3000)
    } catch {
      startHttp()
    }

    return cleanup
  }, [jobId, active])
}

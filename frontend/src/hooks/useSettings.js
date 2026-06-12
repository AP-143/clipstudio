import { useCallback, useEffect, useState } from 'react'
import { LS, DEFAULT_SETTINGS } from '../config.js'

export function useSettings() {
  const [settings, setSettings] = useState(() => {
    try {
      const raw = localStorage.getItem(LS.settings)
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SETTINGS
    } catch {
      return DEFAULT_SETTINGS
    }
  })
  const [groqKey, setGroqKey] = useState(
    () => localStorage.getItem(LS.groqKey) || '')
  const [cookies, setCookies] = useState(
    () => localStorage.getItem(LS.cookies) || '')

  useEffect(() => {
    localStorage.setItem(LS.settings, JSON.stringify(settings))
  }, [settings])

  const saveKey = useCallback((k) => {
    setGroqKey(k)
    localStorage.setItem(LS.groqKey, k)
  }, [])
  const saveCookies = useCallback((c) => {
    setCookies(c)
    localStorage.setItem(LS.cookies, c)
  }, [])
  const update = useCallback((patch) => {
    setSettings((s) => ({ ...s, ...patch }))
  }, [])

  return { settings, update, groqKey, saveKey, cookies, saveCookies,
           hasKey: !!groqKey }
}

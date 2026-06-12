import { useState } from 'react'
import { Youtube } from 'lucide-react'

export default function UrlInput({ onSubmit, disabled }) {
  const [url, setUrl] = useState('')
  const valid = /youtu\.?be/.test(url)
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="flex-1 flex items-center border border-line px-4">
        <Youtube size={20} className="shrink-0" />
        <input
          className="flex-1 px-3 py-3 outline-none bg-transparent text-sm"
          placeholder="https://youtube.com/watch?v=..."
          value={url}
          disabled={disabled}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && valid) onSubmit(url) }}
        />
      </div>
      <button className="btn btn-solid" disabled={disabled || !valid}
        onClick={() => onSubmit(url)}>
        Proses Sekarang
      </button>
    </div>
  )
}

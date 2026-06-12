import { AlertTriangle, X } from 'lucide-react'

export default function ErrorAlert({ error, onClose }) {
  if (!error) return null
  return (
    <div className="card border-line p-4 flex items-start gap-3 bg-gray-light">
      <AlertTriangle size={20} className="mt-0.5 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">{error.message || 'Terjadi kesalahan'}</p>
        {error.solution && (
          <p className="text-sm text-gray-mid mt-1">{error.solution}</p>
        )}
        {error.detail && (
          <p className="text-xs text-gray-mid mt-1 font-mono break-all">{error.detail}</p>
        )}
      </div>
      {onClose && (
        <button onClick={onClose} className="shrink-0 hover:opacity-60">
          <X size={18} />
        </button>
      )}
    </div>
  )
}

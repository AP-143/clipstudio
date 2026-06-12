import { useState } from 'react'

// Inline (non-modal) cancel confirmation, per spec.
export default function CancelButton({ onCancel }) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <div className="card border-line p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        <span className="text-sm flex-1">
          Yakin batalkan? File yang sudah diproses akan dihapus.
        </span>
        <div className="flex gap-2">
          <button className="btn btn-solid" onClick={onCancel}>Ya</button>
          <button className="btn btn-outline" onClick={() => setConfirming(false)}>
            Tidak
          </button>
        </div>
      </div>
    )
  }
  return (
    <button className="btn btn-outline w-full" onClick={() => setConfirming(true)}>
      Cancel
    </button>
  )
}

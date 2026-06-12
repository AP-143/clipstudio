import { useRef, useState } from 'react'
import { UploadCloud } from 'lucide-react'

const OK = ['.mp4', '.mov', '.avi']

export default function UploadZone({ onFile, disabled }) {
  const inputRef = useRef(null)
  const [drag, setDrag] = useState(false)
  const [name, setName] = useState('')

  const pick = (file) => {
    if (!file) return
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
    if (!OK.includes(ext)) {
      alert('Format tidak didukung. Gunakan mp4, mov, atau avi.')
      return
    }
    setName(file.name)
    onFile(file)
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault(); setDrag(false)
        if (!disabled) pick(e.dataTransfer.files?.[0])
      }}
      onClick={() => !disabled && inputRef.current?.click()}
      className={`border border-dashed border-line p-12 text-center cursor-pointer
        transition-colors ${drag ? 'bg-gray-light' : 'bg-white'}
        ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <input ref={inputRef} type="file" accept=".mp4,.mov,.avi" hidden
        onChange={(e) => pick(e.target.files?.[0])} />
      <UploadCloud size={40} className="mx-auto mb-4" />
      <p className="font-display text-3xl">Seret video ke sini</p>
      <p className="text-sm text-gray-mid mt-2">
        {name || 'atau klik untuk pilih file · mp4 / mov / avi · maks 2GB'}
      </p>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Trash2, Eye } from 'lucide-react'
import { api, LS } from '../config.js'

const STATUS_LABEL = {
  done: 'Done', failed: 'Failed', cancelled: 'Cancelled',
  queued: 'Processing', downloading: 'Processing', transcribing: 'Processing',
  analyzing: 'Processing', cutting: 'Processing',
}

// Monochrome status pills (pure black & white theme).
const STATUS_STYLE = {
  done: 'bg-ink text-white border-ink',
  failed: 'bg-white text-ink border-ink',
  cancelled: 'bg-alt text-faint border-line',
}
function statusStyle(s) {
  return STATUS_STYLE[s] || 'bg-alt text-soft border-line' // processing
}

export default function History() {
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    api('/api/jobs').then((d) => setJobs(d.jobs || [])).catch(() => setJobs([]))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const remove = async (id) => {
    if (!confirm('Hapus job ini beserta semua filenya?')) return
    await api(`/api/jobs/${id}`, { method: 'DELETE' }).catch(() => {})
    if (localStorage.getItem(LS.jobId) === id) {
      [LS.jobId, LS.jobStatus, LS.jobResult].forEach((k) => localStorage.removeItem(k))
    }
    load()
  }

  const view = (id) => {
    localStorage.setItem(LS.jobId, id)
    localStorage.removeItem(LS.jobResult)
    // Full reload (not client-side nav): the job state lives in a context that
    // persists across in-app navigation and only reads localStorage on mount,
    // so a soft navigate would keep showing the previous job. A hard load makes
    // it re-read the id we just selected.
    window.location.assign('/app/results')
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-4xl sm:text-6xl leading-none">Riwayat</h1>
        <button className="btn btn-outline" onClick={load}>Refresh</button>
      </div>

      {loading ? (
        <p className="text-gray-mid">Memuat...</p>
      ) : jobs.length === 0 ? (
        <p className="text-gray-mid">Belum ada job.</p>
      ) : (
        <div className="border border-line rounded-lg divide-y divide-line overflow-hidden">
          {jobs.map((j) => (
            <div key={j.job_id} className="p-4 flex flex-wrap items-center gap-3 hover:bg-alt transition-colors">
              <span className={`text-[10px] uppercase tracking-wide border rounded-full px-2.5 py-1 ${statusStyle(j.status)}`}>
                {STATUS_LABEL[j.status] || j.status}
              </span>
              <div className="flex-1 min-w-[200px]">
                <p className="font-medium truncate">{j.video_title || j.job_id}</p>
                <p className="text-xs text-gray-mid">
                  {j.channel_name ? `${j.channel_name} · ` : ''}
                  {j.clip_count} klip
                  {j.duration ? ` · ${Math.round(j.duration / 60)} mnt` : ''}
                  {j.created_at ? ` · ${new Date(j.created_at).toLocaleString()}` : ''}
                </p>
              </div>
              {j.status === 'done' && (
                <button className="btn btn-outline !px-3 !py-2" onClick={() => view(j.job_id)}>
                  <Eye size={16} />
                </button>
              )}
              <button className="btn btn-outline !px-3 !py-2" onClick={() => remove(j.job_id)}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

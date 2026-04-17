import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'

const CURRENCIES = ['USD','EUR','GBP','CAD','AUD','JPY']

export default function JobsPage() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [jobs, setJobs] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    name: '', client_name: '', client_email: '',
    client_address: '', hourly_rate: '', currency: 'USD'
  })

  useEffect(() => { fetchJobs() }, [])

  async function fetchJobs() {
    // Because of Supabase row-level security, this only returns jobs owned by
    // the signed-in user.
    const { data } = await supabase
      .from('jobs')
      .select('*')
      .order('created_at', { ascending: false })
    setJobs(data || [])
    setLoading(false)
  }

  async function createJob(e) {
    e.preventDefault()

    // Jobs store the current user's id so related work items and invoices can
    // be scoped back to the correct owner in Supabase.
    const { error } = await supabase.from('jobs').insert({
      ...form,
      hourly_rate: parseFloat(form.hourly_rate) || 0,
      user_id: user.id
    })
    if (!error) { setShowModal(false); setForm({ name:'',client_name:'',client_email:'',client_address:'',hourly_rate:'',currency:'USD' }); fetchJobs() }
  }

  return (
    <div className="min-h-screen bg-paper">
      {/* Nav */}
      <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-ink rounded-md flex items-center justify-center">
              <div className="w-2.5 h-2.5 bg-accent rounded-sm" />
            </div>
            <span className="font-display font-bold tracking-tight">Invoicer</span>
          </div>
          <button onClick={signOut} className="btn-ghost text-xs">Sign out</button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-end justify-between mb-10 animate-fade-up">
          <div>
            <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">Your workspace</p>
            <h1 className="font-display text-3xl font-bold text-ink">Jobs</h1>
          </div>
          <button onClick={() => setShowModal(true)} className="btn-primary">
            + New Job
          </button>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-5 h-5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
          </div>
        ) : jobs.length === 0 ? (
          // Empty state shown before the user has created any billable jobs.
          <div className="text-center py-24 animate-fade-up-delay-1">
            <div className="w-12 h-12 bg-accent rounded-xl mx-auto mb-4 flex items-center justify-center">
              <span className="text-xl">📋</span>
            </div>
            <h2 className="font-display font-semibold text-lg mb-1">No jobs yet</h2>
            <p className="text-muted text-sm">Create your first job to start tracking hours.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {jobs.map((job, i) => (
              <button
                key={job.id}
                // Each card opens that job's dashboard for work logs and invoices.
                onClick={() => navigate(`/jobs/${job.id}`)}
                className="card text-left hover:border-ink hover:shadow-sm transition-all duration-200 group animate-fade-up"
                style={{ animationDelay: `${i * 0.05}s` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-9 h-9 bg-ink rounded-lg flex items-center justify-center text-accent font-display font-bold text-sm">
                    {job.name.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-xs font-mono text-muted">{job.currency}</span>
                </div>
                <h3 className="font-display font-semibold text-base mb-0.5 group-hover:text-ink">{job.name}</h3>
                {job.client_name && <p className="text-sm text-muted truncate">{job.client_name}</p>}
                <div className="mt-3 pt-3 border-t border-border">
                  <span className="text-xs font-mono text-muted">
                    {job.hourly_rate > 0 ? `${job.currency} ${Number(job.hourly_rate).toFixed(0)}/hr` : 'No rate set'}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 animate-fade-up shadow-xl">
            <h2 className="font-display font-bold text-lg mb-5">New Job</h2>
            <form onSubmit={createJob} className="space-y-4">
              <div>
                <label className="label">Job Name *</label>
                <input className="input" placeholder="Website Redesign" required
                  value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Hourly Rate</label>
                  <input className="input" type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.hourly_rate} onChange={e => setForm({...form, hourly_rate: e.target.value})} />
                </div>
                <div>
                  <label className="label">Currency</label>
                  <select className="input" value={form.currency} onChange={e => setForm({...form, currency: e.target.value})}>
                    {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Client Name</label>
                <input className="input" placeholder="Acme Corp"
                  value={form.client_name} onChange={e => setForm({...form, client_name: e.target.value})} />
              </div>
              <div>
                <label className="label">Client Email</label>
                <input className="input" type="email" placeholder="client@example.com"
                  value={form.client_email} onChange={e => setForm({...form, client_email: e.target.value})} />
              </div>
              <div>
                <label className="label">Client Address</label>
                <textarea className="input resize-none" rows={2} placeholder="123 Main St..."
                  value={form.client_address} onChange={e => setForm({...form, client_address: e.target.value})} />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Create Job</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

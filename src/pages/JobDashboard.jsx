import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

export default function JobDashboard() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [workItems, setWorkItems] = useState([])
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [tab, setTab] = useState('log')
  const [showItemModal, setShowItemModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [selectedItems, setSelectedItems] = useState([])
  const [itemForm, setItemForm] = useState({ description: '', date: format(new Date(), 'yyyy-MM-dd'), hours: '' })
  const [editForm, setEditForm] = useState({ description: '', date: format(new Date(), 'yyyy-MM-dd'), hours: '' })
  const [invoiceForm, setInvoiceForm] = useState({
    invoice_number: `INV-${Date.now().toString().slice(-6)}`,
    issued_date: format(new Date(), 'yyyy-MM-dd'),
    due_date: '',
    payable_to: '',
    payable_details: '',
    notes: ''
  })

  useEffect(() => {
    fetchAll()
  }, [jobId])

  async function fetchAll() {
    const [{ data: jobData }, { data: items }, { data: invs }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', jobId).single(),
      supabase.from('work_items').select('*').eq('job_id', jobId).order('date', { ascending: false }),
      supabase.from('invoices').select('*').eq('job_id', jobId).order('created_at', { ascending: false }),
    ])
    setJob(jobData)
    setWorkItems(items || [])
    setInvoices(invs || [])

    if (invs?.length) {
      const invoiceIds = invs.map(i => i.id)
      const { data: pmts } = await supabase.from('payments').select('*').in('invoice_id', invoiceIds)
      setPayments(pmts || [])
    }
  }

  async function addWorkItem(e) {
    e.preventDefault()
    await supabase.from('work_items').insert({ ...itemForm, hours: parseFloat(itemForm.hours), job_id: jobId })
    setShowItemModal(false)
    setItemForm({ description: '', date: format(new Date(), 'yyyy-MM-dd'), hours: '' })
    fetchAll()
  }

  async function deleteWorkItem(id) {
    await supabase.from('work_items').delete().eq('id', id)
    fetchAll()
  }

  function startEditWorkItem(item) {
    setEditingItem(item)
    setEditForm({
      description: item.description || '',
      date: item.date || format(new Date(), 'yyyy-MM-dd'),
      hours: String(item.hours ?? '')
    })
  }

  function closeEditModal() {
    setEditingItem(null)
    setEditForm({ description: '', date: format(new Date(), 'yyyy-MM-dd'), hours: '' })
  }

  async function updateWorkItem(e) {
    e.preventDefault()
    if (!editingItem) return

    const parsedHours = parseFloat(editForm.hours)
    if (!parsedHours || parsedHours <= 0) {
      alert('Please enter a valid number of hours')
      return
    }

    const { error } = await supabase
      .from('work_items')
      .update({
        description: editForm.description,
        date: editForm.date,
        hours: parsedHours,
      })
      .eq('id', editingItem.id)

    if (error) {
      alert('Error updating work item: ' + error.message)
      return
    }

    closeEditModal()
    fetchAll()
  }

  async function createInvoice(e) {
    e.preventDefault()
    if (selectedItems.length === 0) {
      alert('Please select at least one work item')
      return
    }
    try {
      const items = workItems.filter(w => selectedItems.includes(w.id))
      const totalHours = items.reduce((s, i) => s + Number(i.hours), 0)
      const totalAmount = totalHours * Number(job.hourly_rate)

      const { data: inv, error: invoiceError } = await supabase.from('invoices').insert({
        ...invoiceForm,
        job_id: jobId,
        total_hours: totalHours,
        total_amount: totalAmount,
        status: 'unpaid'
      }).select().single()

      if (invoiceError) {
        console.error('Invoice creation error:', invoiceError)
        alert('Error creating invoice: ' + invoiceError.message)
        return
      }

      const { error: updateError } = await supabase.from('work_items')
        .update({ invoiced: true, invoice_id: inv.id })
        .in('id', selectedItems)

      if (updateError) {
        console.error('Work items update error:', updateError)
        alert('Error updating work items: ' + updateError.message)
        return
      }

      setShowInvoiceModal(false)
      setSelectedItems([])
      fetchAll()
      navigate(`/jobs/${jobId}/invoice/${inv.id}`)
    } catch (err) {
      console.error('Unexpected error creating invoice:', err)
      alert('Unexpected error: ' + err.message)
    }
  }

  // Stats
  const uninvoicedItems = workItems.filter(w => !w.invoiced)
  const totalUninvoicedHours = uninvoicedItems.reduce((s, i) => s + Number(i.hours), 0)
  const totalUninvoicedAmount = totalUninvoicedHours * Number(job?.hourly_rate || 0)
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
  const totalInvoiced = invoices.reduce((s, i) => s + Number(i.total_amount), 0)

  if (!job) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-5 h-5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="min-h-screen bg-paper">
      {/* Nav */}
      <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="btn-ghost text-xs">← Jobs</button>
          <span className="text-border">/</span>
          <span className="font-display font-semibold text-sm">{job.name}</span>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="animate-fade-up mb-8">
          <p className="text-xs font-mono text-muted uppercase tracking-widest mb-1">{job.client_name || 'No client'}</p>
          <div className="flex items-end justify-between">
            <h1 className="font-display text-3xl font-bold">{job.name}</h1>
            <div className="flex gap-2">
              <button onClick={() => setShowItemModal(true)} className="btn-secondary text-sm md:hidden">+ Log Hours</button>
              {uninvoicedItems.length > 0 && (
                <button onClick={() => { setSelectedItems(uninvoicedItems.map(i => i.id)); setShowInvoiceModal(true) }} className="btn-primary text-sm">
                  Create Invoice
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8 animate-fade-up-delay-1">
          {[
            { label: 'Uninvoiced Hours', value: `${totalUninvoicedHours.toFixed(1)} hrs` },
            { label: 'Unbilled Amount', value: `${job.currency} ${totalUninvoicedAmount.toFixed(2)}` },
            { label: 'Total Invoiced', value: `${job.currency} ${totalInvoiced.toFixed(2)}` },
            { label: 'Total Received', value: `${job.currency} ${totalPaid.toFixed(2)}` },
          ].map(stat => (
            <div key={stat.label} className="card py-4">
              <p className="text-xs font-mono text-muted mb-1 uppercase tracking-wider">{stat.label}</p>
              <p className="font-display font-bold text-xl">{stat.value}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-border animate-fade-up-delay-2">
          {['log', 'invoices'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2.5 text-sm font-display font-medium capitalize transition-all duration-150 border-b-2 -mb-px ${
                tab === t ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
              }`}
            >
              {t === 'log' ? `Work Log (${workItems.length})` : `Invoices (${invoices.length})`}
            </button>
          ))}
        </div>

        {/* Work Log Tab */}
        {tab === 'log' && (
          <div className="space-y-4 animate-fade-up">
            {/* Desktop inline form */}
            <form onSubmit={addWorkItem} className="hidden md:block card p-4 border border-accent/20">
              <div className="grid grid-cols-12 gap-3 items-end">
                <div className="col-span-2">
                  <label className="label text-xs">Date *</label>
                  <input 
                    type="date" 
                    required 
                    value={itemForm.date} 
                    onChange={e => setItemForm({ ...itemForm, date: e.target.value })}
                    className="input w-full"
                  />
                </div>
                <div className="col-span-6">
                  <label className="label text-xs">Description *</label>
                  <input 
                    placeholder="What did you work on?"
                    required 
                    value={itemForm.description} 
                    onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
                    className="input w-full"
                  />
                </div>
                <div className="col-span-2">
                  <label className="label text-xs">Hours *</label>
                  <input 
                    type="number" 
                    min="0" 
                    step="0.25" 
                    placeholder="0.00"
                    required 
                    value={itemForm.hours} 
                    onChange={e => setItemForm({ ...itemForm, hours: e.target.value })}
                    className="input w-full"
                  />
                </div>
                <button type="submit" className="btn-primary col-span-2">Log Hours</button>
              </div>
            </form>

            {/* Work items list */}
            <div className="space-y-2">
              {workItems.length === 0 ? (
                <div className="text-center py-16 text-muted">
                  <p className="font-display text-base mb-1">No work logged yet</p>
                  <p className="text-sm">Click "Log Hours" to add your first entry.</p>
                </div>
              ) : workItems.map(item => (
                <div key={item.id} className="card py-3.5 px-4 flex items-center gap-4 group">
                  <div className="text-xs font-mono text-muted w-24 shrink-0">
                    {format(new Date(item.date + 'T00:00:00'), 'MMM d, yyyy')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body truncate">{item.description}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono text-sm font-medium">{Number(item.hours).toFixed(2)} hrs</span>
                    <span className="font-mono text-xs text-muted">
                      {job.currency} {(item.hours * job.hourly_rate).toFixed(2)}
                    </span>
                    {item.invoiced ? (
                      <span className="tag tag-paid">invoiced</span>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => startEditWorkItem(item)}
                          className="opacity-0 group-hover:opacity-100 text-muted hover:text-ink text-xs transition-all"
                        >Edit</button>
                        <button
                          onClick={() => deleteWorkItem(item.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted hover:text-red-500 text-xs transition-all"
                        >✕</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Invoices Tab */}
        {tab === 'invoices' && (
          <div className="space-y-2 animate-fade-up">
            {invoices.length === 0 ? (
              <div className="text-center py-16 text-muted">
                <p className="font-display text-base mb-1">No invoices yet</p>
                <p className="text-sm">Log some hours and create your first invoice.</p>
              </div>
            ) : invoices.map(inv => {
              const invPayments = payments.filter(p => p.invoice_id === inv.id)
              const paid = invPayments.reduce((s, p) => s + Number(p.amount), 0)
              const balance = Number(inv.total_amount) - paid
              return (
                <button
                  key={inv.id}
                  onClick={() => navigate(`/jobs/${jobId}/invoice/${inv.id}`)}
                  className="card w-full text-left flex items-center gap-4 hover:border-ink transition-all group"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="font-display font-semibold text-sm">#{inv.invoice_number}</span>
                      <span className={`tag tag-${inv.status}`}>{inv.status}</span>
                    </div>
                    <p className="text-xs text-muted font-mono">
                      Issued {format(new Date(inv.issued_date), 'MMM d, yyyy')} · {inv.total_hours?.toFixed(1)} hrs
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-medium text-sm">{job.currency} {Number(inv.total_amount).toFixed(2)}</p>
                    {balance > 0 && balance < Number(inv.total_amount) && (
                      <p className="text-xs text-muted font-mono">Balance: {job.currency} {balance.toFixed(2)}</p>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>

      {/* Log Hours Modal */}
      {showItemModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 animate-fade-up shadow-xl">
            <h2 className="font-display font-bold text-lg mb-5">Log Work Hours</h2>
            <form onSubmit={addWorkItem} className="space-y-4">
              <div>
                <label className="label">Description *</label>
                <input className="input" placeholder="What did you work on?" required
                  value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date *</label>
                  <input className="input" type="date" required
                    value={itemForm.date} onChange={e => setItemForm({...itemForm, date: e.target.value})} />
                </div>
                <div>
                  <label className="label">Hours *</label>
                  <input className="input" type="number" min="0" step="0.25" placeholder="0.00" required
                    value={itemForm.hours} onChange={e => setItemForm({...itemForm, hours: e.target.value})} />
                </div>
              </div>
              {itemForm.hours && (
                <p className="text-xs font-mono text-muted bg-border/30 rounded-lg px-3 py-2">
                  = {job.currency} {(parseFloat(itemForm.hours || 0) * job.hourly_rate).toFixed(2)} at {job.currency} {job.hourly_rate}/hr
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowItemModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Save Entry</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Work Item Modal */}
      {editingItem && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 animate-fade-up shadow-xl">
            <h2 className="font-display font-bold text-lg mb-5">Edit Work Item</h2>
            <form onSubmit={updateWorkItem} className="space-y-4">
              <div>
                <label className="label">Description *</label>
                <input
                  className="input"
                  required
                  value={editForm.description}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date *</label>
                  <input
                    className="input"
                    type="date"
                    required
                    value={editForm.date}
                    onChange={e => setEditForm({ ...editForm, date: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Hours *</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.25"
                    required
                    value={editForm.hours}
                    onChange={e => setEditForm({ ...editForm, hours: e.target.value })}
                  />
                </div>
              </div>

              {editForm.hours && (
                <p className="text-xs font-mono text-muted bg-border/30 rounded-lg px-3 py-2">
                  = {job.currency} {(parseFloat(editForm.hours || 0) * job.hourly_rate).toFixed(2)} at {job.currency} {job.hourly_rate}/hr
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeEditModal} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Update Item</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Invoice Modal */}
      {showInvoiceModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-lg p-6 animate-fade-up shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="font-display font-bold text-lg mb-1">Create Invoice</h2>
            <p className="text-sm text-muted mb-5">{selectedItems.length} items selected</p>
            <form onSubmit={createInvoice} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Invoice Number *</label>
                  <input className="input" required value={invoiceForm.invoice_number}
                    onChange={e => setInvoiceForm({...invoiceForm, invoice_number: e.target.value})} />
                </div>
                <div>
                  <label className="label">Issue Date *</label>
                  <input className="input" type="date" required value={invoiceForm.issued_date}
                    onChange={e => setInvoiceForm({...invoiceForm, issued_date: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="label">Due Date</label>
                <input className="input" type="date" value={invoiceForm.due_date}
                  onChange={e => setInvoiceForm({...invoiceForm, due_date: e.target.value})} />
              </div>
              <div>
                <label className="label">Payable To (Your Name / Business) *</label>
                <input className="input" placeholder="Jane Smith / Jane's Studio" required
                  value={invoiceForm.payable_to} onChange={e => setInvoiceForm({...invoiceForm, payable_to: e.target.value})} />
              </div>
              <div>
                <label className="label">Payment Details</label>
                <textarea className="input resize-none" rows={2} placeholder="Bank: ..., BSB: ..., Account: ..."
                  value={invoiceForm.payable_details} onChange={e => setInvoiceForm({...invoiceForm, payable_details: e.target.value})} />
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input resize-none" rows={2} placeholder="Payment terms, thank you note..."
                  value={invoiceForm.notes} onChange={e => setInvoiceForm({...invoiceForm, notes: e.target.value})} />
              </div>

              {/* Item selection */}
              <div>
                <label className="label">Work Items to Include</label>
                <div className="border border-border rounded-lg overflow-hidden">
                  {uninvoicedItems.map(item => (
                    <label key={item.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-border/30 cursor-pointer border-b last:border-0 border-border">
                      <input type="checkbox" checked={selectedItems.includes(item.id)}
                        onChange={e => setSelectedItems(e.target.checked
                          ? [...selectedItems, item.id]
                          : selectedItems.filter(id => id !== item.id)
                        )}
                        className="rounded"
                      />
                      <span className="text-xs font-mono text-muted w-20 shrink-0">{format(new Date(item.date + 'T00:00:00'), 'MMM d')}</span>
                      <span className="text-sm flex-1 truncate">{item.description}</span>
                      <span className="text-xs font-mono text-muted">{item.hours}h</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowInvoiceModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={selectedItems.length === 0} className="btn-primary flex-1">
                  Generate Invoice
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

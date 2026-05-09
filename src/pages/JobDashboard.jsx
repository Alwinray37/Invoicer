import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { format } from 'date-fns'

function DescriptionTextarea({ value, onChange, placeholder, required, className }) {
  const [focused, setFocused] = useState(false)
  const expanded = focused && value.includes('\n')

  return (
    <div className="relative">
      <div className={`${className} invisible pointer-events-none select-none`} aria-hidden="true">&nbsp;</div>
      <textarea
        placeholder={placeholder}
        required={required}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className={`${className} absolute top-0 left-0 resize-none ${expanded ? 'z-50 shadow-lg' : 'overflow-hidden'}`}
        style={expanded ? { height: '8rem' } : { height: '100%' }}
      />
    </div>
  )
}

export default function JobDashboard() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const emptyJobForm = { billing_type: 'hourly', hourly_rate: '' }
  const [job, setJob] = useState(null)
  const [workItems, setWorkItems] = useState([])
  const [invoices, setInvoices] = useState([])
  const [payments, setPayments] = useState([])
  const [tab, setTab] = useState('log')
  const [showItemModal, setShowItemModal] = useState(false)
  const [showInvoiceModal, setShowInvoiceModal] = useState(false)
  const [showJobSettingsModal, setShowJobSettingsModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [selectedItems, setSelectedItems] = useState([])
  const [jobForm, setJobForm] = useState(emptyJobForm)
  const emptyItemForm = { description: '', date: format(new Date(), 'yyyy-MM-dd'), hours: '', amount: '' }
  const [itemForm, setItemForm] = useState(emptyItemForm)
  const [editForm, setEditForm] = useState(emptyItemForm)
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

  function getBillingType(currentJob = job) {
    return currentJob?.billing_type === 'flat' ? 'flat' : 'hourly'
  }

  function getUnitLabel(currentJob = job) {
    return getBillingType(currentJob) === 'flat' ? 'Amount' : 'Hours'
  }

  function getEntryVerb(currentJob = job) {
    return getBillingType(currentJob) === 'flat' ? 'Add Item' : 'Log Hours'
  }

  function getItemAmount(item, currentJob = job) {
    if (item?.amount != null) return Number(item.amount)

    const value = Number(item?.hours || 0)
    return getBillingType(currentJob) === 'flat'
      ? value
      : value * Number(currentJob?.hourly_rate || 0)
  }

  function getInvoiceTotals(items, currentJob = job) {
    const billingType = getBillingType(currentJob)
    const totalUnits = items.reduce((sum, item) => sum + Number(item.hours), 0)

    if (billingType === 'flat') {
      return {
        totalHours: null,
        totalAmount: items.reduce((sum, item) => sum + getItemAmount(item, currentJob), 0),
      }
    }

    return {
      totalHours: totalUnits,
      totalAmount: items.reduce((sum, item) => sum + getItemAmount(item, currentJob), 0),
    }
  }

  function getDerivedAmount(hoursValue, currentJob = job) {
    const parsedHours = parseFloat(hoursValue)
    if (getBillingType(currentJob) !== 'hourly' || Number.isNaN(parsedHours) || parsedHours <= 0) {
      return null
    }

    return parsedHours * Number(currentJob?.hourly_rate || 0)
  }

  function getDisplayedAmount(formState, currentJob = job) {
    const derivedAmount = getDerivedAmount(formState.hours, currentJob)
    return derivedAmount != null ? derivedAmount.toFixed(2) : formState.amount
  }

  function openJobSettings() {
    setJobForm({
      billing_type: getBillingType(job),
      hourly_rate: String(job?.hourly_rate ?? ''),
    })
    setShowJobSettingsModal(true)
  }

  function closeJobSettings() {
    setShowJobSettingsModal(false)
    setJobForm(emptyJobForm)
  }

  async function fetchAll() {
    // Load the job, its work log, and its invoices together so the dashboard
    // can derive all summary stats from one refresh.
    const [{ data: jobData }, { data: items }, { data: invs }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', jobId).single(),
      supabase.from('work_items').select('*').eq('job_id', jobId).order('date', { ascending: false }),
      supabase.from('invoices').select('*').eq('job_id', jobId).order('created_at', { ascending: false }),
    ])
    setJob(jobData)
    setWorkItems(items || [])
    setInvoices(invs || [])

    if (invs?.length) {
      // Payments are attached to invoices, so we fetch them after we know the
      // relevant invoice ids for this job.
      const invoiceIds = invs.map(i => i.id)
      const { data: pmts } = await supabase.from('payments').select('*').in('invoice_id', invoiceIds)
      setPayments(pmts || [])
    }
  }

  async function addWorkItem(e) {
    e.preventDefault()

    const parsedHours = parseFloat(itemForm.hours)
    const hours = !Number.isNaN(parsedHours) && parsedHours > 0 ? parsedHours : 0
    const derivedAmount = getDerivedAmount(itemForm.hours, job)
    const parsedAmount = derivedAmount != null ? derivedAmount : parseFloat(itemForm.amount)

    if (itemForm.hours && (Number.isNaN(parsedHours) || parsedHours < 0)) {
      alert('Please enter a valid number of hours')
      return
    }

    if (derivedAmount == null && (Number.isNaN(parsedAmount) || parsedAmount <= 0)) {
      alert('Please enter a valid amount')
      return
    }

    const { error } = await supabase.from('work_items').insert({
      description: itemForm.description,
      date: itemForm.date,
      hours,
      amount: parsedAmount ?? 0,
      job_id: jobId,
    })

    if (error) {
      alert('Error saving entry: ' + error.message)
      return
    }

    setShowItemModal(false)
    setItemForm(emptyItemForm)
    fetchAll()
  }

  async function deleteWorkItem(id) {
    await supabase.from('work_items').delete().eq('id', id)
    fetchAll()
  }

  async function updateJobSettings(e) {
    e.preventDefault()

    const parsedRate = parseFloat(jobForm.hourly_rate)
    if (jobForm.hourly_rate && (Number.isNaN(parsedRate) || parsedRate < 0)) {
      alert('Please enter a valid rate')
      return
    }

    const { error } = await supabase
      .from('jobs')
      .update({
        billing_type: jobForm.billing_type,
        hourly_rate: parsedRate || 0,
      })
      .eq('id', jobId)

    if (error) {
      alert('Error updating job settings: ' + error.message)
      return
    }

    closeJobSettings()
    fetchAll()
  }

  function startEditWorkItem(item) {
    setEditingItem(item)
    setEditForm({
      description: item.description || '',
      date: item.date || format(new Date(), 'yyyy-MM-dd'),
      hours: Number(item.hours || 0) > 0 ? String(item.hours) : '',
      amount: String(item.amount ?? getItemAmount(item))
    })
  }

  function closeEditModal() {
    setEditingItem(null)
    setEditForm(emptyItemForm)
  }

  async function updateWorkItem(e) {
    e.preventDefault()
    if (!editingItem) return

    const parsedHours = parseFloat(editForm.hours)
    const hours = !Number.isNaN(parsedHours) && parsedHours > 0 ? parsedHours : 0
    const derivedAmount = getDerivedAmount(editForm.hours, job)
    const parsedAmount = parseFloat(derivedAmount != null ? String(derivedAmount) : editForm.amount)

    if (editForm.hours && (Number.isNaN(parsedHours) || parsedHours < 0)) {
      alert('Please enter a valid number of hours')
      return
    }

    if (!parsedAmount || parsedAmount <= 0) {
      alert('Please enter a valid amount')
      return
    }

    const { error } = await supabase
      .from('work_items')
      .update({
        description: editForm.description,
        date: editForm.date,
        hours,
        amount: parsedAmount,
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
      // An invoice is built from whichever uninvoiced work items the user selects.
      const items = workItems.filter(w => selectedItems.includes(w.id))
      const { totalHours, totalAmount } = getInvoiceTotals(items)

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

      // Mark each linked work item so it no longer appears as available to bill.
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

  // These values are derived from database records instead of stored separately,
  // which keeps the dashboard consistent after any edit.
  const uninvoicedItems = workItems.filter(w => !w.invoiced)
  const totalUninvoicedHours = uninvoicedItems.reduce((s, i) => s + Number(i.hours), 0)
  const totalUninvoicedAmount = uninvoicedItems.reduce((sum, item) => sum + getItemAmount(item), 0)
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
            <div>
              <h1 className="font-display text-3xl font-bold">{job.name}</h1>
              <p className="text-xs font-mono text-muted mt-1">
                {getBillingType() === 'flat'
                  ? `Flat fee: ${job.currency} ${Number(job.hourly_rate || 0).toFixed(2)}`
                  : `Hourly: ${job.currency} ${Number(job.hourly_rate || 0).toFixed(2)}/hr`}
              </p>
            </div>
            <div className="flex gap-2">
              <button onClick={openJobSettings} className="btn-secondary text-sm">Edit Job</button>
              <button onClick={() => setShowItemModal(true)} className="btn-secondary text-sm md:hidden">+ {getEntryVerb()}</button>
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
            { label: getBillingType() === 'flat' ? 'Uninvoiced Items' : 'Uninvoiced Hours', value: getBillingType() === 'flat' ? `${uninvoicedItems.length} items` : `${totalUninvoicedHours.toFixed(1)} hrs` },
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
                <div className="col-span-4">
                  <label className="label text-xs">Description *</label>
                  <DescriptionTextarea
                    placeholder="What did you work on?"
                    required
                    value={itemForm.description}
                    onChange={e => setItemForm({ ...itemForm, description: e.target.value })}
                    className="input w-full"
                  />
                </div>
                <div className="col-span-2">
                  <label className="label text-xs">Hours</label>
                  <input 
                    type="number" 
                    min="0" 
                    step="0.25" 
                    placeholder="0.00"
                    value={itemForm.hours} 
                    onChange={e => setItemForm({ ...itemForm, hours: e.target.value })}
                    className="input w-full"
                  />
                </div>
                <div className="col-span-2">
                  <label className="label text-xs">Amount *</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    readOnly={getDerivedAmount(itemForm.hours) != null}
                    value={getDisplayedAmount(itemForm)}
                    onChange={e => setItemForm({ ...itemForm, amount: e.target.value })}
                    className="input w-full"
                  />
                </div>
                <button type="submit" className="btn-primary col-span-2">{getEntryVerb()}</button>
              </div>
            </form>

            {/* Work items list */}
            <div className="space-y-2">
              {workItems.length === 0 ? (
                <div className="text-center py-16 text-muted">
                  <p className="font-display text-base mb-1">No work logged yet</p>
                  <p className="text-sm">Click "{getEntryVerb()}" to add your first entry.</p>
                </div>
              ) : workItems.map(item => (
                <div key={item.id} className="card py-3.5 px-4 flex items-start gap-4 group">
                  <div className="text-xs font-mono text-muted w-24 shrink-0 pt-0.5">
                    {format(new Date(item.date + 'T00:00:00'), 'MMM d, yyyy')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-body whitespace-pre-wrap break-words">{item.description}</p>
                  </div>
                  <div className="flex items-start gap-3 shrink-0">
                    {Number(item.hours || 0) > 0 && (
                      <span className="font-mono text-sm text-muted">
                        {Number(item.hours).toFixed(2)} hrs
                      </span>
                    )}
                    <span className="font-mono text-sm font-medium">
                      {job.currency} {getItemAmount(item).toFixed(2)}
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
                <p className="text-sm">{getBillingType() === 'flat' ? 'Add some items and create your first invoice.' : 'Log some hours and create your first invoice.'}</p>
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
                      Issued {format(new Date(inv.issued_date), 'MMM d, yyyy')}
                      {getBillingType() === 'hourly' && inv.total_hours != null && ` · ${Number(inv.total_hours).toFixed(1)} hrs`}
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

      {/* Log Entry Modal */}
      {showJobSettingsModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 animate-fade-up shadow-xl">
            <h2 className="font-display font-bold text-lg mb-5">Edit Job Settings</h2>
            <form onSubmit={updateJobSettings} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Billing Type</label>
                  <select
                    className="input"
                    value={jobForm.billing_type}
                    onChange={e => setJobForm({ ...jobForm, billing_type: e.target.value })}
                  >
                    <option value="hourly">Hourly</option>
                    <option value="flat">Flat fee</option>
                  </select>
                </div>
                <div>
                  <label className="label">{jobForm.billing_type === 'flat' ? 'Flat Price' : 'Hourly Rate'}</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={jobForm.hourly_rate}
                    onChange={e => setJobForm({ ...jobForm, hourly_rate: e.target.value })}
                  />
                </div>
              </div>

              {(workItems.length > 0 || invoices.length > 0) && (
                <p className="text-xs font-mono text-muted bg-border/30 rounded-lg px-3 py-2">
                  Changing the billing type will reinterpret existing entries using the new pricing model for future totals and invoices.
                </p>
              )}

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeJobSettings} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Save Settings</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Entry Modal */}
      {showItemModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 animate-fade-up shadow-xl">
            <h2 className="font-display font-bold text-lg mb-5">{getBillingType() === 'flat' ? 'Add Flat-Fee Item' : 'Log Work Hours'}</h2>
            <form onSubmit={addWorkItem} className="space-y-4">
              <div>
                <label className="label">Description *</label>
                <DescriptionTextarea className="input w-full" placeholder="What did you work on?" required
                  value={itemForm.description} onChange={e => setItemForm({...itemForm, description: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date *</label>
                  <input className="input" type="date" required
                    value={itemForm.date} onChange={e => setItemForm({...itemForm, date: e.target.value})} />
                </div>
                <div>
                  <label className="label">Hours</label>
                  <input className="input" type="number" min="0" step="0.25" placeholder="0.00"
                    value={itemForm.hours} onChange={e => setItemForm({...itemForm, hours: e.target.value})} />
                </div>
                <div>
                  <label className="label">Amount *</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    readOnly={getDerivedAmount(itemForm.hours) != null}
                    value={getDisplayedAmount(itemForm)}
                    onChange={e => setItemForm({ ...itemForm, amount: e.target.value })}
                  />
                </div>
              </div>
              {(itemForm.hours || itemForm.amount) && (
                <p className="text-xs font-mono text-muted bg-border/30 rounded-lg px-3 py-2">
                  {getDerivedAmount(itemForm.hours) != null
                    ? `Auto-calculated from hours: ${job.currency} ${getDisplayedAmount(itemForm)}`
                    : `Manual amount: ${job.currency} ${Number(itemForm.amount || 0).toFixed(2)}`}
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
                <DescriptionTextarea
                  className="input w-full"
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
                  <label className="label">Hours</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.25"
                    value={editForm.hours}
                    onChange={e => setEditForm({ ...editForm, hours: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Amount *</label>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    step="0.01"
                    readOnly={getDerivedAmount(editForm.hours) != null}
                    value={getDisplayedAmount(editForm)}
                    onChange={e => setEditForm({ ...editForm, amount: e.target.value })}
                  />
                </div>
              </div>

              {(editForm.hours || editForm.amount) && (
                <p className="text-xs font-mono text-muted bg-border/30 rounded-lg px-3 py-2">
                  {getDerivedAmount(editForm.hours) != null
                    ? `Auto-calculated from hours: ${job.currency} ${getDisplayedAmount(editForm)}`
                    : `Manual amount: ${job.currency} ${Number(editForm.amount || 0).toFixed(2)}`}
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
                      <span className="text-xs font-mono text-muted">
                        {Number(item.hours || 0) > 0
                          ? `${Number(item.hours).toFixed(2)}h`
                          : `${job.currency} ${getItemAmount(item).toFixed(2)}`}
                      </span>
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

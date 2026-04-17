import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { generateInvoicePDF } from '../lib/generatePDF'
import { format } from 'date-fns'

export default function InvoicePage() {
  const { jobId, invoiceId } = useParams()
  const navigate = useNavigate()
  const [job, setJob] = useState(null)
  const [invoice, setInvoice] = useState(null)
  const [workItems, setWorkItems] = useState([])
  const [payments, setPayments] = useState([])
  const [showPayModal, setShowPayModal] = useState(false)
  const [payForm, setPayForm] = useState({ amount: '', date: format(new Date(), 'yyyy-MM-dd'), note: '' })
  const [generating, setGenerating] = useState(false)
  const [voiding, setVoiding] = useState(false)

  const [editingItem, setEditingItem] = useState(null)
  const [editForm, setEditForm] = useState({ description: '', date: '', hours: '' })

  const [editingPayment, setEditingPayment] = useState(null)
  const [paymentEditForm, setPaymentEditForm] = useState({ amount: '', date: '', note: '' })

  useEffect(() => {
    fetchAll()
  }, [invoiceId])

  async function fetchAll() {
    // This page needs the parent job, the invoice itself, and any payments
    // already applied so the totals and status badge stay in sync.
    const [{ data: jobData }, { data: inv }, { data: pmts }] = await Promise.all([
      supabase.from('jobs').select('*').eq('id', jobId).single(),
      supabase.from('invoices').select('*').eq('id', invoiceId).single(),
      supabase.from('payments').select('*').eq('invoice_id', invoiceId).order('date', { ascending: false }),
    ])

    setJob(jobData)
    setInvoice(inv)
    setPayments(pmts || [])

    if (inv) {
      // Work items are linked by invoice_id once they have been billed.
      const { data: items } = await supabase
        .from('work_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('date', { ascending: true })
      setWorkItems(items || [])
    }
  }

  async function addPayment(e) {
    e.preventDefault()

    if (invoice?.status === 'void') {
      alert('Void invoices cannot accept new payments')
      return
    }

    try {
      const amount = parseFloat(payForm.amount)
      if (!amount || amount <= 0) {
        alert('Please enter a valid payment amount')
        return
      }

      const { error: paymentError } = await supabase
        .from('payments')
        .insert({ ...payForm, amount, invoice_id: invoiceId })

      if (paymentError) {
        alert('Error logging payment: ' + paymentError.message)
        return
      }

      const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0) + amount
      // Invoice status is recalculated from payment totals rather than manually chosen.
      const status = totalPaid >= Number(invoice.total_amount) ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid'

      const { error: statusError } = await supabase.from('invoices').update({ status }).eq('id', invoiceId)

      if (statusError) {
        alert('Error updating invoice status: ' + statusError.message)
        return
      }

      setShowPayModal(false)
      setPayForm({ amount: '', date: format(new Date(), 'yyyy-MM-dd'), note: '' })
      fetchAll()
    } catch (err) {
      alert('Unexpected error: ' + err.message)
    }
  }

  async function handleGeneratePDF() {
    setGenerating(true)
    try {
      // PDF generation is pure client-side; no extra server call is needed.
      generateInvoicePDF({ invoice, job, workItems, payments })
    } finally {
      setGenerating(false)
    }
  }

  async function handleVoidInvoice() {
    if (invoice?.status === 'void') return

    const confirmed = window.confirm(
      'Void this invoice? This keeps all work items in the dashboard and marks this invoice as void.'
    )
    if (!confirmed) return

    setVoiding(true)

    const { error: invoiceError } = await supabase
      .from('invoices')
      .update({ status: 'void' })
      .eq('id', invoiceId)

    if (invoiceError) {
      setVoiding(false)
      alert('Error voiding invoice: ' + invoiceError.message)
      return
    }

    const { error: workItemsError } = await supabase
      .from('work_items')
      .update({ invoiced: false, invoice_id: null })
      .eq('invoice_id', invoiceId)

    setVoiding(false)

    if (workItemsError) {
      alert('Invoice voided, but failed to reset linked work items: ' + workItemsError.message)
      return
    }

    fetchAll()
  }

  function startEditItem(item) {
    setEditingItem(item)
    setEditForm({
      description: item.description || '',
      date: item.date || '',
      hours: String(item.hours ?? ''),
    })
  }

  function closeEditModal() {
    setEditingItem(null)
    setEditForm({ description: '', date: '', hours: '' })
  }

  async function updateInvoiceItem(e) {
    e.preventDefault()
    if (!editingItem) return

    const parsedHours = parseFloat(editForm.hours)
    if (!parsedHours || parsedHours <= 0) {
      alert('Please enter a valid number of hours')
      return
    }

    const { error: itemError } = await supabase
      .from('work_items')
      .update({
        description: editForm.description,
        date: editForm.date,
        hours: parsedHours,
      })
      .eq('id', editingItem.id)

    if (itemError) {
      alert('Error updating work item: ' + itemError.message)
      return
    }

    // Editing an item changes the invoice totals, so both tables must be updated.
    const updatedItems = workItems.map(item =>
      item.id === editingItem.id
        ? { ...item, description: editForm.description, date: editForm.date, hours: parsedHours }
        : item
    )
    const newTotalHours = updatedItems.reduce((s, i) => s + Number(i.hours), 0)
    const newTotalAmount = newTotalHours * Number(job.hourly_rate)

    const { error: invoiceError } = await supabase
      .from('invoices')
      .update({ total_hours: newTotalHours, total_amount: newTotalAmount })
      .eq('id', invoiceId)

    if (invoiceError) {
      alert('Error updating invoice totals: ' + invoiceError.message)
      return
    }

    closeEditModal()
    fetchAll()
  }

  function startEditPayment(payment) {
    setEditingPayment(payment)
    setPaymentEditForm({
      amount: String(payment.amount ?? ''),
      date: payment.date || '',
      note: payment.note || '',
    })
  }

  function closeEditPaymentModal() {
    setEditingPayment(null)
    setPaymentEditForm({ amount: '', date: '', note: '' })
  }

  async function updatePayment(e) {
    e.preventDefault()
    if (!editingPayment) return

    if (invoice?.status === 'void') {
      alert('Void invoices cannot be updated')
      return
    }

    const parsedAmount = parseFloat(paymentEditForm.amount)
    if (!parsedAmount || parsedAmount <= 0) {
      alert('Please enter a valid payment amount')
      return
    }

    const { error: paymentError } = await supabase
      .from('payments')
      .update({
        amount: parsedAmount,
        date: paymentEditForm.date,
        note: paymentEditForm.note,
      })
      .eq('id', editingPayment.id)

    if (paymentError) {
      alert('Error updating payment: ' + paymentError.message)
      return
    }

    const updatedPayments = payments.map(p =>
      p.id === editingPayment.id
        ? { ...p, amount: parsedAmount, date: paymentEditForm.date, note: paymentEditForm.note }
        : p
    )
    const updatedTotalPaid = updatedPayments.reduce((s, p) => s + Number(p.amount), 0)

    // Status remains derived from money received versus the invoice total.
    const status = updatedTotalPaid >= Number(invoice.total_amount) ? 'paid' : updatedTotalPaid > 0 ? 'partial' : 'unpaid'

    const { error: statusError } = await supabase.from('invoices').update({ status }).eq('id', invoiceId)

    if (statusError) {
      alert('Error updating invoice status: ' + statusError.message)
      return
    }

    closeEditPaymentModal()
    fetchAll()
  }

  if (!invoice || !job) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const totalPaid = payments.reduce((s, p) => s + Number(p.amount), 0)
  const balance = Number(invoice.total_amount) - totalPaid
  const pctPaid = invoice.total_amount > 0 ? (totalPaid / invoice.total_amount) * 100 : 0

  return (
    <div className="min-h-screen bg-paper">
      {/* Top bar keeps the invoice actions visible while scrolling */}
      <nav className="border-b border-border bg-card/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate(`/jobs/${jobId}`)} className="btn-ghost text-xs">← {job.name}</button>
            <span className="text-border">/</span>
            <span className="font-mono text-sm text-muted">#{invoice.invoice_number}</span>
          </div>
          <div className="flex gap-2">
            {invoice.status !== 'void' && (
              <button onClick={() => setShowPayModal(true)} className="btn-secondary text-sm">+ Log Payment</button>
            )}
            {invoice.status !== 'void' && (
              <button
                onClick={handleVoidInvoice}
                disabled={voiding}
                className="btn-secondary text-sm text-red-700 border-red-300 hover:border-red-500"
              >
                {voiding ? 'Voiding...' : 'Void Invoice'}
              </button>
            )}
            <button onClick={handleGeneratePDF} disabled={generating} className="btn-primary text-sm flex items-center gap-2">
              {generating && <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />}
              Download PDF
            </button>
          </div>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="animate-fade-up mb-8">
          <div className="flex items-start justify-between mb-2">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <h1 className="font-display text-2xl font-bold">Invoice #{invoice.invoice_number}</h1>
                <span className={`tag tag-${invoice.status} text-sm px-3 py-1`}>{invoice.status}</span>
              </div>
              <p className="text-sm text-muted font-mono">
                Issued {format(new Date(invoice.issued_date), 'MMMM d, yyyy')}
                {invoice.due_date && ` · Due ${format(new Date(invoice.due_date), 'MMMM d, yyyy')}`}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs font-mono text-muted uppercase tracking-wider mb-1">Total</p>
              <p className="font-display font-bold text-3xl">{job.currency} {Number(invoice.total_amount).toFixed(2)}</p>
            </div>
          </div>

          {totalPaid > 0 && (
            <div className="mt-4">
              <div className="flex justify-between text-xs font-mono text-muted mb-1.5">
                <span>Paid: {job.currency} {totalPaid.toFixed(2)}</span>
                <span>Balance: {job.currency} {balance.toFixed(2)}</span>
              </div>
              <div className="h-2 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${Math.min(pctPaid, 100)}%` }} />
              </div>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="card animate-fade-up-delay-1">
              <h2 className="font-display font-semibold text-sm uppercase tracking-widest text-muted mb-4">Work Items</h2>
              <div className="space-y-0 divide-y divide-border">
                {workItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 py-3 group">
                    <span className="text-xs font-mono text-muted w-20 shrink-0">{format(new Date(item.date + 'T00:00:00'), 'MMM d')}</span>
                    <span className="text-sm flex-1">{item.description}</span>
                    <span className="text-xs font-mono text-muted">{Number(item.hours).toFixed(2)}h</span>
                    <span className="text-sm font-mono font-medium w-24 text-right">{job.currency} {(item.hours * job.hourly_rate).toFixed(2)}</span>
                    <button onClick={() => startEditItem(item)} className="opacity-0 group-hover:opacity-100 text-muted hover:text-ink text-xs transition-all ml-2">Edit</button>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-border flex justify-between">
                <span className="text-xs font-mono text-muted">{invoice.total_hours?.toFixed(2)} hours @ {job.currency} {job.hourly_rate}/hr</span>
                <span className="font-mono font-bold text-sm">{job.currency} {Number(invoice.total_amount).toFixed(2)}</span>
              </div>
            </div>

            <div className="card animate-fade-up-delay-2">
              <h2 className="font-display font-semibold text-sm uppercase tracking-widest text-muted mb-4">Payments Received</h2>
              {payments.length === 0 ? (
                <p className="text-sm text-muted py-2">No payments logged yet.</p>
              ) : (
                <div className="divide-y divide-border">
                  {payments.map(p => (
                    <div key={p.id} className="flex items-center gap-3 py-3 group">
                      <span className="text-xs font-mono text-muted w-20 shrink-0">{format(new Date(p.date + 'T00:00:00'), 'MMM d, yyyy')}</span>
                      <span className="text-sm flex-1 text-muted">{p.note || '—'}</span>
                      <span className="font-mono font-medium text-sm text-green-700">+{job.currency} {Number(p.amount).toFixed(2)}</span>
                      <button
                        onClick={() => startEditPayment(p)}
                        className="opacity-0 group-hover:opacity-100 text-muted hover:text-ink text-xs transition-all ml-2"
                        disabled={invoice.status === 'void'}
                      >
                        Edit
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="card animate-fade-up-delay-1">
              <p className="label mb-2">Bill To</p>
              <p className="font-semibold text-sm">{job.client_name || '—'}</p>
              {job.client_email && <p className="text-xs text-muted mt-0.5">{job.client_email}</p>}
              {job.client_address && <p className="text-xs text-muted mt-0.5 whitespace-pre-line">{job.client_address}</p>}
            </div>

            <div className="card animate-fade-up-delay-2">
              <p className="label mb-2">Payable To</p>
              <p className="font-semibold text-sm">{invoice.payable_to || '—'}</p>
              {invoice.payable_details && <p className="text-xs text-muted mt-1 whitespace-pre-line font-mono">{invoice.payable_details}</p>}
            </div>

            <div className="bg-ink rounded-xl p-4 text-paper animate-fade-up-delay-3">
              <p className="text-xs font-mono text-paper/50 uppercase tracking-wider mb-3">Summary</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-paper/70">Invoice total</span>
                  <span className="font-mono">{job.currency} {Number(invoice.total_amount).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-green-400">
                  <span>Paid</span>
                  <span className="font-mono">- {job.currency} {totalPaid.toFixed(2)}</span>
                </div>
                <div className="border-t border-paper/10 pt-1.5 flex justify-between font-bold">
                  <span>Balance Due</span>
                  <span className="font-mono text-accent">{job.currency} {balance.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {invoice.notes && (
              <div className="card animate-fade-up-delay-3">
                <p className="label mb-2">Notes</p>
                <p className="text-xs text-muted">{invoice.notes}</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {showPayModal && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 animate-fade-up shadow-xl">
            <h2 className="font-display font-bold text-lg mb-5">Log Payment</h2>
            <form onSubmit={addPayment} className="space-y-4">
              <div>
                <label className="label">Amount ({job.currency}) *</label>
                <input className="input" type="number" min="0.01" step="0.01" placeholder="0.00" required value={payForm.amount} onChange={e => setPayForm({ ...payForm, amount: e.target.value })} />
                {balance > 0 && <p className="text-xs text-muted mt-1 font-mono">Balance due: {job.currency} {balance.toFixed(2)}</p>}
              </div>
              <div>
                <label className="label">Date *</label>
                <input className="input" type="date" required value={payForm.date} onChange={e => setPayForm({ ...payForm, date: e.target.value })} />
              </div>
              <div>
                <label className="label">Note</label>
                <input className="input" placeholder="Bank transfer, cheque, etc." value={payForm.note} onChange={e => setPayForm({ ...payForm, note: e.target.value })} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setShowPayModal(false)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Save Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editingItem && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 animate-fade-up shadow-xl">
            <h2 className="font-display font-bold text-lg mb-5">Edit Work Item</h2>
            <form onSubmit={updateInvoiceItem} className="space-y-4">
              <div>
                <label className="label">Description *</label>
                <input className="input" required value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Date *</label>
                  <input className="input" type="date" required value={editForm.date} onChange={e => setEditForm({ ...editForm, date: e.target.value })} />
                </div>
                <div>
                  <label className="label">Hours *</label>
                  <input className="input" type="number" min="0" step="0.25" required value={editForm.hours} onChange={e => setEditForm({ ...editForm, hours: e.target.value })} />
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

      {editingPayment && (
        <div className="fixed inset-0 bg-ink/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 animate-fade-up shadow-xl">
            <h2 className="font-display font-bold text-lg mb-5">Edit Payment</h2>
            <form onSubmit={updatePayment} className="space-y-4">
              <div>
                <label className="label">Amount ({job.currency}) *</label>
                <input className="input" type="number" min="0.01" step="0.01" required value={paymentEditForm.amount} onChange={e => setPaymentEditForm({ ...paymentEditForm, amount: e.target.value })} />
              </div>
              <div>
                <label className="label">Date *</label>
                <input className="input" type="date" required value={paymentEditForm.date} onChange={e => setPaymentEditForm({ ...paymentEditForm, date: e.target.value })} />
              </div>
              <div>
                <label className="label">Note</label>
                <input className="input" placeholder="Bank transfer, cheque, etc." value={paymentEditForm.note} onChange={e => setPaymentEditForm({ ...paymentEditForm, note: e.target.value })} />
              </div>
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={closeEditPaymentModal} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-primary flex-1">Update Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'

export function generateInvoicePDF({ invoice, job, workItems, payments }) {
  const doc = new jsPDF()
  const pageW = doc.internal.pageSize.getWidth()
  const accent = [200, 240, 74]   // #c8f04a
  const ink    = [14, 14, 14]
  const muted  = [138, 138, 122]

  // ── Header bar ──────────────────────────────────────────
  doc.setFillColor(...accent)
  doc.rect(0, 0, pageW, 38, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(22)
  doc.setTextColor(...ink)
  doc.text('INVOICE', 14, 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...ink)
  doc.text(`#${invoice.invoice_number}`, 14, 31)

  // Issued / Due dates top-right
  doc.setFontSize(9)
  doc.text(`Issued: ${format(new Date(invoice.issued_date), 'MMM d, yyyy')}`, pageW - 14, 18, { align: 'right' })
  if (invoice.due_date) {
    doc.text(`Due: ${format(new Date(invoice.due_date), 'MMM d, yyyy')}`, pageW - 14, 26, { align: 'right' })
  }

  // ── From / To block ─────────────────────────────────────
  let y = 50

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...muted)
  doc.text('FROM', 14, y)
  doc.text('BILL TO', pageW / 2, y)

  y += 5
  doc.setTextColor(...ink)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.text(invoice.payable_to || 'Your Name / Business', 14, y)
  doc.text(job.client_name || 'Client Name', pageW / 2, y)

  if (invoice.payable_details) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...muted)
    const lines = doc.splitTextToSize(invoice.payable_details, 80)
    doc.text(lines, 14, y + 6)
  }

  if (job.client_email || job.client_address) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...muted)
    const clientLines = [job.client_email, job.client_address].filter(Boolean)
    doc.text(clientLines, pageW / 2, y + 6)
  }

  // ── Work items table ─────────────────────────────────────
  y = 95

  autoTable(doc, {
    startY: y,
    head: [['Date', 'Description', 'Hours', `Rate (${job.currency || 'USD'})`, 'Amount']],
    body: workItems.map(item => [
      format(new Date(item.date), 'MMM d, yyyy'),
      item.description,
      item.hours.toFixed(2),
      `${Number(job.hourly_rate).toFixed(2)}`,
      `${(item.hours * job.hourly_rate).toFixed(2)}`,
    ]),
    foot: [[
      '', '', 
      `${invoice.total_hours?.toFixed(2)} hrs`,
      'Total',
      `${job.currency || 'USD'} ${Number(invoice.total_amount).toFixed(2)}`
    ]],
    headStyles: { fillColor: ink, textColor: 255, fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: [240, 237, 228], textColor: ink, fontStyle: 'bold' },
    bodyStyles: { fontSize: 9, textColor: ink },
    alternateRowStyles: { fillColor: [250, 248, 243] },
    columnStyles: {
      0: { cellWidth: 28 },
      2: { halign: 'right', cellWidth: 18 },
      3: { halign: 'right', cellWidth: 26 },
      4: { halign: 'right', cellWidth: 26 },
    },
    margin: { left: 14, right: 14 },
  })

  // ── Payments table ───────────────────────────────────────
  if (payments?.length > 0) {
    const afterTable = doc.lastAutoTable.finalY + 12
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.setTextColor(...muted)
    doc.text('PAYMENTS RECEIVED', 14, afterTable)

    autoTable(doc, {
      startY: afterTable + 4,
      head: [['Date', 'Note', 'Amount']],
      body: payments.map(p => [
        format(new Date(p.date), 'MMM d, yyyy'),
        p.note || '—',
        `${job.currency || 'USD'} ${Number(p.amount).toFixed(2)}`,
      ]),
      headStyles: { fillColor: [220, 216, 200], textColor: ink, fontStyle: 'bold', fontSize: 8 },
      bodyStyles: { fontSize: 9, textColor: ink },
      margin: { left: 14, right: 14 },
    })
  }

  // ── Balance due ──────────────────────────────────────────
  const totalPaid = (payments || []).reduce((s, p) => s + Number(p.amount), 0)
  const balanceDue = Number(invoice.total_amount) - totalPaid

  const finalY = doc.lastAutoTable.finalY + 10
  doc.setFillColor(...accent)
  doc.roundedRect(pageW - 80, finalY, 66, 20, 3, 3, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(...ink)
  doc.text('BALANCE DUE', pageW - 47, finalY + 7, { align: 'center' })
  doc.setFontSize(13)
  doc.text(
    `${job.currency || 'USD'} ${balanceDue.toFixed(2)}`,
    pageW - 47, finalY + 16, { align: 'center' }
  )

  // ── Notes ────────────────────────────────────────────────
  if (invoice.notes) {
    const notesY = finalY + 30
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(...muted)
    doc.text('NOTES', 14, notesY)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    doc.setTextColor(...ink)
    const noteLines = doc.splitTextToSize(invoice.notes, pageW - 28)
    doc.text(noteLines, 14, notesY + 5)
  }

  // ── Footer ───────────────────────────────────────────────
  const pageH = doc.internal.pageSize.getHeight()
  doc.setFillColor(...ink)
  doc.rect(0, pageH - 10, pageW, 10, 'F')
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7)
  doc.setTextColor(255, 255, 255)
  doc.text(`${job.name} · Invoice ${invoice.invoice_number}`, pageW / 2, pageH - 4, { align: 'center' })

  doc.save(`invoice-${invoice.invoice_number}.pdf`)
}

# Billable — Invoice & Hours Tracker

A clean, minimal web app for freelancers to track work hours per job and generate PDF invoices.

---

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Frontend    | React 18 + Vite                     |
| Styling     | Tailwind CSS                        |
| Routing     | React Router v6                     |
| Auth + DB   | Supabase (Postgres + Auth)          |
| PDF         | jsPDF + jspdf-autotable (in-browser)|

---

## Project Structure

```
src/
├── context/
│   └── AuthContext.jsx       # Auth state (user, signIn, signOut)
├── lib/
│   ├── supabase.js           # Supabase client + SQL schema (in comments)
│   └── generatePDF.js        # PDF invoice generation logic
├── pages/
│   ├── AuthPage.jsx          # Login / Sign up
│   ├── JobsPage.jsx          # Job listing + create job
│   ├── JobDashboard.jsx      # Work log + invoice list for a job
│   └── InvoicePage.jsx       # Invoice detail + payments + PDF export
└── main.jsx                  # App entry, routes, auth guard
```

---

## Setup Instructions

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase (free)

1. Go to [supabase.com](https://supabase.com) and create a free account
2. Create a **New Project**
3. Once created, go to **Settings → API**
4. Copy your **Project URL** and **anon/public key**

### 3. Run the database schema

1. In your Supabase dashboard, go to **SQL Editor → New Query**
2. Open `src/lib/supabase.js` and copy the entire SQL block (between the `=====` comments)
3. Paste it into the SQL editor and click **Run**

This creates the tables: `jobs`, `work_items`, `invoices`, `payments`
And enables Row Level Security so users only see their own data.

### 4. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and fill in your Supabase credentials:

```
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 5. Run the app

```bash
npm run dev
```

Visit `http://localhost:5173`

---

## User Flow

```
Sign Up / Login
     ↓
Jobs Dashboard  ──→  Create New Job (name, client, hourly rate, currency)
     ↓
Job Dashboard
  ├── Log Work Hours  (description, date, hours → auto-calculates amount)
  ├── View Work Log   (see invoiced vs uninvoiced items)
  └── Create Invoice  (select items, set invoice # / dates / payment details)
         ↓
     Invoice Page
       ├── View line items & totals
       ├── Log Payments (tracks partial payments, running balance)
       ├── Status: unpaid → partial → paid
       └── Download PDF (branded invoice with jsPDF)
```

---

## Data Model

```
jobs
  └── work_items (many)
  └── invoices (many)
        └── payments (many)
```

- Work items are linked to an invoice once invoiced (`invoiced: true`, `invoice_id`)
- Payments update the invoice status automatically
- All data scoped to the logged-in user via Supabase RLS

---

## Extending the App

Ideas for next steps:
- **Edit job settings** (rate, client details)
- **Invoice templates** (logo upload, brand color)
- **Email invoice** via Supabase Edge Functions + Resend
- **Recurring jobs / retainer** billing
- **Export CSV** of all work items
- **Dark mode** toggle
- **Multiple rates** per job (different task types)

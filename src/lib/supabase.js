import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase env vars. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env and restart the dev server.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

/*
=============================================
  SUPABASE SQL SCHEMA — run this in:
  Supabase Dashboard > SQL Editor > New Query
=============================================

-- Jobs table
create table jobs (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  client_name text,
  client_email text,
  client_address text,
  hourly_rate numeric(10,2) default 0,
  currency text default 'USD',
  created_at timestamptz default now()
);

-- Work items (logged hours)
create table work_items (
  id uuid default gen_random_uuid() primary key,
  job_id uuid references jobs(id) on delete cascade not null,
  description text not null,
  date date not null,
  hours numeric(5,2) not null,
  invoiced boolean default false,
  invoice_id uuid,
  created_at timestamptz default now()
);

-- Invoices
create table invoices (
  id uuid default gen_random_uuid() primary key,
  job_id uuid references jobs(id) on delete cascade not null,
  invoice_number text not null,
  issued_date date not null,
  due_date date,
  total_hours numeric(8,2),
  total_amount numeric(10,2),
  status text default 'unpaid', -- unpaid | partial | paid
  notes text,
  payable_to text,
  payable_details text,
  created_at timestamptz default now()
);

-- Payments
create table payments (
  id uuid default gen_random_uuid() primary key,
  invoice_id uuid references invoices(id) on delete cascade not null,
  amount numeric(10,2) not null,
  date date not null,
  note text,
  created_at timestamptz default now()
);

-- RLS (Row Level Security) — users only see their own data
alter table jobs enable row level security;
alter table work_items enable row level security;
alter table invoices enable row level security;
alter table payments enable row level security;

create policy "Users own their jobs" on jobs
  for all using (auth.uid() = user_id);

create policy "Users access work items via jobs" on work_items
  for all using (
    job_id in (select id from jobs where user_id = auth.uid())
  );

create policy "Users access invoices via jobs" on invoices
  for all using (
    job_id in (select id from jobs where user_id = auth.uid())
  );

create policy "Users access payments via invoices" on payments
  for all using (
    invoice_id in (
      select i.id from invoices i
      join jobs j on j.id = i.job_id
      where j.user_id = auth.uid()
    )
  );

=============================================
*/

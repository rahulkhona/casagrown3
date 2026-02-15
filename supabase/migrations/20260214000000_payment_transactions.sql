-- Migration: Payment Transactions table
-- Tracks Stripe PaymentIntents and links them to point_ledger entries.
-- This is the server-side record of truth — webhooks write here,
-- and the frontend is just optimistic UI.

create type payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');

create table payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,

  -- Stripe identifiers
  stripe_payment_intent_id text unique,  -- pi_xxx (null for mock)
  stripe_client_secret text,

  -- Amount
  amount_cents integer not null,
  currency text not null default 'usd',
  service_fee_cents integer not null default 0,

  -- Points
  points_amount integer not null,

  -- Status tracking
  status payment_status not null default 'pending',

  -- Provider ('mock' or 'stripe')
  provider text not null default 'mock',

  -- Webhook confirmation
  webhook_received_at timestamptz,

  -- Link to point_ledger entry (set when points are credited)
  point_ledger_id uuid references point_ledger(id),

  -- Metadata
  metadata jsonb default '{}',

  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Indexes
create index idx_payment_transactions_user on payment_transactions(user_id);
create index idx_payment_transactions_status on payment_transactions(status);
create index idx_payment_transactions_stripe_id on payment_transactions(stripe_payment_intent_id);

-- RLS
alter table payment_transactions enable row level security;

-- Users can read their own transactions
create policy "Users can read own payment transactions"
  on payment_transactions for select
  using (auth.uid() = user_id);

-- Only service role can insert/update (via edge functions)
-- No insert/update policy for authenticated users

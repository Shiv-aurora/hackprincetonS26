-- Run this in your Supabase SQL editor (Dashboard → SQL Editor → New query).
-- Creates the activity_history table with row-level security so each user
-- can only read and write their own rows.

create table if not exists activity_history (
  id            uuid        default gen_random_uuid() primary key,
  user_id       uuid        references auth.users(id) on delete cascade not null,
  prompt        text        not null,
  response      text,
  proxy_sent    text,
  routing_path  text,
  entities_proxied integer  default 0,
  audit_id      text,
  created_at    timestamptz default now()
);

-- Index for fast per-user history lookups.
create index if not exists activity_history_user_id_created_at
  on activity_history (user_id, created_at desc);

-- Enable row-level security.
alter table activity_history enable row level security;

-- Policy: users can insert, select, and delete their own rows only.
create policy "Users manage own history"
  on activity_history
  for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Phase 4 — live meetings + notification center (ARCHITECTURE.md §4:
-- meetings, meeting_messages are part of the 27-table design; notifications
-- backs the Phase 4 notification center).
-- PREPARED, NOT APPLIED — no Supabase project is connected yet
-- (Integration Required: needs Lutfi's own Supabase project, see
-- apps/orchestrator/src/db/supabase-repository.ts).

create table if not exists public.meetings (
  id uuid primary key,
  topic text not null,
  participant_ids jsonb not null default '[]'::jsonb,
  rounds integer not null default 2,
  status text not null check (status in ('running', 'completed', 'failed')),
  artifact_file text,
  error text,
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.meeting_messages (
  id uuid primary key,
  meeting_id uuid not null references public.meetings (id),
  seq integer not null,
  agent_id text not null,
  kind text not null default 'speech' check (kind in ('speech', 'system')),
  content text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_meeting_messages_meeting
  on public.meeting_messages (meeting_id, seq);

create table if not exists public.notifications (
  id uuid primary key,
  kind text not null check (kind in
    ('task.completed', 'task.failed', 'approval.pending',
     'meeting.completed', 'meeting.failed')),
  title text not null,
  detail text not null default '',
  entity_ref text not null default '',
  agent_id text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_unread
  on public.notifications (is_read, created_at desc);

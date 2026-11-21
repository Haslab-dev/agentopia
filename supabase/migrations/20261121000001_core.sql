-- ═══════════════════════════════════════════════════════════════════════════
-- Living World — core schema (ARCHITECTURE.md §4, Phase 3 subset)
-- INTEGRATION REQUIRED: this migration is prepared and versioned, but NOT
-- applied anywhere. It runs when Lutfi creates his Supabase project:
--   supabase db push        (or paste into the SQL editor)
-- RLS is ENABLED on every table with NO policies by default (deny-all for
-- anon/authenticated roles) — writing the org-isolation policies is part of
-- connecting the project, together with Supabase Auth. The orchestrator's
-- service role bypasses RLS; the browser must never hold that key.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";

-- ── Identity & providers ────────────────────────────────────────────────────
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id),
  provider text not null,               -- 'kenari' | 'openai' | 'gemini' | 'anthropic' | 'compatible'
  base_url text,
  encrypted_api_key text,               -- encrypted at rest; NEVER exposed to clients
  status text not null default 'untested',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Agents ──────────────────────────────────────────────────────────────────
create table if not exists public.agent_profiles (
  id text primary key,                  -- slug id, matches the 3D campus agent ids
  org_id uuid references public.organizations(id),
  team_id uuid,
  name text not null,
  role text not null,
  description text not null default '',
  avatar_config jsonb not null default '{}',   -- shirt/pants/hair/skin/desk_index
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_configs (
  agent_id text primary key references public.agent_profiles(id) on delete cascade,
  provider_connection_id uuid references public.provider_connections(id),
  provider text not null default 'kenari',
  model text not null,
  temperature real not null default 0.7,
  system_prompt text not null default '',
  allowed_tools text[] not null default '{}',
  workspace text not null default '',
  token_limit integer,
  cost_limit numeric,
  updated_at timestamptz not null default now()
);

-- ── Work ────────────────────────────────────────────────────────────────────
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id),
  title text not null,
  instructions text not null default '',
  kind text not null default 'general',
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'queued'
    check (status in ('queued','running','waiting_input','waiting_approval','completed','failed','cancelled','paused')),
  assignee_agent_id text references public.agent_profiles(id),
  parent_task_id uuid references public.tasks(id),
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  status text not null default 'queued',
  assignee_agent_id text references public.agent_profiles(id),
  order_index integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.task_dependencies (
  task_id uuid not null references public.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references public.tasks(id) on delete cascade,
  primary key (task_id, depends_on_task_id)
);

-- Append-only: this is the table the 3D world ultimately visualises (§1.3).
create table if not exists public.task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.tasks(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  agent_id text not null references public.agent_profiles(id),
  run_number integer not null default 1,
  provider text not null,
  model text not null,
  status text not null default 'running'
    check (status in ('running','waiting_approval','completed','failed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  error text,
  is_demo boolean not null default false
);

create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references public.organizations(id),
  task_id uuid not null references public.tasks(id) on delete cascade,
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  tool_call_id uuid,
  action_summary text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  decided_by text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.tool_calls (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agent_runs(id) on delete cascade,
  tool_name text not null,
  args_summary text not null default '',       -- sanitised summary, never raw secrets
  result_status text not null,
  duration_ms integer,
  requires_approval boolean not null default false,
  approval_id uuid references public.approvals(id),
  created_at timestamptz not null default now()
);

create table if not exists public.artifacts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.tasks(id) on delete set null,
  run_id uuid references public.agent_runs(id) on delete set null,
  agent_id text references public.agent_profiles(id),
  kind text not null default 'doc',
  title text not null,
  file_name text not null,                     -- becomes storage_path in Supabase Storage
  created_at timestamptz not null default now()
);

create table if not exists public.usage_records (
  id uuid primary key default gen_random_uuid(),
  agent_id text references public.agent_profiles(id),
  run_id uuid references public.agent_runs(id) on delete set null,
  provider text not null,
  model text not null,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  cost_usd numeric not null default 0,         -- estimate at the tariff noted in the app README
  latency_ms integer not null default 0,
  created_at timestamptz not null default now()
);

-- Append-only audit trail.
create table if not exists public.activity_logs (
  id bigint generated always as identity primary key,
  org_id uuid references public.organizations(id),
  actor text not null check (actor in ('user','agent','system')),
  action text not null,
  entity_ref text not null default '',
  detail text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_tasks_status on public.tasks(status);
create index if not exists idx_runs_task on public.agent_runs(task_id);
create index if not exists idx_task_events_task on public.task_events(task_id);
create index if not exists idx_usage_day on public.usage_records(created_at);

-- ── RLS: enabled, deny-all until org policies are written at connect time ──
alter table public.organizations enable row level security;
alter table public.provider_connections enable row level security;
alter table public.agent_profiles enable row level security;
alter table public.agent_configs enable row level security;
alter table public.tasks enable row level security;
alter table public.subtasks enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.task_events enable row level security;
alter table public.agent_runs enable row level security;
alter table public.approvals enable row level security;
alter table public.tool_calls enable row level security;
alter table public.artifacts enable row level security;
alter table public.usage_records enable row level security;
alter table public.activity_logs enable row level security;

-- Fanthom — Phase 5 (full Fathom parity). Applies on top of 0001_init.sql; idempotent (safe to re-run).
-- Column names mirror src/lib/types.ts "PHASE 5" 1:1. IDs are text (seed uses readable ids like `fld_sales`).
-- Access model unchanged: RLS on, no policies; all reads/writes go through server code with the service role.

-- ---------------------------------------------------------------------------
-- A. Library: folders + meeting organisation columns
-- ---------------------------------------------------------------------------
create table if not exists folders (
  id            text primary key default gen_random_uuid()::text,
  workspace_id  text not null references workspaces(id) on delete cascade,
  name          text not null,
  color         text,
  created_at    timestamptz not null default now()
);
create index if not exists folders_workspace_idx on folders (workspace_id, lower(name));

alter table meetings add column if not exists folder_id  text references folders(id) on delete set null;
alter table meetings add column if not exists starred    boolean not null default false;
alter table meetings add column if not exists deleted_at timestamptz;
create index if not exists meetings_workspace_deleted_idx on meetings (workspace_id, deleted_at);
create index if not exists meetings_folder_idx on meetings (folder_id) where folder_id is not null;

-- ---------------------------------------------------------------------------
-- C. Insights: trackers + deal overrides
-- ---------------------------------------------------------------------------
create table if not exists trackers (
  id            text primary key default gen_random_uuid()::text,
  workspace_id  text not null references workspaces(id) on delete cascade,
  name          text not null,
  description   text,
  keywords      text[] not null default '{}',
  color         text not null default '#60a5fa',
  created_at    timestamptz not null default now()
);
create index if not exists trackers_workspace_idx on trackers (workspace_id, created_at);

create table if not exists deal_overrides (
  workspace_id  text not null references workspaces(id) on delete cascade,
  domain        text not null check (domain = lower(domain)),
  name          text,
  stage         text check (stage in ('discovery','evaluation','proposal','negotiation','closed_won','closed_lost')),
  amount        numeric,
  close_date    date,
  bant          jsonb not null default '{}'::jsonb,
  meddpicc      jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  primary key (workspace_id, domain)
);

-- ---------------------------------------------------------------------------
-- D. Collaboration: comments + reactions
-- ---------------------------------------------------------------------------
create table if not exists comments (
  id            text primary key default gen_random_uuid()::text,
  meeting_id    text not null references meetings(id) on delete cascade,
  timestamp_ms  integer,
  body          text not null,
  mentions      text[] not null default '{}',
  author_id     text not null,
  author_name   text not null,
  author_color  text not null default '#60a5fa',
  parent_id     text references comments(id) on delete cascade,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz
);
create index if not exists comments_meeting_idx on comments (meeting_id, timestamp_ms, created_at);
create index if not exists comments_parent_idx on comments (parent_id) where parent_id is not null;

create table if not exists reactions (
  id          text primary key default gen_random_uuid()::text,
  meeting_id  text not null references meetings(id) on delete cascade,
  segment_id  text not null references transcript_segments(id) on delete cascade,
  emoji       text not null,
  user_id     text not null,
  user_name   text not null,
  created_at  timestamptz not null default now(),
  unique (segment_id, user_id, emoji)
);
create index if not exists reactions_meeting_idx on reactions (meeting_id);

-- ---------------------------------------------------------------------------
-- D. Integrations: webhooks, Slack, CRM logs
-- ---------------------------------------------------------------------------
create table if not exists webhooks (
  id                text primary key default gen_random_uuid()::text,
  workspace_id      text not null references workspaces(id) on delete cascade,
  url               text not null,
  description       text,
  events            text[] not null default '{meeting.ready}',
  secret            text not null,
  active            boolean not null default true,
  last_status       integer,
  last_delivery_at  timestamptz,
  created_at        timestamptz not null default now()
);
create index if not exists webhooks_workspace_idx on webhooks (workspace_id, created_at);

create table if not exists webhook_deliveries (
  id             text primary key default gen_random_uuid()::text,
  webhook_id     text not null references webhooks(id) on delete cascade,
  event          text not null,
  test           boolean not null default false,
  request_body   text not null default '',
  status_code    integer,
  ok             boolean not null default false,
  response_body  text,
  error          text,
  duration_ms    integer not null default 0,
  created_at     timestamptz not null default now()
);
create index if not exists webhook_deliveries_webhook_idx on webhook_deliveries (webhook_id, created_at desc);

create table if not exists slack_configs (
  workspace_id          text primary key references workspaces(id) on delete cascade,
  webhook_url           text,
  channel_label         text,
  auto_post_on_ready    boolean not null default false,
  include_summary       boolean not null default true,
  include_action_items  boolean not null default true,
  include_highlights    boolean not null default false,
  updated_at            timestamptz not null default now()
);

create table if not exists crm_sync_logs (
  id           text primary key default gen_random_uuid()::text,
  meeting_id   text not null references meetings(id) on delete cascade,
  provider     text not null check (provider in ('hubspot','salesforce')),
  status       text not null check (status in ('simulated','success','failed')),
  field_count  integer not null default 0,
  fields       jsonb not null default '[]'::jsonb,
  message      text not null default '',
  created_at   timestamptz not null default now()
);
create index if not exists crm_sync_logs_meeting_idx on crm_sync_logs (meeting_id, created_at desc);

-- ---------------------------------------------------------------------------
-- B. Capture: simulated bot sessions + calendar events
-- ---------------------------------------------------------------------------
create table if not exists bot_sessions (
  id                  text primary key default gen_random_uuid()::text,
  workspace_id        text not null references workspaces(id) on delete cascade,
  meeting_url         text not null,
  platform            text not null default 'unknown' check (platform in ('zoom','google_meet','teams','unknown')),
  title               text not null,
  state               text not null default 'joining' check (state in ('joining','waiting_room','recording','processing','done','failed')),
  simulated           boolean not null default true,
  meeting_id          text references meetings(id) on delete set null,
  error               text,
  events              jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  joined_at           timestamptz,
  admitted_at         timestamptz,
  recording_ended_at  timestamptz,
  completed_at        timestamptz,
  updated_at          timestamptz not null default now()
);
create index if not exists bot_sessions_workspace_idx on bot_sessions (workspace_id, created_at desc);

-- Calendar events EXTEND upcoming_meetings (one table feeds both the upcoming strip and /calendar).
alter table upcoming_meetings add column if not exists meeting_url      text;
alter table upcoming_meetings add column if not exists platform         text not null default 'unknown';
alter table upcoming_meetings add column if not exists organizer_email  text;
alter table upcoming_meetings add column if not exists is_external      boolean not null default false;
alter table upcoming_meetings add column if not exists source           text not null default 'seed';
alter table upcoming_meetings add column if not exists record_override  boolean;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'upcoming_meetings_platform_check') then
    alter table upcoming_meetings add constraint upcoming_meetings_platform_check
      check (platform in ('zoom','google_meet','teams','unknown'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'upcoming_meetings_source_check') then
    alter table upcoming_meetings add constraint upcoming_meetings_source_check
      check (source in ('seed','google','outlook'));
  end if;
end $$;
create index if not exists upcoming_meetings_workspace_start_idx on upcoming_meetings (workspace_id, start);

-- ---------------------------------------------------------------------------
-- E. Account & team: prefs, members, notifications
-- ---------------------------------------------------------------------------
create table if not exists user_prefs (
  user_id               text primary key references users(id) on delete cascade,
  default_template      text not null default 'general',
  default_language      text not null default 'en',
  default_share_access  text not null default 'anyone_with_link' check (default_share_access in ('anyone_with_link','same_domain','invited')),
  auto_record_rule      text not null default 'all' check (auto_record_rule in ('all','external_only','internal_only','none')),
  email_recap_enabled   boolean not null default true,
  notify_meeting_ready  boolean not null default true,
  notify_mentions       boolean not null default true,
  notify_shared         boolean not null default true,
  calendar_connected    boolean not null default false,
  onboarding_completed  boolean not null default false,
  updated_at            timestamptz not null default now()
);

create table if not exists team_members (
  id            text primary key default gen_random_uuid()::text,
  workspace_id  text not null references workspaces(id) on delete cascade,
  name          text not null,
  email         text not null,
  role          text not null default 'member' check (role in ('owner','admin','member','guest')),
  title         text,
  team          text,
  color         text not null default '#60a5fa',
  status        text not null default 'active' check (status in ('active','invited')),
  invited_at    timestamptz,
  joined_at     timestamptz
);
create unique index if not exists team_members_workspace_email_idx on team_members (workspace_id, lower(email));

create table if not exists notifications (
  id          text primary key default gen_random_uuid()::text,
  user_id     text not null references users(id) on delete cascade,
  kind        text not null check (kind in ('meeting_ready','mention','shared_with_you','comment','bot_status','invite')),
  title       text not null,
  body        text,
  href        text,
  meeting_id  text references meetings(id) on delete cascade,
  actor_name  text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx on notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- Row level security: on, no policies (service role bypasses RLS).
-- ---------------------------------------------------------------------------
alter table folders enable row level security;
alter table trackers enable row level security;
alter table deal_overrides enable row level security;
alter table comments enable row level security;
alter table reactions enable row level security;
alter table webhooks enable row level security;
alter table webhook_deliveries enable row level security;
alter table slack_configs enable row level security;
alter table crm_sync_logs enable row level security;
alter table bot_sessions enable row level security;
alter table user_prefs enable row level security;
alter table team_members enable row level security;
alter table notifications enable row level security;

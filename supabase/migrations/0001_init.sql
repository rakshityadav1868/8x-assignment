-- Fanthom — initial schema.
-- Column names mirror src/lib/types.ts 1:1 (snake_case, *_ms integer offsets) so rows map without translation.
-- IDs are text (uuid by default) so the seed can use stable readable ids like `m_q4-roadmap-planning`.
-- Access model (demo): no auth; all reads/writes go through server code with the service-role key.
-- RLS is enabled with no policies, so the anon key can read nothing directly.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Workspaces & users
-- ---------------------------------------------------------------------------
create table if not exists workspaces (
  id          text primary key default gen_random_uuid()::text,
  name        text not null,
  domain      text not null,
  created_at  timestamptz not null default now()
);

create table if not exists users (
  id            text primary key default gen_random_uuid()::text,
  workspace_id  text not null references workspaces(id) on delete cascade,
  name          text not null,
  email         text not null,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Meetings
-- ---------------------------------------------------------------------------
create table if not exists meetings (
  id                   text primary key default gen_random_uuid()::text,
  workspace_id         text not null references workspaces(id) on delete cascade,
  title                text not null,
  meeting_type         text not null default 'general' check (meeting_type in
                         ('sales','customer_success','standup','one_on_one','interview','project_update','planning','qa','general')),
  scheduled_start      timestamptz,
  scheduled_end        timestamptz,
  recording_start      timestamptz,
  recording_end        timestamptz,
  duration_sec         integer not null default 0,
  media_url            text,
  media_kind           text not null default 'audio' check (media_kind in ('video','audio')),
  status               text not null default 'processing' check (status in ('processing','ready','failed')),
  processing_stage     text not null default 'awaiting_upload' check (processing_stage in
                         ('awaiting_upload','queued','transcribing','analyzing','ready','failed')),
  processing_error     text,
  transcript_language  text not null default 'en',
  share_token          text unique,
  share_access         text not null default 'anyone_with_link' check (share_access in ('anyone_with_link','same_domain','invited')),
  share_invited_emails text[] not null default '{}',
  recorded_by          text,
  synthetic            boolean not null default false,
  -- cached AI decisions (Decision[]); null = never generated
  decisions            jsonb,
  created_at           timestamptz not null default now()
);
create index if not exists meetings_workspace_start_idx
  on meetings (workspace_id, (coalesce(recording_start, scheduled_start, created_at)) desc);

create table if not exists participants (
  id           text primary key default gen_random_uuid()::text,
  meeting_id   text not null references meetings(id) on delete cascade,
  name         text not null,
  email        text,
  is_external  boolean not null default false,
  color        text not null default '#60a5fa',
  position     integer not null default 0
);
create index if not exists participants_meeting_idx on participants (meeting_id, position);

create table if not exists transcript_segments (
  id              text primary key default gen_random_uuid()::text,
  meeting_id      text not null references meetings(id) on delete cascade,
  participant_id  text references participants(id) on delete set null,
  start_ms        integer not null,
  end_ms          integer not null,
  text            text not null,
  tsv             tsvector generated always as (to_tsvector('english', coalesce(text, ''))) stored
);
create index if not exists transcript_segments_meeting_start_idx on transcript_segments (meeting_id, start_ms);
create index if not exists transcript_segments_tsv_idx on transcript_segments using gin (tsv);

-- ---------------------------------------------------------------------------
-- AI artifacts
-- ---------------------------------------------------------------------------
create table if not exists summary_templates (
  key     text primary key,
  name    text not null,
  prompt  text not null default ''
);

create table if not exists summaries (
  id                   text primary key default gen_random_uuid()::text,
  meeting_id           text not null references meetings(id) on delete cascade,
  template             text not null,
  language             text not null default 'en',
  markdown             text not null default '',
  sections             jsonb not null default '[]'::jsonb,
  custom_instructions  text,
  created_at           timestamptz not null default now()
);
-- one cached summary per meeting × template × language × custom instructions
create unique index if not exists summaries_cache_key
  on summaries (meeting_id, template, language, coalesce(custom_instructions, ''));

create table if not exists action_items (
  id                       text primary key default gen_random_uuid()::text,
  meeting_id               text not null references meetings(id) on delete cascade,
  description              text not null,
  assignee_participant_id  text references participants(id) on delete set null,
  timestamp_ms             integer,
  completed                boolean not null default false,
  user_generated           boolean not null default false,
  created_at               timestamptz not null default now()
);
create index if not exists action_items_meeting_idx on action_items (meeting_id, timestamp_ms);

create table if not exists highlights (
  id              text primary key default gen_random_uuid()::text,
  meeting_id      text not null references meetings(id) on delete cascade,
  start_ms        integer not null,
  end_ms          integer not null,
  type            text not null check (type in ('positive','pain_point','question','action_item','decision')),
  title           text not null,
  note            text,
  share_token     text not null unique default encode(gen_random_bytes(12), 'hex'),
  user_generated  boolean not null default false,
  created_at      timestamptz not null default now()
);
create index if not exists highlights_meeting_idx on highlights (meeting_id, start_ms);

create table if not exists chapters (
  id          text primary key default gen_random_uuid()::text,
  meeting_id  text not null references meetings(id) on delete cascade,
  title       text not null,
  start_ms    integer not null,
  end_ms      integer not null,
  summary     text
);
create index if not exists chapters_meeting_idx on chapters (meeting_id, start_ms);

create table if not exists chat_messages (
  id          text primary key default gen_random_uuid()::text,
  meeting_id  text references meetings(id) on delete cascade, -- null = cross-meeting Ask
  role        text not null check (role in ('user','assistant')),
  content     text not null,
  citations   jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists chat_messages_meeting_idx on chat_messages (meeting_id, created_at);

-- ---------------------------------------------------------------------------
-- Playlists & upcoming meetings
-- ---------------------------------------------------------------------------
create table if not exists playlists (
  id            text primary key default gen_random_uuid()::text,
  workspace_id  text not null references workspaces(id) on delete cascade,
  name          text not null,
  description   text,
  created_at    timestamptz not null default now()
);

create table if not exists playlist_items (
  id            text primary key default gen_random_uuid()::text,
  playlist_id   text not null references playlists(id) on delete cascade,
  meeting_id    text references meetings(id) on delete cascade,
  highlight_id  text references highlights(id) on delete cascade,
  position      integer not null default 0,
  check (meeting_id is not null or highlight_id is not null)
);
create index if not exists playlist_items_playlist_idx on playlist_items (playlist_id, position);

create table if not exists upcoming_meetings (
  id            text primary key default gen_random_uuid()::text,
  workspace_id  text not null references workspaces(id) on delete cascade,
  title         text not null,
  start         timestamptz not null,
  "end"         timestamptz not null,
  attendees     jsonb not null default '[]'::jsonb,
  meeting_type  text not null default 'general'
);

-- ---------------------------------------------------------------------------
-- Full-text search: websearch_to_tsquery over transcript_segments.tsv (GIN),
-- ts_headline with <mark> over HTML-escaped text (SearchHit.snippet contract).
-- ---------------------------------------------------------------------------
create or replace function search_segments(q text, p_meeting_id text default null, p_limit integer default 20)
returns table (
  meeting_id     text,
  meeting_title  text,
  meeting_date   timestamptz,
  meeting_type   text,
  segment_id     text,
  participant_id text,
  speaker_name   text,
  speaker_color  text,
  snippet        text,
  start_ms       integer,
  rank           real,
  total          bigint
)
language sql stable
as $$
  with query as (select websearch_to_tsquery('english', q) as tsq),
  matches as (
    select s.*, ts_rank_cd(s.tsv, query.tsq) as r
    from transcript_segments s
    join meetings mm on mm.id = s.meeting_id and mm.status = 'ready'
    cross join query
    where s.tsv @@ query.tsq
      and (p_meeting_id is null or s.meeting_id = p_meeting_id)
  )
  select
    m.id,
    m.title,
    coalesce(m.recording_start, m.scheduled_start),
    m.meeting_type,
    x.id,
    x.participant_id,
    coalesce(p.name, 'Unknown speaker'),
    p.color,
    ts_headline(
      'english',
      replace(replace(replace(x.text, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'),
      (select tsq from query),
      'StartSel=<mark>, StopSel=</mark>, MaxWords=35, MinWords=15, ShortWord=2, MaxFragments=1, HighlightAll=false'
    ),
    x.start_ms,
    x.r::real,
    count(*) over ()
  from matches x
  join meetings m on m.id = x.meeting_id
  left join participants p on p.id = x.participant_id
  order by x.r desc, coalesce(m.recording_start, m.scheduled_start) desc nulls last, x.start_ms
  limit greatest(1, least(p_limit, 100));
$$;

-- ---------------------------------------------------------------------------
-- Row level security: on, no policies (service role bypasses RLS).
-- ---------------------------------------------------------------------------
alter table workspaces enable row level security;
alter table users enable row level security;
alter table meetings enable row level security;
alter table participants enable row level security;
alter table transcript_segments enable row level security;
alter table summary_templates enable row level security;
alter table summaries enable row level security;
alter table action_items enable row level security;
alter table highlights enable row level security;
alter table chapters enable row level security;
alter table chat_messages enable row level security;
alter table playlists enable row level security;
alter table playlist_items enable row level security;
alter table upcoming_meetings enable row level security;

-- ---------------------------------------------------------------------------
-- Storage buckets: `media` (public seed audio) and `recordings` (private uploads).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'storage' and table_name = 'buckets') then
    insert into storage.buckets (id, name, public)
    values ('media', 'media', true), ('recordings', 'recordings', false)
    on conflict (id) do nothing;
  end if;
end $$;

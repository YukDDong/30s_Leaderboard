create extension if not exists pgcrypto;

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  display_order integer,
  created_at timestamptz not null default now(),
  constraint teams_name_not_blank check (btrim(name) <> '')
);

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  team_a_id uuid not null references public.teams(id) on delete cascade,
  team_b_id uuid not null references public.teams(id) on delete cascade,
  score_a integer,
  score_b integer,
  is_played boolean not null default false,
  created_at timestamptz not null default now(),
  constraint matches_distinct_teams check (team_a_id <> team_b_id),
  constraint matches_scores_consistent check (
    (
      is_played = false
      and score_a is null
      and score_b is null
    )
    or (
      is_played = true
      and score_a is not null
      and score_b is not null
      and score_a >= 0
      and score_b >= 0
    )
  )
);

create table if not exists public.league_assets (
  asset_key text primary key,
  image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_assets_key_not_blank check (btrim(asset_key) <> '')
);

create unique index if not exists matches_unique_team_pair_idx
  on public.matches (
    least(team_a_id::text, team_b_id::text),
    greatest(team_a_id::text, team_b_id::text)
  );

create index if not exists teams_display_order_idx
  on public.teams (display_order asc nulls last, created_at asc);

create index if not exists matches_team_a_id_idx
  on public.matches (team_a_id);

create index if not exists matches_team_b_id_idx
  on public.matches (team_b_id);

create index if not exists matches_created_at_idx
  on public.matches (created_at asc);

alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.league_assets enable row level security;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'league-assets',
  'league-assets',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "anon can read teams" on public.teams;
create policy "anon can read teams"
  on public.teams
  for select
  to anon, authenticated
  using (true);

drop policy if exists "anon can read matches" on public.matches;
create policy "anon can read matches"
  on public.matches
  for select
  to anon, authenticated
  using (true);

drop policy if exists "anon can read league assets" on public.league_assets;
create policy "anon can read league assets"
  on public.league_assets
  for select
  to anon, authenticated
  using (true);

comment on table public.teams is '테니스 리그 팀 목록';
comment on table public.matches is '테니스 리그 경기 목록 및 결과';
comment on table public.league_assets is '보기 페이지에 노출할 전역 자산(예: 대진 순서 이미지)';
comment on column public.league_assets.image_path is '대진 순서 이미지의 Storage 경로';
comment on index matches_unique_team_pair_idx is '같은 팀 조합의 중복 경기 생성을 방지합니다.';

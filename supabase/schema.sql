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

comment on table public.teams is '테니스 리그 팀 목록';
comment on table public.matches is '테니스 리그 경기 목록 및 결과';
comment on index matches_unique_team_pair_idx is '같은 팀 조합의 중복 경기 생성을 방지합니다.';

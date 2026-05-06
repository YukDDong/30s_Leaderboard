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

create table if not exists public.league_tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  preset text not null default 'six_team_doubles_v1',
  status text not null default 'preliminary',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_tournaments_name_not_blank check (btrim(name) <> ''),
  constraint league_tournaments_status_check check (
    status in ('preliminary', 'tournament', 'completed')
  )
);

create table if not exists public.league_tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.league_tournaments(id) on delete cascade,
  slot_number integer not null,
  group_id text not null,
  group_slot integer not null,
  name text not null,
  player1_name text not null,
  player2_name text not null,
  created_at timestamptz not null default now(),
  constraint league_tournament_teams_slot_check check (slot_number between 1 and 6),
  constraint league_tournament_teams_group_check check (group_id in ('A', 'B')),
  constraint league_tournament_teams_group_slot_check check (group_slot between 1 and 3),
  constraint league_tournament_teams_name_not_blank check (btrim(name) <> ''),
  constraint league_tournament_teams_player1_not_blank check (btrim(player1_name) <> ''),
  constraint league_tournament_teams_player2_not_blank check (btrim(player2_name) <> ''),
  constraint league_tournament_teams_players_distinct check (btrim(player1_name) <> btrim(player2_name)),
  constraint league_tournament_teams_unique_slot unique (tournament_id, slot_number),
  constraint league_tournament_teams_unique_name unique (tournament_id, name)
);

create table if not exists public.league_tournament_preliminary_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.league_tournaments(id) on delete cascade,
  group_id text not null,
  match_number integer not null,
  team1_id uuid not null references public.league_tournament_teams(id) on delete cascade,
  team2_id uuid not null references public.league_tournament_teams(id) on delete cascade,
  team1_score integer,
  team2_score integer,
  winner_team_id uuid references public.league_tournament_teams(id) on delete set null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_tournament_preliminary_group_check check (group_id in ('A', 'B')),
  constraint league_tournament_preliminary_match_number_check check (match_number between 1 and 3),
  constraint league_tournament_preliminary_distinct_teams check (team1_id <> team2_id),
  constraint league_tournament_preliminary_status_check check (status in ('pending', 'completed')),
  constraint league_tournament_preliminary_scores_check check (
    (
      status = 'pending'
      and winner_team_id is null
    )
    or (
      status = 'completed'
      and team1_score is not null
      and team2_score is not null
      and team1_score >= 0
      and team2_score >= 0
      and team1_score <> team2_score
      and winner_team_id is not null
    )
  ),
  constraint league_tournament_preliminary_unique_match unique (tournament_id, group_id, match_number)
);

create table if not exists public.league_tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.league_tournaments(id) on delete cascade,
  match_key text not null,
  round text not null,
  name text not null,
  team1_slot text not null,
  team2_slot text not null,
  team1_id uuid references public.league_tournament_teams(id) on delete set null,
  team2_id uuid references public.league_tournament_teams(id) on delete set null,
  team1_score integer,
  team2_score integer,
  winner_team_id uuid references public.league_tournament_teams(id) on delete set null,
  status text not null default 'pending',
  next_match_key text,
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint league_tournament_matches_round_check check (round in ('quarterfinal', 'semifinal', 'final')),
  constraint league_tournament_matches_status_check check (status in ('pending', 'completed')),
  constraint league_tournament_matches_scores_check check (
    (
      status = 'pending'
      and winner_team_id is null
    )
    or (
      status = 'completed'
      and team1_score is not null
      and team2_score is not null
      and team1_score >= 0
      and team2_score >= 0
      and team1_score <> team2_score
      and winner_team_id is not null
    )
  ),
  constraint league_tournament_matches_unique_key unique (tournament_id, match_key)
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

create index if not exists league_tournaments_created_at_idx
  on public.league_tournaments (created_at desc);

create index if not exists league_tournament_teams_tournament_slot_idx
  on public.league_tournament_teams (tournament_id, slot_number asc);

create index if not exists league_tournament_preliminary_tournament_idx
  on public.league_tournament_preliminary_matches (tournament_id, group_id asc, match_number asc);

create index if not exists league_tournament_matches_tournament_idx
  on public.league_tournament_matches (tournament_id, display_order asc);

alter table public.teams enable row level security;
alter table public.matches enable row level security;
alter table public.league_assets enable row level security;
alter table public.league_tournaments enable row level security;
alter table public.league_tournament_teams enable row level security;
alter table public.league_tournament_preliminary_matches enable row level security;
alter table public.league_tournament_matches enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'teams'
  ) then
    alter publication supabase_realtime add table public.teams;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    alter publication supabase_realtime add table public.matches;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'league_assets'
  ) then
    alter publication supabase_realtime add table public.league_assets;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'league_tournaments'
  ) then
    alter publication supabase_realtime add table public.league_tournaments;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'league_tournament_teams'
  ) then
    alter publication supabase_realtime add table public.league_tournament_teams;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'league_tournament_preliminary_matches'
  ) then
    alter publication supabase_realtime add table public.league_tournament_preliminary_matches;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'league_tournament_matches'
  ) then
    alter publication supabase_realtime add table public.league_tournament_matches;
  end if;
end $$;

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

drop policy if exists "anon can read league tournaments" on public.league_tournaments;
create policy "anon can read league tournaments"
  on public.league_tournaments
  for select
  to anon, authenticated
  using (true);

drop policy if exists "anon can insert league tournaments" on public.league_tournaments;
create policy "anon can insert league tournaments"
  on public.league_tournaments
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anon can update league tournaments" on public.league_tournaments;
create policy "anon can update league tournaments"
  on public.league_tournaments
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "anon can read league tournament teams" on public.league_tournament_teams;
create policy "anon can read league tournament teams"
  on public.league_tournament_teams
  for select
  to anon, authenticated
  using (true);

drop policy if exists "anon can insert league tournament teams" on public.league_tournament_teams;
create policy "anon can insert league tournament teams"
  on public.league_tournament_teams
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anon can read league tournament preliminary matches" on public.league_tournament_preliminary_matches;
create policy "anon can read league tournament preliminary matches"
  on public.league_tournament_preliminary_matches
  for select
  to anon, authenticated
  using (true);

drop policy if exists "anon can insert league tournament preliminary matches" on public.league_tournament_preliminary_matches;
create policy "anon can insert league tournament preliminary matches"
  on public.league_tournament_preliminary_matches
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anon can update league tournament preliminary matches" on public.league_tournament_preliminary_matches;
create policy "anon can update league tournament preliminary matches"
  on public.league_tournament_preliminary_matches
  for update
  to anon, authenticated
  using (true)
  with check (true);

drop policy if exists "anon can read league tournament matches" on public.league_tournament_matches;
create policy "anon can read league tournament matches"
  on public.league_tournament_matches
  for select
  to anon, authenticated
  using (true);

drop policy if exists "anon can insert league tournament matches" on public.league_tournament_matches;
create policy "anon can insert league tournament matches"
  on public.league_tournament_matches
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "anon can update league tournament matches" on public.league_tournament_matches;
create policy "anon can update league tournament matches"
  on public.league_tournament_matches
  for update
  to anon, authenticated
  using (true)
  with check (true);

comment on table public.teams is '테니스 리그 팀 목록';
comment on table public.matches is '테니스 리그 경기 목록 및 결과';
comment on table public.league_assets is '보기 페이지에 노출할 전역 자산(예: 대진 순서 이미지)';
comment on column public.league_assets.image_path is '대진 순서 이미지의 Storage 경로';
comment on index matches_unique_team_pair_idx is '같은 팀 조합의 중복 경기 생성을 방지합니다.';
comment on table public.league_tournaments is '6팀 복식 리그 & 토너먼트 대회';
comment on table public.league_tournament_teams is '리그 & 토너먼트 참가 복식 팀';
comment on table public.league_tournament_preliminary_matches is '리그 & 토너먼트 조별 예선 경기';
comment on table public.league_tournament_matches is '리그 & 토너먼트 6강 본선 경기';

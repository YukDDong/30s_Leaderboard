# Supabase Realtime 설정 가이드

보기 페이지와 관리자 페이지는 이제 `teams`, `matches`, `league_assets` 테이블의 변경을 실시간으로 감지합니다.  
관리자가 팀을 추가하거나, 경기 점수를 저장하거나, 대진 순서 이미지를 바꾸면 열린 화면들이 자동으로 최신 데이터를 다시 읽습니다.

## 1. 새 프로젝트라면

`supabase/schema.sql`을 그대로 실행하면 됩니다.  
이 파일에 Realtime publication 등록 SQL이 포함되어 있습니다.

## 2. 이미 운영 중인 프로젝트라면

Supabase Dashboard의 `SQL Editor`에서 아래 SQL을 한 번 실행하세요.

```sql
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
end $$;
```

## 3. 확인 방법

Supabase Dashboard에서 아래 중 하나로 확인하면 됩니다.

- `Database -> Replication` 또는 Realtime 관련 화면에서 `teams`, `matches`, `league_assets`가 publication에 포함되어 있는지 확인
- 또는 아래 SQL로 직접 확인

```sql
select pubname, schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
  and schemaname = 'public'
order by tablename;
```

정상이라면 최소 아래 3개 테이블이 보여야 합니다.

- `public.league_assets`
- `public.matches`
- `public.teams`

## 4. 추가로 할 일

- 별도 Edge Function 수정은 필요 없습니다.
- `config.js`의 `supabaseUrl`, `supabaseAnonKey`는 기존처럼 그대로 사용합니다.
- RLS 읽기 정책은 이미 현재 schema에 포함되어 있으므로 추가 변경이 필요 없습니다.

## 5. 동작 방식

- 실시간 이벤트를 받으면 페이지 전체를 새로고침하지 않습니다.
- 클라이언트가 `fetchLeagueData()`를 다시 호출해 최신 팀, 경기, 이미지 데이터를 가져옵니다.
- 받은 데이터로 진행 현황, 경기 목록, 순위표, 이미지 영역만 다시 렌더링합니다.
- 이벤트가 연속으로 들어올 때를 대비해 짧은 debounce가 적용되어 있습니다.

## 6. 참고

여러 관리자가 동시에 열어둔 경우:

- 팀 추가/삭제
- 경기 생성
- 경기 결과 입력/초기화
- 대진 순서 이미지 변경
- 전체 초기화

위 작업이 발생하면 다른 관리자 화면과 보기 화면도 자동으로 최신 상태를 따라갑니다.  
단, 관리자 점수 입력 모달이 열려 있을 때는 입력 중 UI를 덜 흔들기 위해 갱신을 잠시 미뤘다가 모달이 닫히면 반영합니다.

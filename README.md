# Tennis League Board

GitHub Pages에 그대로 배포할 수 있는 정적 프론트와 Supabase DB + Edge Functions를 결합한 테니스 리그 보드입니다.  
보기 전용 페이지와 관리자 페이지를 분리했고, 관리자 비밀번호 검증과 쓰기 작업은 모두 서버측 검증 경로를 거치도록 구성했습니다.

## 1. 프로젝트 소개

- 종목: 테니스
- 경기 방식: 단일 풀리그
- 팀 수: 2팀 이상
- 9팀 기준 경기 수: 36경기
- 점수 예시: `6 : 2`
- 승점 규칙: 승 3 / 무 1 / 패 0
- 정렬 기준: 승점 내림차순 -> 득실차 내림차순

기존 프로젝트의 카드형 UI, 반응형 레이아웃, 교차표형 경기 표시, 모달 점수 입력 흐름, 순위 계산 규칙은 유지하고 데이터 저장소만 `localStorage` 중심에서 Supabase 중심 구조로 확장했습니다.

## 2. 현재 아키텍처 설명

- 프론트 배포: GitHub Pages
- 읽기 저장소: Supabase Database + Supabase Storage(public bucket)
- 실시간 갱신: Supabase Realtime(Postgres Changes)
- 관리자 쓰기 경로: Supabase Edge Functions
- 관리자 인증: Edge Function이 `ADMIN_PASSWORD` 서버측 secret과 비교
- 관리자 세션: 24시간 유효한 서명 토큰을 `localStorage`에 저장

구성도는 아래와 같습니다.

```text
GitHub Pages (index.html / admin.html)
  -> public config.js
  -> Supabase anon key로 read
  -> verify-admin-password Edge Function 호출
  -> admin-api Edge Function 호출

Supabase
  -> teams / matches 테이블
  -> league_assets 테이블
  -> league-assets Storage bucket
  -> RLS 활성화
  -> anon select 허용
  -> direct write 차단
  -> Edge Function 내부 service role로만 write
```

## 3. 페이지 구성 설명

### `index.html`

- 보기 전용 페이지
- 서비스 제목 / 설명
- 진행 현황 카드
- 경기 교차표
- 대진 순서 이미지
- 순위표
- 수정 UI 미노출

### `admin.html`

- 관리자 전용 페이지
- 인증 전: 잠금 화면 + 비밀번호 입력
- 인증 후:
  - 팀 등록
  - 팀 삭제(경기 생성 전까지만)
  - 경기 생성
  - 경기 결과 입력 / 수정 / 초기화
  - 대진 순서 이미지 업로드 / 삭제
  - 전체 데이터 초기화
  - 진행 현황 / 경기 교차표 / 순위표
  - 로그아웃

## 4. 파일 구조

```text
/
  index.html
  admin.html
  style.css
  config.js
  config.example.js
  app.js
  viewer.js
  admin.js
  supabase-client.js
  README.md
  supabase/
    schema.sql
    functions/
      _shared/
        cors.ts
        admin-auth.ts
      verify-admin-password/
        index.ts
      admin-api/
        index.ts
```

## 5. 프론트 설정 방법

프론트에는 공개 가능한 값만 넣습니다.

`config.js`

```js
window.__APP_CONFIG__ = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
};
```

공개 가능:

- `supabaseUrl`
- `supabaseAnonKey`

절대 프론트에 넣으면 안 되는 값:

- `ADMIN_PASSWORD`
- `ADMIN_TOKEN_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

`config.js` 값이 비어 있으면 viewer/admin 페이지 모두 개발자 친화적인 경고 메시지를 표시합니다.

## 6. Supabase 프로젝트 생성 방법

1. Supabase에서 새 프로젝트를 생성합니다.
2. 프로젝트 생성이 끝나면 `Project Settings -> API`에서 아래 값을 확인합니다.
3. `Project URL`을 `config.js`의 `supabaseUrl`에 넣습니다.
4. `anon public key`를 `config.js`의 `supabaseAnonKey`에 넣습니다.

실시간 갱신까지 사용하려면 별도로 [SUPABASE_REALTIME_SETUP.md](/mnt/c/Users/USER/Desktop/FE/30s_Leaderboard/SUPABASE_REALTIME_SETUP.md)도 확인하세요.

## 7. SQL 적용 방법

1. Supabase Dashboard에서 `SQL Editor`를 엽니다.
2. 이 저장소의 [schema.sql](/mnt/c/Users/USER/Desktop/FE/30s_Leaderboard/supabase/schema.sql) 내용을 붙여 넣습니다.
3. 실행 후 `teams`, `matches`, `league_assets` 테이블과 `league-assets` 버킷이 생성됐는지 확인합니다.

`schema.sql`에는 아래 내용이 포함되어 있습니다.

- 테이블 생성 SQL
- Storage bucket 생성 SQL
- 제약조건
- 인덱스
- RLS 활성화
- anon 읽기 정책
- direct write 차단 구조
- 같은 팀 경기 금지
- 같은 팀 조합 중복 금지
- Realtime publication 등록

## 8. Edge Function 배포 방법

Supabase CLI가 설치되어 있다고 가정합니다.

1. 로그인

```bash
supabase login
```

2. 프로젝트 링크

```bash
supabase link --project-ref YOUR_PROJECT_REF
```

3. 시크릿 설정

```bash
supabase secrets set ADMIN_PASSWORD="your-admin-password"
supabase secrets set ADMIN_TOKEN_SECRET="a-long-random-secret"
supabase secrets set SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

4. 함수 배포

```bash
supabase functions deploy verify-admin-password
supabase functions deploy admin-api
```

## 9. Edge Function 구성 설명

### `verify-admin-password`

- 입력 비밀번호 검증
- `ADMIN_PASSWORD`와 서버측 비교
- 성공 시 24시간 유효 서명 토큰 발급
- `token`, `expiresAt` 반환

### `admin-api`

하나의 함수에서 아래 action을 분기 처리합니다.

- `add_team`
- `remove_team`
- `generate_matches`
- `create_league_asset_upload`
- `update_league_asset_image`
- `remove_league_asset_image`
- `cleanup_league_asset_image`
- `update_match`
- `clear_match`
- `reset_data`

모든 action은 `x-admin-token` 헤더를 검증한 뒤에만 실행됩니다.

## 10. 관리자 세션 24시간 유지 방식 설명

관리자 페이지는 인증 성공 시 아래 두 값을 `localStorage`에 저장합니다.

- `admin_session_token`
- `admin_session_expires_at`

세션 처리 방식:

1. 관리자 인증 성공
2. Edge Function이 24시간 만료 시각이 포함된 토큰 발급
3. 프론트가 토큰과 만료 시각 저장
4. 이후 관리자 쓰기 요청마다 `x-admin-token` 헤더 전송
5. 세션 만료 또는 무효 토큰이면 다시 인증 요구

## 11. 읽기 / 쓰기 정책 설명

읽기:

- `index.html`과 `admin.html` 모두 anon key로 `teams`, `matches` 조회 가능
- 대진 순서 이미지는 public bucket URL로 조회 가능

쓰기:

- 브라우저에서 DB 테이블 직접 write 금지
- 팀 추가 / 삭제
- 경기 생성
- 경기 결과 저장 / 수정 / 초기화
- 대진 순서 이미지 업로드 / 삭제
- 전체 초기화

위 쓰기 작업은 모두 `admin-api` Edge Function에서 service role로 수행합니다.

## 12. 순위 계산 방식

클라이언트의 [app.js](/mnt/c/Users/USER/Desktop/FE/30s_Leaderboard/app.js)는 기존 순위 계산 구조를 유지합니다.

집계 대상:

- `is_played = true` 인 경기만 반영

각 팀별 계산 값:

- 경기수
- 승
- 무
- 패
- 득점
- 실점
- 득실차
- 승점

정렬:

1. 승점 내림차순
2. 득실차 내림차순

## 13. GitHub Pages 배포 방법

1. 저장소 루트에 이 정적 파일들을 유지합니다.
2. `config.js`에 공개 가능한 Supabase URL / anon key를 입력합니다.
3. GitHub 저장소의 `Settings -> Pages`로 이동합니다.
4. `Deploy from a branch`를 선택합니다.
5. 브랜치와 `/ (root)`를 선택합니다.
6. 배포 후 `index.html`은 보기 전용, `admin.html`은 관리자 전용 URL로 사용합니다.

예시:

- `https://YOUR_NAME.github.io/REPO_NAME/`
- `https://YOUR_NAME.github.io/REPO_NAME/admin.html`

## 14. 보안 주의사항

- 관리자 비밀번호를 프론트 코드에 하드코딩하지 않습니다.
- `service_role` 키를 프론트 코드에 넣지 않습니다.
- `config.js`에는 공개 가능한 값만 넣습니다.
- 관리자 write는 Edge Function에서만 처리합니다.
- DB는 anon direct write 정책을 만들지 않습니다.

## 15. 추후 확장 아이디어

- 여러 시즌 관리
- 경기 일정 날짜 / 장소 컬럼 추가
- 자동 새로고침 또는 Supabase realtime 연동
- CSV 내보내기
- 추가 동률 규칙 적용

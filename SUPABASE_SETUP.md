# Supabase Setup Guide

이 문서는 이 저장소를 `GitHub Pages + Supabase` 구조로 실제 연결할 때 필요한 설정 절차를 순서대로 정리한 가이드입니다.

대상 프로젝트 구조:

- 보기 전용 페이지: `index.html`
- 관리자 페이지: `admin.html`
- DB 스키마: `supabase/schema.sql`
- Edge Functions:
  - `verify-admin-password`
  - `admin-api`

## 1. 먼저 알아둘 보안 원칙

프론트에 넣어도 되는 값:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

프론트에 절대 넣으면 안 되는 값:

- `ADMIN_PASSWORD`
- `ADMIN_TOKEN_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

중요:

- `config.js`에는 공개 가능한 값만 넣습니다.
- 관리자 비밀번호는 브라우저에서 비교하지 않습니다.
- 관리자 쓰기 작업은 모두 Edge Function을 통해서만 수행합니다.

## 2. Supabase 프로젝트 만들기

1. https://supabase.com 에 로그인합니다.
2. `New project`를 눌러 새 프로젝트를 생성합니다.
3. 프로젝트 이름과 데이터베이스 비밀번호를 설정합니다.
4. 리전 선택 후 프로젝트 생성이 끝날 때까지 기다립니다.

생성이 끝나면 이후 작업은 이 프로젝트 기준으로 진행합니다.

## 3. 프로젝트 URL / API Key 확인

Supabase Dashboard에서:

1. `Project Settings`
2. `API`

여기서 아래 값을 확인합니다.

- `Project URL`
- `anon public` key
- `service_role` key

정리:

- `Project URL` -> 프론트 `config.js`에 사용
- `anon public key` -> 프론트 `config.js`에 사용
- `service_role key` -> Edge Function 서버측 secret으로만 사용

## 4. DB 스키마 적용

이 저장소 파일:

- [schema.sql](/mnt/c/Users/USER/Desktop/FE/30s_Leaderboard/supabase/schema.sql)

적용 방법:

1. Supabase Dashboard에서 `SQL Editor`로 이동합니다.
2. `New query`를 누릅니다.
3. `supabase/schema.sql` 내용을 전부 붙여 넣습니다.
4. 실행합니다.

이 SQL이 만드는 것:

- `teams` 테이블
- `matches` 테이블
- `league_assets` 테이블
- public `league-assets` Storage 버킷
- 동일 팀 경기 금지
- 동일 팀 조합 중복 금지
- 점수 유효성 제약
- 읽기용 RLS 정책
- direct write 차단 구조

실행 후 확인할 것:

1. `Table Editor`에 `teams`, `matches`가 보이는지
2. `Table Editor`에 `league_assets` 테이블이 보이는지
3. `Storage`에 `league-assets` 버킷이 보이는지
4. `Authentication > Policies` 또는 테이블 정책 영역에서 `select` 정책이 보이는지
5. `matches_unique_team_pair_idx` 인덱스가 생성됐는지

## 5. Supabase CLI 실행 방법

이 저장소는 정적 프론트엔드이므로 브라우저용 SDK를 따로 설치하지 않습니다.

- `supabase-client.js`가 `https://esm.sh/@supabase/supabase-js`를 직접 import 합니다.
- 따라서 `npm install @supabase/supabase-js`는 이 프로젝트에 필수가 아닙니다.

Edge Function 배포와 프로젝트 연결에는 Supabase CLI가 필요합니다.

이 환경에서는 전역 설치(`npm i -g supabase`)가 공식적으로 지원되지 않을 수 있으므로, 아래처럼 `npx`로 실행하는 방식을 권장합니다.

```bash
npx supabase --version
```

버전이 출력되면 정상입니다.

## 6. 프로젝트를 로컬 저장소와 연결

이 저장소 루트에서 실행합니다.

```bash
npx supabase login
```

로그인 후:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF
```

`YOUR_PROJECT_REF`는 보통 프로젝트 URL의 `https://<project-ref>.supabase.co`에서 `<project-ref>` 부분입니다.

예시:

- URL: `https://abcdxyz123.supabase.co`
- project ref: `abcdxyz123`

## 7. Edge Function용 Secret 설정

이 프로젝트는 아래 환경변수를 Edge Function에서 사용합니다.

- `ADMIN_PASSWORD`
- `ADMIN_TOKEN_SECRET`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

설정 명령:

```bash
npx supabase secrets set ADMIN_PASSWORD="원하는관리자비밀번호"
npx supabase secrets set ADMIN_TOKEN_SECRET="충분히길고랜덤한서명시크릿"
npx supabase secrets set SUPABASE_URL="https://YOUR_PROJECT_REF.supabase.co"
npx supabase secrets set SUPABASE_SERVICE_ROLE_KEY="YOUR_SERVICE_ROLE_KEY"
```

각 값 설명:

- `ADMIN_PASSWORD`
  - 관리자 페이지에서 입력할 실제 비밀번호
- `ADMIN_TOKEN_SECRET`
  - 24시간 토큰 서명용 시크릿
  - 비밀번호와 다르게 설정해야 합니다
- `SUPABASE_URL`
  - 프로젝트 URL
- `SUPABASE_SERVICE_ROLE_KEY`
  - Edge Function 내부 DB 쓰기용
  - 프론트 코드에 넣으면 안 됩니다

권장:

- `ADMIN_PASSWORD`는 평문이지만 Edge Function 내부에서만 비교되므로 프론트에 두지 않습니다.
- `ADMIN_TOKEN_SECRET`은 충분히 긴 랜덤 문자열로 설정합니다.
- 둘을 같은 값으로 쓰지 마세요.

## 8. Edge Function 배포

이 저장소에는 두 개의 함수가 있습니다.

- [verify-admin-password](/mnt/c/Users/USER/Desktop/FE/30s_Leaderboard/supabase/functions/verify-admin-password/index.ts)
- [admin-api](/mnt/c/Users/USER/Desktop/FE/30s_Leaderboard/supabase/functions/admin-api/index.ts)

배포 명령:

```bash
npx supabase functions deploy verify-admin-password
npx supabase functions deploy admin-api
```

배포가 끝나면 아래 경로로 호출됩니다.

- `https://YOUR_PROJECT_REF.supabase.co/functions/v1/verify-admin-password`
- `https://YOUR_PROJECT_REF.supabase.co/functions/v1/admin-api`

## 9. 프론트 `config.js` 설정

이 저장소 루트의 파일:

- [config.js](/mnt/c/Users/USER/Desktop/FE/30s_Leaderboard/config.js)
- [config.example.js](/mnt/c/Users/USER/Desktop/FE/30s_Leaderboard/config.example.js)

`config.js`를 아래처럼 채웁니다.

```js
window.__APP_CONFIG__ = {
  supabaseUrl: "https://YOUR_PROJECT_REF.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY",
};
```

여기에는 아래 두 값만 넣습니다.

- `supabaseUrl`
- `supabaseAnonKey`

넣으면 안 되는 값:

- 관리자 비밀번호
- service role key
- token secret

## 10. GitHub Pages에 올릴 때 주의점

GitHub Pages는 정적 호스팅이므로 `config.js` 내용은 브라우저에서 누구나 볼 수 있습니다.

그래도 괜찮은 값:

- `supabaseUrl`
- `supabaseAnonKey`

절대 올리면 안 되는 값:

- `ADMIN_PASSWORD`
- `ADMIN_TOKEN_SECRET`
- `SUPABASE_SERVICE_ROLE_KEY`

즉:

- `config.js`는 커밋해도 되지만 공개 가능한 값만 있어야 합니다.
- 진짜 비밀값은 모두 Supabase secret에만 둡니다.

## 11. 동작 구조 이해

### 보기 전용 페이지

`index.html`

- Supabase `teams`, `matches`를 anon key로 읽기만 합니다.
- 대진 순서 이미지는 public bucket URL로 표시합니다.
- 수정 UI가 없습니다.

### 관리자 페이지

`admin.html`

1. 사용자가 비밀번호 입력
2. `verify-admin-password` 호출
3. Edge Function이 `ADMIN_PASSWORD`와 비교
4. 성공 시 24시간 토큰 발급
5. 브라우저가 `localStorage`에 저장
6. 이후 쓰기 요청은 `x-admin-token` 헤더와 함께 `admin-api` 호출
7. `admin-api`가 토큰 검증 후 service role로 DB write
8. 대진 순서 이미지 업로드는 `admin-api`가 signed upload URL을 발급한 뒤 브라우저가 Storage로 직접 업로드합니다.

## 12. 첫 설정 후 실제 점검 순서

아래 순서대로 확인하면 됩니다.

1. `schema.sql` 실행 완료
2. secret 4개 설정 완료
3. 함수 2개 배포 완료
4. `config.js`에 URL + anon key 입력 완료
5. `index.html` 열기
6. `admin.html` 열기
7. 관리자 비밀번호 입력
8. 팀 2개 이상 추가
9. 경기 생성
10. 점수 입력
11. 보기 페이지에서 동일 데이터가 읽히는지 확인

## 13. 예상 정상 동작 체크리스트

정상이라면 아래가 맞아야 합니다.

- `index.html`에서 경기 테이블과 순위표가 보임
- `index.html`에서 수정 버튼이 없음
- `admin.html`에서 비밀번호 입력 전에는 수정 UI가 잠김
- 인증 성공 후 팀 추가 가능
- 9팀이면 경기 생성 후 총 36경기
- `6 : 2` 입력 시 승점과 득실차 반영
- 경기 결과 초기화 가능
- 전체 초기화 가능
- 새로고침 후 24시간 안에는 관리자 세션 유지
- 24시간이 지나면 재인증 요구

## 14. 문제 발생 시 확인 포인트

### 1) `config.js` 경고가 뜰 때

원인:

- `supabaseUrl` 또는 `supabaseAnonKey`가 비어 있음

확인:

- [config.js](/mnt/c/Users/USER/Desktop/FE/30s_Leaderboard/config.js) 값 입력 여부

### 2) 관리자 인증 실패

원인 후보:

- `ADMIN_PASSWORD` secret 오타
- 함수 미배포
- 잘못된 Supabase 프로젝트를 보고 있음

확인:

1. `supabase secrets set ADMIN_PASSWORD=...` 다시 설정
2. `supabase functions deploy verify-admin-password` 재실행
3. `config.js`의 URL이 같은 프로젝트를 가리키는지 확인

### 3) 관리자 인증은 되는데 저장이 안 됨

원인 후보:

- `SUPABASE_SERVICE_ROLE_KEY` 누락
- `ADMIN_TOKEN_SECRET` 불일치
- `admin-api` 미배포

확인:

1. `supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...`
2. `supabase secrets set ADMIN_TOKEN_SECRET=...`
3. `supabase functions deploy admin-api`

### 4) 팀/경기 조회가 안 됨

원인 후보:

- SQL 미적용
- RLS 정책 누락
- 잘못된 프로젝트 연결

확인:

1. `teams`, `matches` 테이블 존재 여부
2. `schema.sql` 재실행
3. `config.js`의 프로젝트 URL 재확인

## 15. 추천 운영 방식

- 운영용 Supabase 프로젝트를 하나 고정해서 사용합니다.
- `ADMIN_PASSWORD`는 주기적으로 변경합니다.
- `ADMIN_TOKEN_SECRET`도 비밀번호 변경 시 같이 재발급하는 편이 안전합니다.
- 관리자 작업은 `admin.html`에서만 하고, 일반 공유는 `index.html`만 사용합니다.

## 16. 최소 설정 요약

정말 짧게 정리하면 아래만 하면 됩니다.

1. Supabase 프로젝트 생성
2. `supabase/schema.sql` 실행
3. secret 4개 설정
4. 함수 2개 배포
5. `config.js`에 URL + anon key 입력
6. GitHub Pages 배포

필요한 값 6개:

- 공개 가능
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
- 비공개
  - `ADMIN_PASSWORD`
  - `ADMIN_TOKEN_SECRET`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - Supabase 프로젝트 내부 DB 비밀번호

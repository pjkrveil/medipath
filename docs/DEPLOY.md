# MediPath 배포 및 이메일 인증 설정

프런트엔드는 GitHub Pages, 이메일 인증과 계정별 설정은 Supabase Auth/Postgres를 사용합니다. 배포 전 아래 연결 설정이 필요합니다. 이 소스만으로 Supabase 프로젝트나 메일 발송 서비스가 자동 생성되지는 않습니다.

## 1. 올바른 프로젝트 폴더 확인

`medipath` 폴더 안에서 작업하세요. 다른 프로젝트에서 `git add .`를 실행하지 않습니다.

```bash
pwd
ls package.json dist/index.html .github/workflows/pages.yml
```

최신 소스를 기존 MediPath 저장소에 복사하되 기존 `.git` 폴더를 유지하세요. ZIP에는 `.git`과 개인 설정·토큰이 없습니다. 새 저장소를 만드는 경우 `docs/GITHUB-FIRST-DEPLOY.md`를 참고하세요.

## 2. Supabase 프로젝트 준비

[Supabase 대시보드](https://supabase.com/dashboard)에서 프로젝트를 만들고 다음 값을 확인합니다.

- Project URL: `https://프로젝트참조값.supabase.co`
- Publishable key: `sb_publishable_...` (기존 프로젝트는 `anon` 키도 지원)
- Project reference: CLI로 데이터베이스를 연결할 때 사용

프런트엔드에는 공개용 publishable/anon 키만 넣습니다. `service_role`, `sb_secret_...`, 데이터베이스 비밀번호, SMTP 비밀번호는 GitHub 소스나 Pages에 넣지 않습니다. 설정 생성 스크립트는 잘못된 종류의 키를 거부합니다.

## 3. 데이터베이스와 사용자별 권한 생성

Node.js 22 이상과 npm이 필요합니다. 로컬 검증과 배포 자동화는 Node.js 24를 기준으로 합니다.

```bash
npm ci
npx supabase login
npx supabase init
npx supabase link --project-ref 실제_프로젝트_참조값
npx supabase db push
```

`supabase/config.toml`이 이미 있다면 `init`은 건너뜁니다. 명령이 묻는 데이터베이스 비밀번호를 입력합니다. 기존 원격 DB를 초기화하는 `db reset --linked`는 필요하지 않습니다.

동일한 작업을 대시보드 SQL Editor에서 `supabase/migrations/202609280001_medipath_settings.sql` 전체를 실행해 할 수도 있습니다. CLI와 SQL Editor 중 한 방식을 선택하세요.

마이그레이션은 다음을 만듭니다.

- `medipath_settings`: 사용자별 계획·화면 설정, 저장 버전, 수정 시각
- RLS 정책: 인증된 사용자 본인의 행만 조회·입력·수정
- `save_medipath_settings`: 저장 버전이 일치할 때만 갱신
- 비로그인 사용자의 테이블·저장 함수 접근 차단

## 4. 이메일 인증 코드와 발송 설정

Supabase Authentication에서 Email 인증을 켜고 신규 사용자 가입을 허용하세요.

**Email Templates → Magic Link**와 **Confirm signup**의 본문에 다음 숫자 코드 템플릿을 설정합니다. `{{ .Token }}`을 그대로 넣어야 합니다. 이 앱은 링크를 누르는 방식 대신 코드를 입력하는 방식이며, OTP 입력은 6~10자리 숫자를 지원합니다.

```html
<h2>MediPath 이메일 인증</h2>
<p>로그인 화면에 아래 인증 코드를 입력해 주세요.</p>
<p style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ .Token }}</p>
<p>본인이 요청하지 않았다면 이 메일을 무시해 주세요.</p>
```

Authentication의 URL Configuration에서 Site URL을 실제 GitHub Pages 주소로 설정합니다. 예: `https://사용자명.github.io/medipath/`.

일반 사용자에게 인증 메일을 보내려면 **Custom SMTP**를 설정해야 합니다. Supabase 기본 발송 서비스는 프로젝트 팀에 허용된 이메일 주소와 제한된 테스트 용도에 한정됩니다. SMTP의 호스트, 포트, 사용자명, 비밀번호, 발신 주소는 Supabase에만 등록하세요.

이 소스는 이메일 발송 API나 공급자 비밀번호를 브라우저에서 직접 사용하지 않습니다. OTP 생성, 만료, 검증과 세션 갱신은 Supabase가 처리합니다.

## 5. GitHub에서 공개 연결 정보 등록

로그인된 GitHub CLI에서 **MediPath 저장소 폴더**를 현재 디렉터리로 두고 실행합니다. 예시 값을 실제 프로젝트 값으로 바꾸세요.

```bash
gh variable set SUPABASE_URL --body 'https://실제프로젝트참조값.supabase.co'
gh variable set SUPABASE_PUBLISHABLE_KEY --body 'sb_publishable_실제공개키'
```

위 두 값은 서비스 연결용 공개 정보입니다. 접근 권한은 키를 숨기는 방식이 아니라 인증과 데이터베이스 RLS로 제한합니다. Actions가 이 값을 `dist/config.js`로 생성합니다. 값이 없으면 배포를 중단해 로그인 미설정 상태가 실수로 배포되지 않도록 했습니다.

## 6. 검증 및 배포

```bash
npm run vendor
npm run check
npm test

git add .
git commit -m "Add email accounts and date-based stock allocation"
git push origin main

gh run list --workflow pages.yml --limit 5
gh run watch --exit-status
```

워크플로는 `npm ci` → SDK 복사 → 공개 연결 설정 생성 → 문법 검사 → 테스트 → `dist` 배포 순서입니다. Node.js와 의존성은 Actions에서 설치됩니다. 비밀 환경 파일이나 데이터베이스 마이그레이션 파일은 웹 공개 폴더에 포함되지 않습니다.

코드 수정 없이 설정만 바꿨다면 다시 실행합니다.

```bash
gh workflow run pages.yml --ref main
```

사이트 주소와 실패 로그 확인:

```bash
gh api 'repos/{owner}/{repo}/pages' --jq '.html_url'
gh run view --log-failed
```

## 로컬 실행

연결 정보가 비어 있는 전달본은 게스트로 실행됩니다. 실제 이메일 로그인을 시험하려면 셸 환경 변수로 공개 정보를 지정하고 설정을 생성합니다.

```bash
export SUPABASE_URL='https://실제프로젝트참조값.supabase.co'
export SUPABASE_PUBLISHABLE_KEY='sb_publishable_실제공개키'
npm run configure
python3 -m http.server 8080 --directory dist
```

`http://localhost:8080`으로 접속하세요. 운영 배포는 HTTPS를 사용합니다. 단일 파일 `MediPath.html`은 기본적으로 게스트 실행용이며, 다시 만들려면 `npm run vendor` 다음 `python3 scripts/bundle.py`를 실행합니다.

## 배포 후 확인

1. 이메일 A로 코드를 받아 로그인하고 이름·휴일·재배분·테마를 바꿉니다. ‘계정에 저장됨’을 확인합니다.
2. 다른 브라우저에서 A로 로그인해 설정 복원을 확인합니다.
3. 이메일 B로 로그인해 A의 설정이 보이지 않는지 확인합니다.
4. 같은 계정으로 두 기기에서 수정해 오래된 기기의 저장 충돌 안내를 확인합니다.
5. 네트워크를 끊은 상태에서 수정하고 ‘저장 실패’를 확인한 뒤 다시 연결하여 재시도합니다.
6. 로그아웃 후 계정 계획이 화면에 남지 않는지 확인합니다.

계정의 내용은 브라우저에 별도의 게스트 계획으로 저장하지 않습니다. 인증 세션은 로그인을 유지하기 위해 SDK가 브라우저에 보관합니다. 로그인 상태에서 미저장 변경이 있으면 창을 닫거나 로그아웃할 때 알립니다. 기기 간 실시간 공동 편집은 지원하지 않으며, 새 로그인 또는 ‘계정 설정 다시 불러오기’로 최신 저장 내용을 가져옵니다.

## 검증 범위

자동 검증은 날짜·수량·재배분, 저장 대기열·오류·충돌·로그아웃, DOM 환경에서 이메일 인증 화면과 잔량 UI, 임베디드 PostgreSQL에서 두 사용자 간 RLS와 저장 버전을 포함합니다. UI 인증 테스트는 서비스 응답을 모의 처리합니다. 실제 브라우저의 시각적 레이아웃, Supabase 원격 프로젝트, 실제 인증 메일 발송, 운영 사이트 로그인은 프로젝트 연결 후 위 절차로 확인해야 합니다.

## 공식 문서

- [Supabase 이메일 OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless)
- [이메일 템플릿](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)
- [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [데이터베이스 마이그레이션](https://supabase.com/docs/guides/deployment/database-migrations)
- [GitHub Pages 워크플로](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)

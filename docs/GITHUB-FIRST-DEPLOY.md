# 처음 GitHub Pages에 올리기

`docs/DEPLOY.md`의 Supabase 설정을 준비한 다음 진행합니다. 명령은 Bash 기준이며 Git과 공식 GitHub CLI가 설치되어 있어야 합니다.

## 프로젝트 위치 확인

압축을 푼 `medipath` 폴더에서 실행합니다.

```bash
pwd
ls package.json dist/index.html .github/workflows/pages.yml
```

모든 파일이 확인되어야 합니다. 다른 프로젝트 폴더에서 진행하지 마세요.

## GitHub 로그인과 저장소 생성

아래는 **새 공개 저장소**를 만드는 명령입니다. 소스와 사이트가 공개됩니다. 이미 저장소를 만들었다면 이 단계를 반복하지 말고 기존 저장소에 소스를 반영하세요.

```bash
gh auth login --hostname github.com --git-protocol https --web --scopes workflow
gh auth setup-git

MEDIPATH_OWNER=$(gh api user --jq '.login')
MEDIPATH_USER_ID=$(gh api user --jq '.id')
MEDIPATH_REPO=medipath

git init -b main
git config user.name "$MEDIPATH_OWNER"
git config user.email "${MEDIPATH_USER_ID}+${MEDIPATH_OWNER}@users.noreply.github.com"
git add .
git commit -m "Initial MediPath [skip ci]"

gh repo create "$MEDIPATH_OWNER/$MEDIPATH_REPO" --public --source=. --remote=origin --push
```

## Pages와 연결 정보 설정

```bash
gh api --method POST "repos/$MEDIPATH_OWNER/$MEDIPATH_REPO/pages" -f build_type=workflow

gh variable set SUPABASE_URL --body 'https://실제프로젝트참조값.supabase.co'
gh variable set SUPABASE_PUBLISHABLE_KEY --body 'sb_publishable_실제공개키'

gh workflow run pages.yml --ref main
gh run list --workflow pages.yml --limit 5
gh run watch --exit-status

gh api "repos/$MEDIPATH_OWNER/$MEDIPATH_REPO/pages" --jq '.html_url'
```

이미 Pages가 생성되었다는 응답이 있을 때만 `POST`를 `PUT`으로 바꿔 실행합니다. 마지막 명령에서 사이트 주소를 확인할 수 있습니다.

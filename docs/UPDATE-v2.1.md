# MediPath v2.1 적용

약을 추가·삭제할 수 있고, 약별 배분을 가로형 리스트로 표시합니다. 최대 100개를 지원하며 빈 목록도 저장됩니다. 기존 v2 계정과 기기 저장 데이터를 그대로 불러옵니다. 약 추가·삭제 또는 설정 변경 시 날짜별 재배분 기준은 초기화합니다.

기존 Supabase 테이블, SMTP 설정, GitHub 연결 변수를 계속 사용합니다. DB 마이그레이션을 다시 실행할 필요는 없습니다. v2.1에서 약 개수를 바꾼 뒤에는 이전 v2 화면을 함께 사용하지 말고 열려 있는 다른 탭도 새로고침하세요. 이전 버전은 정확히 3개인 계획만 읽을 수 있습니다.

## 서버 파일 반영

다운로드한 ZIP을 `/mnt/MAIN/personal/medipath-v2.1.zip`에 둔 뒤 실행합니다. ZIP 내부에는 `medipath/` 폴더가 있습니다.

```bash
cd /mnt/MAIN/personal/medipath &&
test "$(git rev-parse --show-toplevel)" = '/mnt/MAIN/personal/medipath' &&
MEDIPATH_STAGE=$(mktemp -d /mnt/MAIN/personal/medipath-stage.XXXXXX) &&
unzip /mnt/MAIN/personal/medipath-v2.1.zip -d "$MEDIPATH_STAGE" &&
rsync -av --exclude='.git' --exclude='node_modules' --exclude='dist/config.js' \
  "$MEDIPATH_STAGE/medipath/" ./
```

기존 로컬 Supabase 연결 설정은 유지합니다. GitHub Actions는 저장소 변수에서 배포용 `dist/config.js`를 생성합니다.

```bash
npm ci && npm run vendor && npm run check && npm test
```

29개 테스트가 통과하는지 확인합니다. 실제 운영 이메일 발송은 별도로 테스트해야 합니다.

## GitHub 업데이트

```bash
git add README.md package.json package-lock.json dist/app.js dist/core.js \
  dist/index.html dist/styles.css MediPath.html tests/core.test.js tests/ui.test.js docs/UPDATE-v2.1.md
git diff --cached --stat
```

변경 파일을 확인한 후 `main` 브랜치에서 실행합니다.

```bash
git commit -m "Add editable medication list and inline allocation" &&
git push origin main

gh run list --repo pjkrveil/medipath --workflow pages.yml --limit 5
gh run watch --repo pjkrveil/medipath --exit-status
```

처음 배포하는 경우에는 `docs/DEPLOY.md`의 GitHub 연결 변수 및 Pages 설정도 필요합니다.

## 확인

1. 사이트를 강력 새로고침하고 기존 계정으로 로그인합니다.
2. 저장된 약을 유지한 채 `＋ 약 추가`로 네 번째 약을 등록합니다.
3. 각 줄에서 받은 수량과 집·회사 수량을 바꾸고 합계가 보존되는지 확인합니다.
4. `설정`에서 복용량과 포장 수량을 바꿉니다.
5. 중간 약을 삭제하고 남은 약 이름·캘린더·이동 일정이 일치하는지 확인합니다.
6. 로그아웃 후 다시 로그인해 약 목록이 복원되는지 확인합니다.
7. 기존 재배분 기준이 있었다면 약 목록 변경 후 다시 지정합니다.

계산·UI·저장 테스트는 인증 서비스 응답을 모의 처리하며, 실제 SMTP·GitHub 배포 성공을 의미하지 않습니다.

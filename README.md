# 두문자 카드

법학 시험 준비를 위한 두문자 플래시카드 앱입니다.

## 기능

- **AI 추출**: 교재 PDF를 올리면 Gemini AI가 두문자 카드를 자동으로 추출
- **학습 모드**: 과목/파트별 필터링, 셔플 기능
- **카드 관리**: JSON 가져오기/내보내기, 카드 삭제
- **Xteink X4 내보내기**: X4 기본 리더에서 읽을 수 있는 UTF-8 TXT 및 EPUB 생성

## 사용법

1. [Google AI Studio](https://aistudio.google.com/apikey)에서 무료 Gemini API 키 발급
2. "AI 추출" 탭에서 키 입력 후 교재 PDF 업로드
3. 추출된 카드 확인 후 "내 카드에 추가"
4. "학습" 탭에서 공부 시작
5. Xteink X4에서 읽으려면 "관리" 탭의 "Xteink X4용 내보내기"에서 TXT 또는 EPUB 파일 생성 후 X4 microSD 카드에 복사

## 로컬 실행

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
```

## Xteink X4 판례공보 OPDS 설정

Vercel 배포 후 X4에서 다음 경로를 OPDS 서버로 추가합니다.

```text
https://YOUR-SITE.vercel.app/opds
```

X4 경로: Settings → System → OPDS Servers → Add Server

### OPDS 환경 변수

- `SITE_URL`: 배포된 사이트 URL. 예: `https://YOUR-SITE.vercel.app`
- `AUTHOR_NAME`: 기본 저자명. 예: `법원도서관`
- `CATALOG_TITLE`: OPDS 카탈로그 이름. 예: `대법원 판례공보`
- `OPDS_USERNAME`, `OPDS_PASSWORD`: 설정하면 HTTP Basic 인증을 사용합니다. 둘 다 비워두면 인증 없이 열립니다.

OPDS 서버는 대법원 판례속보 게시판에서 `판례공보 요약본` 항목을 찾아 PDF 다운로드 항목으로 노출합니다. X4는 웹페이지를 직접 열지 않고 `/opds` 카탈로그에서 PDF를 받아 책장에 저장합니다.

### OPDS 엔드포인트

- `GET /opds`: navigation feed
- `GET /opds/recent`: acquisition feed
- `GET /books/{id}.pdf`: 대법원 판례공보 요약본 PDF 프록시 다운로드

## 기술 스택

- React 18
- Vite
- Google Gemini API (gemini-2.5-flash)
- localStorage (카드 데이터 저장)
- Vercel Functions (대법원 판례공보 OPDS/PDF 프록시)

## 저작권 안내

이 앱은 사용자가 직접 카드를 만들어 사용하는 도구입니다.
기본 카드 데이터는 포함되어 있지 않습니다.

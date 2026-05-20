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

## 기술 스택

- React 18
- Vite
- Google Gemini API (gemini-2.5-flash)
- localStorage (카드 데이터 저장)

## 저작권 안내

이 앱은 사용자가 직접 카드를 만들어 사용하는 도구입니다.
기본 카드 데이터는 포함되어 있지 않습니다.

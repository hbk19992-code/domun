// 두문자 플래시카드 앱 — 기본 카드 데이터
// 카드가 비어있습니다. 두 가지 방법으로 카드를 추가할 수 있습니다:
//   1. "AI 추출" 탭: 교재 PDF를 올리면 자동으로 추출
//   2. "카드 추가" 버튼: 직접 입력
// 카드는 브라우저 localStorage에 저장됩니다.

/** @type {Array<{subject:string, part:string, question:string, mnemonic:string, detail:string}>} */
export const builtinCards = [];

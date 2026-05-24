import { useState, useRef, useCallback, useMemo, useEffect, useId } from 'react'
import { isDuplicate, normQuestion } from '../utils/dedup'
import { answerLabel, cardKindLabel, getCardKind, isAnswerCard } from '../utils/cardType'
import { DEFAULT_TOP_CATEGORY, getTopCategory, matchesTopCategory } from '../utils/classification'

function classifyCard(card, allCards) {
  if (!allCards || !Array.isArray(allCards)) return { type: 'new', match: null }
  const qNorm = normQuestion(card.question)
  const match = allCards.find((c) => isDuplicate(c, card) || (qNorm && normQuestion(c.question) === qNorm))
  if (!match) return { type: 'new', match: null }

  const newLen = cardContentLength(card)
  const oldLen = cardContentLength(match)
  if (newLen > oldLen + 15) return { type: 'upgrade', match }
  return { type: 'existing', match }
}

function cardContentLength(card) {
  const body = isAnswerCard(card) ? card.answer : `${card.mnemonic || ''} ${card.detail || ''}`
  return String(body || '').trim().length
}

function withClassification(card, allCards) {
  const { type, match } = classifyCard(card, allCards)
  return { ...card, _type: type, _match: match || null }
}

function stripRuntimeMeta(card) {
  const { _type, _match, _sourceOrder, ...rest } = card || {}
  return rest
}

function combineText(oldValue, newValue) {
  const oldText = String(oldValue || '').trim()
  const newText = String(newValue || '').trim()
  if (!oldText) return newText
  if (!newText || oldText.includes(newText)) return oldText
  if (newText.includes(oldText)) return newText
  return `${oldText}\n\n[추가]\n${newText}`
}

function buildMergePatch(existing, candidate, mode) {
  const kind = getCardKind(candidate)
  const base = {
    cardType: kind,
    subject: candidate.subject || existing.subject || '',
    part: candidate.part || existing.part || '',
    question: mode === 'replace' ? (candidate.question || existing.question || '') : (existing.question || candidate.question || ''),
  }

  if (isAnswerCard(candidate)) {
    return {
      ...base,
      mnemonic: '',
      detail: '',
      answer: mode === 'replace'
        ? String(candidate.answer || '').trim()
        : combineText(existing.answer, candidate.answer),
    }
  }

  return {
    ...base,
    mnemonic: mode === 'replace' ? (candidate.mnemonic || '') : (candidate.mnemonic || existing.mnemonic || ''),
    detail: mode === 'replace'
      ? String(candidate.detail || '').trim()
      : combineText(existing.detail, candidate.detail),
    answer: null,
  }
}

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']

const MAX_FILE_MB = 15
const TEXT_CHUNK_CHARS = 7000
const TEXT_CHUNK_OVERLAP = 900
const DENSE_TEXT_CHUNK_CHARS = 4200
const DENSE_TEXT_CHUNK_OVERLAP = 1000
const PDF_DIRECT_PAGE_LIMIT = 2
const PDF_PAGE_BATCH_SIZE = 2
const PDF_DENSE_PAGE_BATCH_SIZE = 1
const GEMINI_TIMEOUT_MS = 180000
const GEMINI_MAX_OUTPUT_TOKENS = 50000
const GEMINI_CHUNK_OUTPUT_TOKENS = 24000
const PDF_RANGE_DELAY_MS = 2500
const PDF_DENSE_RANGE_DELAY_MS = 4000
const PDF_RANGE_LONG_PAUSE_EVERY = 5
const PDF_RANGE_LONG_PAUSE_MS = 12000
const PDF_TEXT_MIN_CHARS = 120
const PDFJS_ESM_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.mjs'
const PDFJS_WORKER_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.mjs'
const EXTRACTOR_VERSION_LABEL = 'PDF 텍스트 우선 추출 v3 · 2026-05-24'

function makeExtractionBatchId() {
  return `extract_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isFatalExtractionError(error) {
  const message = String(error?.message || '')
  return message.includes('API 키') || message.includes('__AUTH__')
}

function friendlyExtractionError(error) {
  const message = String(error?.message || '')
  if (/PDF 구간 \d+개 분석에 실패했습니다/.test(message) || message.includes('PDF를 단원별로 나눠')) {
    return '이전 버전 추출 오류가 감지되었습니다. 페이지를 새로고침한 뒤 다시 시도해 주세요. 최신 버전에서는 실패한 일부 구간이 있어도 성공한 결과를 먼저 보여줍니다.'
  }
  if (message === 'Load failed' || message.includes('Load failed')) {
    return 'Gemini가 이 PDF 파일을 직접 읽지 못했습니다. 최신 버전은 PDF 텍스트를 먼저 추출해 시도합니다. 이 문구가 계속 보이면 페이지 새로고침 후 다시 올려 주세요.'
  }
  return message
}

const DENSE_PROMPT_SUFFIX = `\n\n【더 촘촘히 재추출 모드】\n- 이미 뽑힌 카드와 겹치더라도 누락 가능성 있으면 다시 추출.\n- 큰 단락 하나를 카드 하나로 요약하지 말고, 요건/효과/예외/판례/정의/비교 포인트를 가능한 한 작은 단위로 쪼갠다.\n- 두문자 주변 괄호·표·번호·조문·판례명·예외 문구를 놓치지 않는다.\n- 거부 규칙은 그대로 유지: mnemonic·detail 둘 다 명확히 작성된 카드만 출력. 줄바꿈으로 끊긴 풀이도 같은 단원이면 합쳐서 1장으로 작성.\n- 풀이를 정확히 모르는 글자가 하나라도 있으면 그 카드는 통째로 버려라.`

const DENSE_ANSWER_PROMPT_SUFFIX = `\n\n【더 촘촘히 재추출 모드】\n- 이미 뽑힌 카드와 겹치더라도 누락 가능성 있으면 다시 추출.\n- 큰 단락 하나를 카드 하나로 요약하지 말고, 정의/요건/효과/예외/기간/절차/비교/판례법리를 작은 카드로 쪼갠다.\n- 문서에 직접 근거가 있는 내용만 출력한다.\n- question과 answer를 모두 명확히 채울 수 없는 카드는 버린다.\n- 출력은 순수 JSON 배열만 반환한다.`

const ORDER_PROMPT_SUFFIX = `\n\n【원문 순서 유지 — 매우 중요】\n- 출력 JSON 배열의 카드 순서는 반드시 참조 문서에 등장한 순서와 같아야 한다.\n- 과목·단원·카드유형·중요도별로 재정렬하지 않는다.\n- 같은 단락에서 여러 카드가 나오면 원문에서 먼저 설명된 항목을 먼저 출력한다.\n- PDF/텍스트가 여러 조각으로 나뉘어도 각 조각 안에서는 원문 순서를 지킨다.`

const NUMBERED_SOURCE_PROMPT_SUFFIX = `\n\n【번호 항목 누락 금지 — 매우 중요】\n- 원문에 번호가 붙은 항목은 번호를 체크리스트로 삼아 빠짐없이 처리한다.\n- 번호 패턴 예시: 01., 1., 1), (1), ①, ②, 가., 나., ㄱ., ㄴ., ㉠, ㉡, 제1, 제2.\n- 실질 내용이 있는 번호 항목은 최소 1장의 카드로 만든다. 번호 아래에 요건·효과·예외·판례·비교가 여러 개 있으면 여러 장으로 쪼갠다.\n- 번호가 단순 대제목이면 그 번호 자체를 빈 카드로 만들지 말고, 그 번호 아래의 실질 내용을 카드화한다.\n- 번호 항목의 원문 번호는 가능한 경우 sourceNumber 필드에 그대로 적는다. 예: {"sourceNumber":"01"}, {"sourceNumber":"①"}, {"sourceNumber":"(3)"}.\n- 출력 직전 보이는 번호를 처음부터 끝까지 다시 훑고, 건너뛴 번호가 있으면 반드시 보충한다.`

const MNEMONIC_PROMPT = `당신은 한국 법학 시험용 두문자(약어) 카드 추출 전문가입니다.
시험 자료(특히 변호사시험·로스쿨 두문자집)의 계층 구조를 이해하고, 풀이가 명확한 두문자만 카드로 만듭니다.

【문서 구조 인식 — 가장 먼저 파악】
한국 법학 두문자 자료는 다음 4단 계층입니다:

(1) 대제목 = 【 채·권·총·론 】, 【 채·권·각·론 】, 【 민·법·총·칙 】, 【 물·권·법 】, 【 형·법·총·론 】 등
    → 점이 들어있어도 절대 두문자 아님. part 필드 값으로 사용 (점·공백 제거)
       【 채·권·총·론 】 → "채권총론"
       【 민·법·총·칙 】 → "민법총칙"

(2) 단원번호 = "01. 채권의 목적", "02. 채무불이행", "13. 소멸시효" 등
    → 두문자 아님. question의 맥락(주제)으로만 사용

(3) 소단원 = "-이행지체", "-대상청구권", "-관습법 법정지상권" 등 (대시로 시작)
    → 두문자 아님. question의 직접 주제로 사용

(4) 두문자 본체 = 점·꺽쇠·+·괄호로 명시 분리된 짧은 음절/숫자열
    예) "이.가.게.귀.위", "준.통.수", "동.매.철", "강.손.해.책",
        "<요건>이.가.게.귀.위 <효과>강.손.해.책",
        "급.후.대.상.(반)", "저+건.동.경", "3아.미안.신변", "파.판.5.도"
    → mnemonic 필드

(5) 풀이 = [...] 안 또는 다음 줄에 옮겨진 설명
    예) "[이행기/이행 가능함에도/이행 게을리/귀책사유/위법성]"
        "[강제이행, 손해배상, 해제, 책임가중(392조)]"
    → detail 필드

【두문자 판별 — 엄격】
다음 형태만 두문자로 인정:
✓ 점 구분 (2~10음절): "이.가.게.귀.위", "동.매.철", "준.통.수"
✓ 꺽쇠 분리: "<요건>X.Y.Z" 또는 "<효과>X.Y.Z" → 꺽쇠 단위로 각각 별도 카드
✓ 조항 결합: "392조 강.손.해.책" (조항은 question 쪽으로 옮기고 mnemonic은 점 부분만)
✓ 영문·숫자 혼합: "파.판.5.도", "소.객.도 안.지"
✓ 특수 부호: "저+건.동.경", "급.후.대.상.(반)"
✓ 한자·외래어 혼합: "묘.지.명.철.귀.무.기.침"

다음은 두문자 아님 — 카드로 만들지 말 것:
✗ 대제목 【 】 안의 점이 있는 단원명 — part로 갈 것
✗ 일반 단어 ("채무불이행", "이행지체", "대상청구권") — question의 주제
✗ 조항 번호 ("391조", "(390조)", "1064조") — 보조 정보
✗ 화살표·기호 ("→", "ㄱ->ㅅ : ㄱㄴㄷ순서", "ex.", "cf.")
✗ 본 자료에 풀이가 없거나 추측해야 하는 패턴
✗ 그저 짧은 문구일 뿐 분리 구분자(점/꺽쇠/+)가 없는 것

【줄바꿈 처리 — 매우 중요】
PDF는 한 줄에 안 들어가면 자동 줄바꿈됩니다. 두문자와 그 풀이가 떨어져 있어도 같은 소단원으로 묶어 1장의 카드로 처리하세요.

원본 PDF 예시 (실제로는 4~5줄에 걸쳐 표시될 수 있음):
  -이행지체
   <요건>이.가.게.귀.위
   [이행기/이행 가능함에도/이행 게을리/
    귀책사유/위법성]
   <효과>강.손.해.책
   [강제이행, 손해배상(원칙 지연배상.
    예외적 전보배상), 해제, 책임가중(392조)]

→ 이걸 4~5장이 아니라 2장으로 묶어 출력:
   1장) 이행지체 요건 → mnemonic "이.가.게.귀.위"
   2장) 이행지체 효과 → mnemonic "강.손.해.책"

【과목·단원 처리】
- subject = 문서 전반의 법 과목. 대제목 보고 추정:
  · 【채권총론】【채권각론】【민법총칙】【물권법】【친족상속법】 등 → "민법"
  · 【총론】【각론】범죄·구성요건 보이면 → "형법"
  · 국가·국민·기본권 → "헌법"
  · 행정처분·행정행위 → "행정법"
  · 소송요건·관할·당사자 → "민사소송법" 또는 "형사소송법"
- part = 가장 가까운 위쪽 대제목【 】 (점·공백 제거)
  · 본 자료가 14페이지면, 각 카드가 어느 대제목 아래 있는지 끝까지 추적
  · 새 대제목 등장 시 즉시 part 값 갱신

【카드 거부 규칙 — 절대 준수】
1. mnemonic이 비었거나, 점·꺽쇠·+ 같은 구분자 없으면 카드 출력 금지
2. detail이 비었거나 4글자 미만이거나 단순 키워드 1개면 출력 금지
3. mnemonic 음절 수 ≠ detail 항목 수면 통째로 버려라 (예: 5글자 두문자에 풀이 3개만 있으면 X)
4. "..." "기타" "등" "(불명)" 같은 회피 표현 금지
5. 일반 단어·조항번호·대제목을 mnemonic으로 출력 금지

이 규칙 어긴 카드는 시스템이 자동 제거합니다.

【출력 필드】
▶ subject = 추정한 법 과목명 (예: "민법")
▶ part = 가장 가까운 대제목 (점 제거, 예: "채권총론")
▶ question = 이 두문자가 답이 되는 시험 문제
   - 소단원명 + 요건/효과/방법 등 키워드 활용
   ✓ "이행지체의 성립요건은?"
   ✓ "이행지체의 효과는?"
   ✓ "관습법상 법정지상권의 요건은?"
   ✓ "대상청구권의 요건은?"
   ✗ "이행지체" (단어만)
▶ mnemonic = 점·꺽쇠·+·괄호 그대로 보존
▶ detail = "① 풀이1 / ② 풀이2 / ③ 풀이3 ..." 형식, 글자 수와 항목 수 일치

【모범 예시 — 본 자료 패턴 기준】

예시1) PDF:
  【 채·권·총·론 】
  01. 채권의 목적
  -추심채무: 준.통.수
   [목적물 분리, 변제준비 완료 통지하고 수령 최고]
출력:
{"subject":"민법","part":"채권총론","question":"추심채무의 변제제공 방법(구두제공)은?","mnemonic":"준.통.수","detail":"① 목적물 분리 / ② 변제준비 완료 통지 / ③ 수령 최고"}

예시2) PDF (요건·효과 분리):
  -이행지체
   <요건>이.가.게.귀.위
   [이행기/이행 가능함에도/이행 게을리/귀책사유/위법성]
   <효과>강.손.해.책
   [강제이행, 손해배상(원칙 지연배상. 예외적 전보배상), 해제, 책임가중(392조)]
출력 2장:
{"subject":"민법","part":"채권총론","question":"이행지체의 성립요건은?","mnemonic":"이.가.게.귀.위","detail":"① 이행기 도래 / ② 이행 가능함에도 / ③ 이행을 게을리할 것 / ④ 귀책사유 / ⑤ 위법성"}
{"subject":"민법","part":"채권총론","question":"이행지체의 효과는?","mnemonic":"강.손.해.책","detail":"① 강제이행 / ② 손해배상(원칙 지연배상, 예외적 전보배상) / ③ 해제 / ④ 책임가중(392조)"}

예시3) PDF (특수문자 mnemonic):
  -대상청구권: 급.후.대.상.(반)
   [급부의무/후발적불능/대상취득/상당인과관계/(교환계약은 반대급부 이행가능할 것 요구)]
출력:
{"subject":"민법","part":"채권총론","question":"대상청구권의 요건은?","mnemonic":"급.후.대.상.(반)","detail":"① 급부의무 / ② 후발적불능 / ③ 대상취득 / ④ 상당인과관계 / ⑤ (교환계약은 반대급부 이행가능할 것 요구)"}

예시4) PDF (부호+점 혼합):
  【 물·권·법 】
  09. 지상권
  -366조 법정지상권 <요건> 저+건.동.경
   [저당권설정 당시 토지 위 건물 존재 / 저당권설정 당시 토지·건물 동일인 소유 / 경매로 토지·건물 소유자 달라질 것]
출력:
{"subject":"민법","part":"물권법","question":"366조 법정지상권의 요건은?","mnemonic":"저+건.동.경","detail":"① 저당권설정 당시 토지 위 건물 존재 / ② 저당권설정 당시 토지·건물 동일인 소유 / ③ 경매로 토지·건물 소유자 달라질 것 / ④ (이하 생략 시 카드 폐기)"}
※ 단, 글자 수와 항목 수가 일치하지 않으면 카드 통째로 폐기 — 위 예시는 "저"가 별도 글자가 아니라 조건 접두라면 detail은 3개여야 하므로, 본문 표기를 신중히 확인하라.

예시5) PDF (조항 결합):
  -채권자대위권 보전의 필요성: 밀.현.간
   [피보전채권과 피대위권리 밀접한 관련 / 피보전 현실적 이행 유효·적절 확보에 대위행사 필요 / 채무자 재산관리 자유 부당한 간섭 없는 한]
출력:
{"subject":"민법","part":"채권총론","question":"채권자대위권의 보전 필요성 판단기준은?","mnemonic":"밀.현.간","detail":"① 피보전채권과 피대위권리의 밀접한 관련 / ② 피보전 현실적 이행 유효·적절 확보에 대위행사 필요 / ③ 채무자 재산관리 자유에 부당한 간섭 없는 한"}

【금지 예시 — 절대 출력 금지】
✗ {"part":"채·권·총·론",...}  ← part는 점 제거 필요. "채권총론"으로
✗ {"mnemonic":"채·권·총·론",...}  ← 대제목이지 두문자 아님
✗ {"mnemonic":"이행지체",...}  ← 일반 단어
✗ {"mnemonic":"391조",...}  ← 조항번호
✗ {"mnemonic":"이.가.게.귀.위","detail":""}  ← detail 비어있음
✗ {"mnemonic":"준.통.수","detail":"통지"}  ← 단일 키워드, 항목 불일치
✗ {"mnemonic":"이.가.게.귀.위","detail":"① 이행기 / ② 가능 / ③ ... / ④ ... / ⑤ ..."}  ← 회피 표현
✗ {"question":"채권총론",...}  ← question은 시험문제 형태

【추출 절차】
1. 문서를 위에서부터 한 단원씩 순차 처리.
2. 새 대제목 【 】 만나면 part 값 갱신.
3. 각 소단원(-로 시작)에서 점·꺽쇠 분리된 두문자만 골라낸다.
4. 두문자 옆 또는 다음 줄의 [풀이]를 detail로 변환.
5. 풀이가 없거나 모호하면 카드 폐기.
6. 같은 소단원에 <요건>·<효과> 등 여러 두문자가 있으면 각각 별도 카드.

【출력 형식】
순수 JSON 배열만. 코드블록·서문·말꼬리 일절 금지.
[{"subject":"","part":"","question":"","mnemonic":"","detail":""}, ...]

【최종 점검】
출력 직전 모든 카드에 대해:
1. mnemonic에 점/꺽쇠/+ 등 구분자 있는가? (없으면 폐기)
2. detail 항목 수가 mnemonic 음절 수와 일치하는가? (불일치면 폐기)
3. part에 【】나 가운뎃점이 남아있는가? (있으면 제거)
4. question이 시험문제 형태인가? (단어만이면 보강)
5. 같은 단원 내 누락된 두문자가 있는가? (있으면 추가)`

const QA_PROMPT = `당신은 한국 법학 시험 학습 카드 제작 전문가입니다.
시험에 나올 핵심 개념·정의·요건·효과·예외·기간·절차·비교·판례법리를 Q&A 카드로 빠짐없이 추출하세요.

【문서 구조】
- 대제목 【 】 → part로 사용 (점·공백 제거. 예: 【채·권·총·론】→ "채권총론")
- 단원번호("01.","02." 등) → question 맥락으로만
- 소단원(-) → question 주제로
- 번호가 붙은 항목("01.", "1)", "①", "가." 등) → sourceNumber에 보존하고, 실질 내용은 빠짐없이 카드화

【우선 추출 대상】
- 정의: 개념의 의미, 성질, 취지
- 요건: 성립요건, 행사요건, 효력발생요건
- 효과: 법률효과, 책임, 권리·의무 변화
- 예외: 원칙에 대한 예외, 제한, 배제 사유
- 기간·절차: 기간, 기산점, 방식, 관할, 불복
- 비교: 유사 제도 간 차이점, 요건·효과 비교
- 판례법리: 판례가 제시한 판단기준과 결론

【카드 거부 규칙 — 절대 준수】
- question·answer 중 하나라도 비었거나 부실하면 출력 금지.
- answer가 단어 1개만 있는 경우 부실. 버려라.
- "..." "기타" "등" 회피 표현 금지.
- 대제목 자체를 question으로 출력 금지.

【원칙】
- 한 카드에 한 개념만. 묶어서 요약 금지.
- 문서에 없는 내용 지어내지 말 것.
- 카드가 많아도 좋음. 누락이 가장 큰 죄지만, 같은 question을 반복 출력하지 말 것.
- 줄바꿈으로 끊긴 풀이도 같은 단원이면 1장으로 합쳐 작성.
- 조문번호·판례명·숫자·기간·기산점은 answer에 보존.

【작성 규칙】
▶ subject = 문서 전반 과목 (예: "민법")
▶ part = 가장 가까운 대제목 (점 제거, 예: "채권총론")
▶ sourceNumber = 원문 항목 번호. 번호가 없으면 빈 문자열
▶ question = 시험 문제처럼 구체적으로
   ✓ "민법 제390조 채무불이행에 따른 손해배상의 요건은?"
   ✗ "채무불이행이란?"
▶ answer — 문서 표현 살려서. 번호·구조 보존
   "① ... / ② ... / ③ ..." 또는 "요건: ... / 효과: ..."

【예시】
PDF: "선의취득 <요건> 동.점.무.유.점.무 [동산/양도인 점유/양도인 무권리자/유효한 거래행위로 평온공연하게 양수/양수인 점유/선의 무과실 점유]"
출력:
{"subject":"민법","part":"물권법","question":"동산 선의취득의 요건은?","answer":"① 동산 / ② 양도인 점유 / ③ 양도인 무권리자 / ④ 유효한 거래행위로 평온공연하게 양수 / ⑤ 양수인 점유 / ⑥ 선의·무과실 점유"}

【출력】순수 JSON 배열만.
[{"subject":"","part":"","sourceNumber":"","question":"","answer":""}]

【최종 점검】 출력 전 문서 다시 훑고, 거부 규칙 어긴 카드 제거.`

const CASE_PROMPT = `당신은 한국 법학 시험용 판례 요지 카드 제작 전문가입니다.
문서에서 판례명, 사건번호, 판시사항, 쟁점, 판단기준, 법리, 결론을 찾아 판례 암기 카드로 정리하세요.

【출력 원칙】
- 한 카드에는 하나의 판례 또는 하나의 판례 법리만 담습니다.
- question은 판례명/쟁점이 드러나는 시험 문제 형태로 작성합니다.
- answer에는 사실관계가 아니라 시험에 필요한 판례 요지와 키워드를 압축합니다.
- 사건번호가 없어도 문서가 "판례는", "대법원은", "판시하였다"처럼 판례 법리를 설명하면 출력합니다.
- 문서에 없는 판례나 결론을 지어내지 마세요.
- 판례가 아닌 일반 설명은 출력하지 마세요.
- 같은 판례 안에 서로 다른 쟁점이 있으면 쟁점별로 나누어 출력합니다.

【필드】
- subject: 과목명
- part: 단원명 또는 쟁점명
- sourceNumber: 원문 항목 번호. 번호가 없으면 빈 문자열
- question: 예) "대법원 2020다0000 판례의 핵심 법리는?"
- answer: "쟁점: ... / 판시법리: ... / 결론: ... / 암기포인트: ..."

【좋은 answer 기준】
- 인용 가능한 핵심 문구, 판단기준, 긍정·부정 결론을 보존합니다.
- 단순히 "인정된다", "부정된다"만 쓰지 말고 이유와 기준을 함께 적습니다.
- 사실관계는 법리 이해에 꼭 필요한 최소한만 적습니다.

【출력】
순수 JSON 배열만.
[{"subject":"","part":"","sourceNumber":"","question":"","answer":""}]`

const STATUTE_PROMPT = `당신은 한국 법학 시험용 조문 암기 카드 제작 전문가입니다.
문서에서 조문 번호, 요건, 효과, 예외, 기간, 기산점, 절차, 관할, 불복 방법을 찾아 조문 카드로 정리하세요.

【출력 원칙】
- 한 카드에는 하나의 조문 또는 하나의 조문상 요건/효과만 담습니다.
- question은 조문 번호와 쟁점이 드러나는 시험 문제 형태로 작성합니다.
- answer에는 조문 내용 또는 암기해야 할 요건·효과·예외를 구조화해 적습니다.
- 문서에 없는 조문 내용을 지어내지 마세요.
- 조문 번호가 없어도 문서가 법정요건·효과·기간·절차를 설명하면 출력합니다.
- 숫자, 기간, 기산점, 예외 문구는 절대 뭉개지 말고 그대로 보존합니다.
- 긴 조문은 요건/효과/예외/절차/기간으로 나누어 여러 카드로 출력합니다.

【필드】
- subject: 과목명
- part: 단원명 또는 조문 분야
- sourceNumber: 원문 항목 번호. 번호가 없으면 빈 문자열
- question: 예) "민법 제390조 손해배상책임의 요건은?"
- answer: "요건: ... / 효과: ... / 예외: ... / 기간·기산점: ..." 중 해당 항목만 구조화

【우선 추출 대상】
- 요건, 효과, 예외, 제한, 추정·간주, 기간, 기산점, 최고·통지 방식, 관할, 불복, 제척기간, 소멸시효
- "할 수 있다", "하여야 한다", "못한다", "추정한다", "간주한다"처럼 결론을 바꾸는 문장

【출력】
순수 JSON 배열만.
[{"subject":"","part":"","sourceNumber":"","question":"","answer":""}]`

// Gemini 규격 전용 REST API 송신 함수 (1회)
async function callGemini(apiKey, model, parts, systemPrompt, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || GEMINI_TIMEOUT_MS)
  let res
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: 'application/json',
            maxOutputTokens: options.maxOutputTokens || GEMINI_MAX_OUTPUT_TOKENS,
          },
        }),
      }
    )
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('__TIMEOUT__')
    throw e
  } finally {
    clearTimeout(timeout)
  }

  let data = {}
  try { data = await res.json() } catch {}
  if (!res.ok) {
    const msg = data.error?.message || ''
    if (res.status === 401 || res.status === 403) throw new Error('__AUTH__')
    if (res.status === 429 || res.status === 503 || msg.toLowerCase().includes('high demand'))
      throw new Error('__BUSY__')
    throw new Error(msg || `Gemini API 오류 (${res.status})`)
  }
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') || ''
  if (!text.trim()) {
    const reason = data.candidates?.[0]?.finishReason || data.promptFeedback?.blockReason || ''
    throw new Error(reason ? `Gemini 응답이 비어 있습니다 (${reason}).` : 'Gemini 응답이 비어 있습니다.')
  }
  return text
}

async function extractWithGemini(apiKey, parts, systemPrompt, setProgress, options = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  for (let m = 0; m < GEMINI_MODELS.length; m++) {
    const model = GEMINI_MODELS[m]
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        setProgress(`☁️ Gemini 심층 분석 중... (${model}${attempt > 1 ? ` 재시도 ${attempt}` : ''})`)
        return await callGemini(apiKey, model, parts, systemPrompt, options)
      } catch (e) {
        if (e.message === '__AUTH__') throw new Error('Gemini API 키가 올바르지 않습니다.')
        if (e.message === '__BUSY__' || e.message === '__TIMEOUT__') {
          if (attempt < 3) { await sleep(attempt * 5000); continue }
          if (m < GEMINI_MODELS.length - 1) break
          throw new Error(e.message === '__TIMEOUT__'
            ? 'Gemini 응답이 너무 오래 걸립니다. 문서를 더 작게 나눠 다시 시도해주세요.'
            : 'Gemini 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.')
        }
        throw e
      }
    }
  }
  throw new Error('Gemini 서버 응답 실패');
}

function unwrapArray(data) {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object') {
    for (const key of ['cards', 'items', 'data', 'results', 'questions']) {
      if (Array.isArray(data[key])) return data[key]
    }
  }
  return data
}

function parseJSONCandidate(candidate) {
  const cleaned = candidate
    .trim()
    .replace(/,\s*([}\]])/g, '$1')
  const parsed = unwrapArray(JSON.parse(cleaned))
  if (!Array.isArray(parsed)) throw new Error('JSON 배열이 아닙니다.')
  return parsed
}

function findBalancedJSON(str, opener, closer) {
  const matches = []
  for (let start = str.indexOf(opener); start >= 0; start = str.indexOf(opener, start + 1)) {
    let depth = 0
    let inString = false
    let escaped = false

    for (let i = start; i < str.length; i++) {
      const ch = str[i]
      if (inString) {
        if (escaped) escaped = false
        else if (ch === '\\') escaped = true
        else if (ch === '"') inString = false
        continue
      }
      if (ch === '"') {
        inString = true
      } else if (ch === opener) {
        depth++
      } else if (ch === closer) {
        depth--
        if (depth === 0) {
          matches.push(str.slice(start, i + 1))
          break
        }
      }
    }
  }
  return matches
}

function repairTruncatedArrays(str) {
  const matches = []

  for (let start = str.indexOf('['); start >= 0; start = str.indexOf('[', start + 1)) {
    const body = str.slice(start)
    const lastComma = body.lastIndexOf('},')
    if (lastComma > 0) {
      matches.push(body.slice(0, lastComma + 1) + ']')
      continue
    }

    const lastBrace = body.lastIndexOf('}')
    if (lastBrace > 0) matches.push(body.slice(0, lastBrace + 1) + ']')
  }

  return matches
}

function repairJSON(str) {
  const raw = String(str || '').replace(/^\uFEFF/, '').trim()
  const fenced = [...raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)].map((m) => m[1].trim())
  const unfenced = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  const candidates = [
    ...fenced,
    unfenced,
    ...findBalancedJSON(unfenced, '[', ']'),
    ...findBalancedJSON(unfenced, '{', '}'),
  ].filter(Boolean)

  for (const candidate of candidates) {
    try { return { data: parseJSONCandidate(candidate), truncated: false } } catch {}
  }

  for (const truncated of repairTruncatedArrays(unfenced)) {
    try { return { data: parseJSONCandidate(truncated), truncated: true } } catch {}
  }

  throw new Error('JSON 파싱 실패: AI 응답에서 유효한 JSON 배열을 찾지 못했습니다.')
}

function splitTextIntoChunks(text, options = {}) {
  const source = String(text || '').replace(/\r\n/g, '\n').trim()
  if (!source) return []
  const chunkChars = options.chunkChars || TEXT_CHUNK_CHARS
  const overlap = options.overlap || TEXT_CHUNK_OVERLAP
  if (source.length <= chunkChars) return [source]

  const chunks = []
  let start = 0
  while (start < source.length) {
    let end = Math.min(start + chunkChars, source.length)
    if (end < source.length) {
      const window = source.slice(start, end)
      const breakpoints = [
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('\n'),
        window.lastIndexOf('다. '),
        window.lastIndexOf('. '),
      ]
      const best = Math.max(...breakpoints)
      if (best > chunkChars * 0.55) end = start + best + 1
    }

    const chunk = source.slice(start, end).trim()
    if (chunk) chunks.push(chunk)
    if (end >= source.length) break
    start = Math.max(end - overlap, start + 1)
  }
  return chunks
}

function makeChunkPrompt(chunk, index, total, options = {}) {
  const denseGuide = options.dense
    ? `\n더 촘촘히 재추출 모드입니다. 누락 방지 우선으로 작은 단위로 쪼개세요.\n`
    : ''
  const rules = options.extractType === 'case'
    ? `\n핵심: 판례명·사건번호가 없더라도 판례 법리·쟁점·판단기준·결론을 찾아 question/answer 카드로 만들 것. 판례가 아닌 일반 설명은 출력하지 말 것.\n`
    : options.extractType === 'statute'
      ? `\n핵심: 조문 번호·요건·효과·예외·기간·기산점·절차·관할·불복을 찾아 question/answer 카드로 만들 것. 숫자와 예외 문구를 보존할 것.\n`
      : options.extractType === 'qa'
        ? `\n핵심: 시험에 나올 정의·요건·효과·예외·기간·절차·비교·판례법리를 question/answer 카드로 빠짐없이 만들 것. 한 카드에는 한 쟁점만 담고, answer가 비어 있거나 단어 1개뿐인 카드는 출력하지 말 것.\n`
        : `\n핵심: (1) 줄바꿈으로 두문자·풀이가 끊어져 있어도 같은 소단원이면 1장의 카드로 묶을 것. (2) part는 가장 가까운 위쪽 대제목【 】에서 점·공백 제거하여 추출. (3) mnemonic·detail 둘 다 채울 수 없는 카드는 출력 금지.\n`
  const target = options.extractType === 'case'
    ? '판례 요지'
    : options.extractType === 'statute'
      ? '조문 암기'
      : options.extractType === 'qa'
        ? 'Q&A'
        : '두문자'
  if (total <= 1) {
    return `다음 텍스트에서 ${target} 카드를 빠짐없이 추출하세요. 요약 금지.
${rules}${denseGuide}
원문에 나타난 순서 그대로 JSON 배열을 작성하세요. 주제별·유형별로 재정렬하지 마세요.
번호가 붙은 항목은 번호를 체크리스트로 삼아 빠짐없이 처리하고, 가능하면 sourceNumber에 원문 번호를 적으세요.
출력은 JSON 배열만.

${chunk}`
  }
  return `다음은 전체 문서 중 ${index + 1}/${total}번째 조각입니다.
이 조각의 ${target} 대상과 핵심 쟁점을 모두 추출하세요. 앞뒤 조각과 겹쳐도 누락 방지 우선.
${rules}${denseGuide}
이 조각 안에서 원문에 나타난 순서 그대로 JSON 배열을 작성하세요. 주제별·유형별로 재정렬하지 마세요.
이 조각 안의 번호 항목은 번호를 체크리스트로 삼아 빠짐없이 처리하고, 가능하면 sourceNumber에 원문 번호를 적으세요.
출력은 JSON 배열만.

${chunk}`
}

function cardMergeKey(card) {
  const sourceNumber = getCardSourceNumber(card)
  const question = normQuestion(card?.question || '')
  const payload = normQuestion(card?.mnemonic || card?.answer || card?.detail || '')
  return `${sourceNumber}|||${question}|||${payload}`
}

function getCardSourceOrder(card, fallback = Number.MAX_SAFE_INTEGER) {
  const raw = card?._sourceOrder ?? card?.sourceOrder ?? card?.source_order ?? card?.order
  const num = Number(raw)
  return Number.isFinite(num) ? num : fallback
}

function withSequentialSourceOrder(cards, start = 0) {
  return cards.map((card, index) => ({
    ...card,
    _sourceOrder: getCardSourceOrder(card, start + index),
  }))
}

function sortCardsBySourceOrder(cards) {
  return cards
    .map((card, index) => ({ card, index, order: getCardSourceOrder(card, index) }))
    .sort((a, b) => (a.order - b.order) || (a.index - b.index))
    .map(({ card }) => card)
}

function longerValue(a, b) {
  const av = a == null ? '' : String(a)
  const bv = b == null ? '' : String(b)
  return bv.length > av.length ? bv : av
}

function mergeExtractedCards(cards) {
  const map = new Map()
  sortCardsBySourceOrder(withSequentialSourceOrder(cards)).forEach((card) => {
    if (!card || typeof card !== 'object') return
    const key = cardMergeKey(card)
    if (!normQuestion(card.question || '') && !normQuestion(card.mnemonic || card.answer || card.detail || '')) return
    if (!map.has(key)) {
      map.set(key, card)
      return
    }
    const prev = map.get(key)
    map.set(key, {
      ...prev,
      ...card,
      subject: prev.subject || card.subject || '',
      part: prev.part || card.part || '',
      cardType: prev.cardType || card.cardType || '',
      question: longerValue(prev.question, card.question),
      mnemonic: longerValue(prev.mnemonic, card.mnemonic),
      detail: longerValue(prev.detail, card.detail),
      answer: longerValue(prev.answer, card.answer),
      _sourceOrder: Math.min(getCardSourceOrder(prev), getCardSourceOrder(card)),
    })
  })
  return sortCardsBySourceOrder(Array.from(map.values()))
}

// 후처리: AI가 가끔 part 필드에 "채·권·총·론"처럼 가운뎃점/공백/괄호를 그대로 넣음 → 정리
function cleanPartLabel(value) {
  if (!value) return ''
  let s = String(value).trim()
  // 【 】 제거
  s = s.replace(/[【】]/g, '')
  // 가운뎃점·점·공백 제거 ("채·권·총·론" → "채권총론")
  s = s.replace(/[·.\s]+/g, '')
  return s
}

function cleanSubjectLabel(value) {
  if (!value) return ''
  return String(value).trim().replace(/[【】·.\s]+/g, '')
}

function cleanSourceNumber(value) {
  if (value == null) return ''
  return String(value)
    .trim()
    .replace(/^원문\s*/i, '')
    .replace(/\s+/g, '')
    .slice(0, 24)
}

function sourceNumberFromQuestion(question) {
  const q = String(question || '').trim()
  const match = q.match(/^\s*(?:\[([^\]]{1,24})\]|(?:원문\s*)?((?:[①-⑳㉠-㉭]|[가-힣A-Za-zㄱ-ㅎ]{1,3}[.)]|\(\d{1,3}\)|\d{1,3}[.)])))\s+/)
  return cleanSourceNumber(match?.[1] || match?.[2] || '')
}

function getCardSourceNumber(card) {
  return cleanSourceNumber(
    card?.sourceNumber ??
    card?.source_number ??
    card?.sourceNo ??
    card?.source_no ??
    card?.no ??
    card?.number ??
    sourceNumberFromQuestion(card?.question)
  )
}

// 두문자 판별: 점/꺽쇠/+ 같은 명시적 구분자가 있어야 진짜 두문자
function looksLikeMnemonic(text) {
  const s = String(text || '').trim()
  if (!s) return false
  // 점 구분자 (예: 이.가.게.귀.위, 동.기)
  if (/[가-힣A-Za-z0-9가-힣]\s*[.·]\s*[가-힣A-Za-z0-9가-힣]/.test(s)) return true
  // 꺽쇠 분리 (예: <요건>X.Y.Z)
  if (/<[^>]+>/.test(s)) return true
  // + 부호 (예: 저+건.동.경)
  if (/[가-힣A-Za-z0-9]\+[가-힣A-Za-z0-9]/.test(s)) return true
  return false
}

// 대제목/일반 단어를 mnemonic으로 잘못 넣은 경우 거부
function looksLikeSectionHeading(text) {
  const s = String(text || '').trim()
  if (/[【】]/.test(s)) return true
  // "채·권·총·론" 형태 (3글자 이상이 모두 가운뎃점으로만 연결)
  if (/^([가-힣]\s*·\s*){2,}[가-힣]$/.test(s)) return true
  return false
}

// 두문자/설명 필수 검증 — AI가 거부 규칙을 어기고 보낸 부실 카드 자동 제거
function isValidExtractedCard(card, extractType) {
  if (!card || typeof card !== 'object') return false

  const question = String(card.question || '').trim()
  if (!question) return false

  if (extractType === 'qa' || extractType === 'case' || extractType === 'statute') {
    const answer = String(card.answer || '').trim()
    if (answer.length < (extractType === 'qa' ? 2 : 6)) return false
    if (/^[…·.\-\s]+$/.test(answer)) return false
    return true
  }

  // 두문자 모드: mnemonic·detail 둘 다 + 진짜 두문자 형태 검증
  const mnem = String(card.mnemonic || '').trim()
  const detail = String(card.detail || '').trim()

  if (!mnem) return false
  if (!detail) return false

  // 명시적 구분자가 없으면 두문자 아님 → 거부
  if (!looksLikeMnemonic(mnem)) return false

  // 대제목·section 헤딩이 mnemonic으로 들어온 경우 거부
  if (looksLikeSectionHeading(mnem)) return false

  // mnemonic이 너무 길면 일반 문장일 가능성
  if (mnem.length > 60) return false

  // detail 부실 검증
  if (/^[…·.\-\s]+$/.test(detail)) return false
  if (detail.length < 4) return false
  if (/(\.\.\.\s*\/?\s*){2,}/.test(detail)) return false
  if (/^(기타|등|불명|생략)$/.test(detail)) return false

  return true
}

// 카드 정리: part·subject 라벨 자동 정돈
function sanitizeCard(card) {
  if (!card || typeof card !== 'object') return card
  const sourceNumber = getCardSourceNumber(card)
  return {
    ...card,
    topCategory: getTopCategory(card),
    subject: cleanSubjectLabel(card.subject),
    part: cleanPartLabel(card.part),
    ...(sourceNumber ? { sourceNumber } : {}),
  }
}

async function extractTextWithChunks(apiKey, text, systemPrompt, label, setProgress, options = {}) {
  const chunks = splitTextIntoChunks(text, options.dense
    ? { chunkChars: DENSE_TEXT_CHUNK_CHARS, overlap: DENSE_TEXT_CHUNK_OVERLAP }
    : undefined
  )
  if (chunks.length === 0) return { data: [], truncated: false }

  const collected = []
  const failed = []
  let wasTruncated = false

  for (let i = 0; i < chunks.length; i++) {
    const prefix = chunks.length > 1 ? `${label} 조각 ${i + 1}/${chunks.length}` : label
    try {
      const raw = await extractWithGemini(
        apiKey,
        [{ text: makeChunkPrompt(chunks[i], i, chunks.length, { dense: options.dense, extractType: options.extractType }) }],
        systemPrompt,
        (msg) => setProgress(`${prefix} · ${msg.replace(/^☁️\s*/, '')}`),
        { maxOutputTokens: chunks.length > 1 ? GEMINI_CHUNK_OUTPUT_TOKENS : GEMINI_MAX_OUTPUT_TOKENS }
      )
      const { data, truncated } = repairJSON(raw)
      if (Array.isArray(data)) {
        const offset = collected.length
        collected.push(...data.map((card, j) => ({ ...card, _sourceOrder: offset + j })))
      }
      wasTruncated = wasTruncated || truncated
    } catch (e) {
      if (isFatalExtractionError(e)) throw e
      if (chunks.length === 1) throw e
      failed.push({ index: i + 1, message: e.message })
      console.warn(`텍스트 조각 ${i + 1}/${chunks.length} 추출 실패`, e)
    }
  }

  if (collected.length === 0 && failed.length > 0) {
    throw new Error('모든 텍스트 조각 분석에 실패했습니다. 문서를 더 작게 나눠 다시 시도해주세요.')
  }

  return {
    data: mergeExtractedCards(collected),
    truncated: wasTruncated || failed.length > 0,
  }
}

async function extractPdfWithPageRanges(apiKey, base64, pageCount, systemPrompt, label, setProgress, options = {}) {
  const batchSize = options.dense ? PDF_DENSE_PAGE_BATCH_SIZE : PDF_PAGE_BATCH_SIZE
  const ranges = buildPdfPageRanges(pageCount, batchSize)
  if (ranges.length === 0) return { data: [], truncated: false }

  const collected = []
  const failed = []
  let wasTruncated = false

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i]
    const prefix = `${label} ${range.start}-${range.end}쪽 (${i + 1}/${ranges.length})`
    try {
      const raw = await extractWithGemini(
        apiKey,
        [
          { inline_data: { mime_type: 'application/pdf', data: base64 } },
          { text: buildPdfRangeInstruction(options.extractType, range, pageCount, options.dense) },
        ],
        systemPrompt,
        (msg) => setProgress(`${prefix} · ${msg.replace(/^☁️\s*/, '')}`),
        { maxOutputTokens: GEMINI_CHUNK_OUTPUT_TOKENS }
      )
      const { data, truncated } = repairJSON(raw)
      if (Array.isArray(data)) {
        const offset = collected.length
        collected.push(...data.map((card, j) => ({ ...card, _sourceOrder: offset + j })))
      }
      wasTruncated = wasTruncated || truncated
    } catch (e) {
      if (isFatalExtractionError(e)) throw e
      failed.push({ range, message: e.message })
      console.warn(`PDF ${range.start}-${range.end}쪽 추출 실패`, e)
    }

    if (i < ranges.length - 1) {
      const isLongPause = (i + 1) % PDF_RANGE_LONG_PAUSE_EVERY === 0
      const pauseMs = isLongPause
        ? PDF_RANGE_LONG_PAUSE_MS
        : (options.dense ? PDF_DENSE_RANGE_DELAY_MS : PDF_RANGE_DELAY_MS)
      setProgress(`${label} · 무료 한도 보호를 위해 ${Math.ceil(pauseMs / 1000)}초 쉬는 중... (${i + 1}/${ranges.length})`)
      await wait(pauseMs)
    }
  }

  if (collected.length === 0 && failed.length > 0) {
    const sample = failed[0]?.message ? ` (${failed[0].message})` : ''
    throw new Error(`모든 PDF 구간 분석에 실패했습니다. Gemini 무료 한도 또는 일시적 혼잡일 수 있습니다. 잠시 후 다시 시도해주세요.${sample}`)
  }

  return {
    data: mergeExtractedCards(collected),
    truncated: wasTruncated || failed.length > 0,
  }
}

const TYPE_META = {
  new:      { label: '새 카드',     color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   border: '#22c55e' },
  upgrade:  { label: '내용 보강',   color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: '#f59e0b' },
  existing: { label: '이미 보유',   color: '#475569', bg: 'rgba(71,85,105,0.1)',  border: '#334155' },
}

const REVIEW_FILTERS = [
  ['all', '전체'],
  ['needsReview', '검수 필요'],
  ['unclassified', '미분류'],
  ['missingCore', '내용 빈칸'],
  ['mnemonic', '두문자'],
  ['qa', 'Q&A'],
  ['case', '판례'],
  ['statute', '조문'],
]

function isUnclassified(value) {
  const v = String(value || '').trim()
  return !v || v === '미분류'
}

function getReviewIssues(card) {
  const issues = []
  const isAnswer = isAnswerCard(card)
  if (isUnclassified(getTopCategory(card))) issues.push('대분류 확인')
  if (isUnclassified(card?.subject)) issues.push('과목 확인')
  if (isUnclassified(card?.part)) issues.push('단원 확인')
  if (!String(card?.question || '').trim()) issues.push('질문 없음')
  if (isAnswer) {
    if (!String(card?.answer || '').trim()) issues.push(`${answerLabel(card)} 없음`)
  } else {
    if (!String(card?.mnemonic || '').trim()) issues.push('두문자 없음')
    if (!String(card?.detail || '').trim()) issues.push('설명 없음')
  }
  if (card?._type === 'upgrade') issues.push('기존 카드와 비교')
  return issues
}

function matchesReviewFilter(card, filter) {
  if (filter === 'all') return true
  if (filter === 'needsReview') return getReviewIssues(card).length > 0
  if (filter === 'unclassified') return isUnclassified(getTopCategory(card)) || isUnclassified(card?.subject) || isUnclassified(card?.part)
  if (filter === 'missingCore') return getReviewIssues(card).some((x) => x.includes('없음'))
  if (filter === 'mnemonic') return getCardKind(card) === 'mnemonic'
  if (filter === 'qa') return getCardKind(card) === 'qa'
  if (filter === 'case') return getCardKind(card) === 'case'
  if (filter === 'statute') return getCardKind(card) === 'statute'
  return true
}

function buildPrompt(extractType, dense = false) {
  const base =
    extractType === 'qa' ? QA_PROMPT :
    extractType === 'case' ? CASE_PROMPT :
    extractType === 'statute' ? STATUTE_PROMPT :
    MNEMONIC_PROMPT
  const orderedBase = `${base}${ORDER_PROMPT_SUFFIX}${NUMBERED_SOURCE_PROMPT_SUFFIX}`
  if (!dense) return orderedBase
  return extractType === 'mnemonic' ? `${orderedBase}${DENSE_PROMPT_SUFFIX}` : `${orderedBase}${DENSE_ANSWER_PROMPT_SUFFIX}`
}

function buildPdfInstruction(extractType, dense = false) {
  const core =
    extractType === 'case'
      ? '이 PDF에서 판례명·사건번호가 없더라도 판례 법리·쟁점·판단기준·판시사항·결론을 찾아 판례 요지 카드를 만드세요. 판례가 아닌 일반 설명은 출력하지 않습니다.'
      : extractType === 'statute'
        ? '이 PDF에서 조문 번호·요건·효과·예외·기간·기산점·절차·관할·불복을 찾아 조문 암기 카드를 만드세요. 숫자와 예외 문구를 보존하고, 조문과 직접 관련 없는 일반 설명은 출력하지 않습니다.'
        : extractType === 'qa'
          ? '이 PDF에서 시험에 나올 정의·요건·효과·예외·기간·절차·비교·판례법리를 Q&A 카드로 빠짐없이 만드세요. 대제목【 】은 part 값(점 제거)으로 쓰고, 한 카드에는 한 쟁점만 담으세요. question·answer 모두 채울 수 있는 카드만 출력합니다.'
          : '이 PDF는 한국 법학 두문자 자료입니다. 위에서부터 한 단원씩 순차 처리하며, 대제목【 】은 part 값(점 제거)으로, 점·꺽쇠·+로 분리된 패턴만 mnemonic으로, 줄바꿈으로 끊긴 풀이는 같은 소단원이면 1장의 카드로 묶어 처리하세요. mnemonic·detail 모두 채울 수 있는 카드만 출력합니다.'
  const orderedCore = `${core} 반드시 실제 PDF 페이지와 본문에 나온 순서 그대로 카드 배열을 작성하고, 주제별·유형별로 재정렬하지 마세요. 번호가 붙은 항목은 번호를 체크리스트로 삼아 빠짐없이 처리하고, 가능하면 sourceNumber 필드에 원문 번호를 그대로 적으세요.`
  return dense
    ? `더 촘촘히 재추출합니다. ${orderedCore} 이미 나온 카드와 겹쳐도 누락 방지가 우선입니다. 출력은 JSON 배열만 반환하세요.`
    : `${orderedCore} 출력은 JSON 배열만 반환하세요.`
}

function estimatePdfPageCountFromBytes(bytes) {
  if (!bytes || !bytes.length) return 0
  let text = ''
  const chunkSize = 32768
  for (let i = 0; i < bytes.length; i += chunkSize) {
    text += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunkSize, bytes.length)))
  }
  return (text.match(/\/Type\s*\/Page\b/g) || []).length
}

async function estimatePdfPageCount(file) {
  try {
    const bytes = new Uint8Array(await file.arrayBuffer())
    return estimatePdfPageCountFromBytes(bytes)
  } catch {
    return 0
  }
}

async function loadPdfJs() {
  const pdfjsLib = await import(/* @vite-ignore */ PDFJS_ESM_URL)
  if (pdfjsLib?.GlobalWorkerOptions) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_URL
  }
  return pdfjsLib
}

function normalizePdfText(text) {
  return String(text || '')
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function extractPdfTextWithPdfJs(file, onProgress) {
  const pdfjsLib = await loadPdfJs()
  const data = new Uint8Array(await file.arrayBuffer())
  const loadingTask = pdfjsLib.getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
  })
  const pdf = await loadingTask.promise
  const pages = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    if (typeof onProgress === 'function') onProgress(`${file.name} 텍스트 추출 중... (${pageNum}/${pdf.numPages})`)
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    const text = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean)
      .join(' ')
    pages.push(`\n\n[PDF ${pageNum}쪽]\n${text}`)
  }

  return {
    pageCount: pdf.numPages || 0,
    text: normalizePdfText(pages.join('\n')),
  }
}

function buildPdfPageRanges(pageCount, batchSize) {
  const total = Number(pageCount) || 0
  if (total <= 0) return []
  const size = Math.max(1, Number(batchSize) || PDF_PAGE_BATCH_SIZE)
  const ranges = []
  for (let start = 1; start <= total; start += size) {
    ranges.push({ start, end: Math.min(total, start + size - 1) })
  }
  return ranges
}

function buildPdfRangeInstruction(extractType, range, totalPages, dense = false) {
  const base = buildPdfInstruction(extractType, dense)
  return `${base}

이번 요청에서는 첨부된 전체 PDF 중 실제 PDF ${range.start}쪽부터 ${range.end}쪽까지만 처리하세요.
${range.start}쪽 이전과 ${range.end}쪽 이후 내용은 보이더라도 절대 출력하지 마세요.
총 ${totalPages}쪽 문서를 여러 번 나누어 추출하는 중이므로, 이 구간 안의 카드만 JSON 배열로 반환하세요.
이 구간 안에서도 ${range.start}쪽부터 ${range.end}쪽까지 페이지 순서와 본문 순서를 그대로 지키세요.
특히 이 구간 안에 보이는 번호 항목은 추출 전 체크리스트로 잡고, 출력 직전 빠진 번호가 없는지 다시 확인하세요.`
}

function DataListInput({ id, value, onChange, placeholder, style, options }) {
  const safeOptions = Array.isArray(options) ? options : [];
  return (
    <div style={{ flex: 1, width: '100%', minWidth: 0 }}>
      <input style={{ ...style, minWidth: 0 }} value={value || ''} onChange={onChange} placeholder={placeholder} list={id} />
      <datalist id={id}>
        {safeOptions.map((opt, i) => <option key={i} value={opt != null ? String(opt) : ''} />)}
      </datalist>
    </div>
  )
}

function GroupRow({ group, onApply, topCategories, subjects, getParts }) {
  const uid = useId()
  const [draftTop, setDraftTop] = useState(group.topCategory === '미분류' ? '' : group.topCategory)
  const [draftSubj, setDraftSubj] = useState(group.subject === '미분류' ? '' : group.subject)
  const [draftPart, setDraftPart] = useState(group.part === '미분류' ? '' : group.part)

  useEffect(() => {
    setDraftTop(group.topCategory === '미분류' ? '' : group.topCategory)
    setDraftSubj(group.subject === '미분류' ? '' : group.subject)
    setDraftPart(group.part === '미분류' ? '' : group.part)
  }, [group])

  const changed = draftTop !== (group.topCategory === '미분류' ? '' : group.topCategory) ||
                  draftSubj !== (group.subject === '미분류' ? '' : group.subject) ||
                  draftPart !== (group.part === '미분류' ? '' : group.part)

  const safeParts = typeof getParts === 'function' ? (getParts(draftSubj, draftTop || '전체') || []) : []
  const inputStyle = { width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', minWidth: 0 }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(15,23,42,0.6)', padding: '12px 16px', borderRadius: 12, marginBottom: 8, border: '1px solid #1e293b' }}>
      <div style={{ flex: 1, display: 'flex', gap: 8, flexWrap: 'nowrap' }}>
        <DataListInput id={`ge-top-${uid}`} value={draftTop} onChange={e => setDraftTop(e.target.value)} placeholder="대분류" style={inputStyle} options={topCategories} />
        <DataListInput id={`ge-sub-${uid}`} value={draftSubj} onChange={e => setDraftSubj(e.target.value)} placeholder="과목" style={inputStyle} options={subjects} />
        <DataListInput id={`ge-part-${uid}`} value={draftPart} onChange={e => setDraftPart(e.target.value)} placeholder="단원" style={inputStyle} options={safeParts} />
      </div>
      <div style={{ width: 44, textAlign: 'center', color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>{group.count}장</div>
      <button onClick={() => { if (changed) onApply(group.topCategory, group.subject, group.part, draftTop, draftSubj, draftPart) }} disabled={!changed} style={{ background: changed ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#1e293b', color: changed ? '#fff' : '#64748b', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: changed ? 'pointer' : 'not-allowed', fontWeight: 700, flexShrink: 0 }}>적용</button>
    </div>
  )
}

function GroupEditorPanel({ extracted, onUpdateGroup, topCategories, subjects, getParts }) {
  const [open, setOpen] = useState(true)

  const groups = useMemo(() => {
    const map = new Map()
    extracted.forEach(c => {
      const top = getTopCategory(c) || '미분류'
      const subj = c.subject || '미분류'
      const pt = c.part || '미분류'
      const key = `${top}|||${subj}|||${pt}`
      if (!map.has(key)) map.set(key, { topCategory: top, subject: subj, part: pt, count: 0 })
      map.get(key).count++
    })
    return Array.from(map.values()).sort((a, b) => b.count - a.count)
  }, [extracted])

  if (groups.length === 0) return null

  return (
    <div style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.25)', borderRadius: 16, padding: '20px', marginBottom: 24, width: '100%', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 16, fontWeight: 800, marginBottom: 6 }}>📁 감지된 폴더 일괄 정리</div>
          <div style={{ color: '#94a3b8', fontSize: 13, wordBreak: 'keep-all' }}>AI가 분류한 {groups.length}개의 폴더 그룹을 한 번에 수정할 수 있습니다.</div>
        </div>
        <div style={{ color: '#818cf8', fontSize: 13, fontWeight: 700, background: 'rgba(99,102,241,0.1)', padding: '8px 14px', borderRadius: 10, whiteSpace: 'nowrap' }}>{open ? '접기 ▲' : '펼치기 ▼'}</div>
      </div>
      {open && (
        <div style={{ marginTop: 20 }}>
          <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
            {groups.map(g => (
              <GroupRow key={`${g.topCategory}|||${g.subject}|||${g.part}`} group={g} onApply={onUpdateGroup} topCategories={topCategories} subjects={subjects} getParts={getParts} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SelectedBatchPanel({ selectedCount, onApply, topCategories, subjects, getParts }) {
  const uid = useId()
  const [draftTop, setDraftTop] = useState('')
  const [draftSubj, setDraftSubj] = useState('')
  const [draftPart, setDraftPart] = useState('')
  const safeParts = typeof getParts === 'function' ? (getParts(draftSubj, draftTop || '전체') || []) : []
  const canApply = selectedCount > 0 && (!!draftTop.trim() || !!draftSubj.trim() || !!draftPart.trim())
  const inputStyle = { width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', minWidth: 0 }

  const apply = () => {
    if (!canApply) return
    onApply({ topCategory: draftTop, subject: draftSubj, part: draftPart })
    setDraftTop('')
    setDraftSubj('')
    setDraftPart('')
  }

  return (
    <div style={{ background: 'rgba(14,165,233,0.06)', border: '1px solid rgba(14,165,233,0.24)', borderRadius: 16, padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 800, marginBottom: 5 }}>선택 카드 일괄 변경</div>
          <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.55 }}>선택된 {selectedCount}장의 대분류/과목/단원을 한 번에 맞춥니다. 빈칸은 기존 값을 유지합니다.</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <DataListInput id={`sel-top-${uid}`} value={draftTop} onChange={e => setDraftTop(e.target.value)} placeholder="새 대분류" style={inputStyle} options={topCategories} />
        <DataListInput id={`sel-sub-${uid}`} value={draftSubj} onChange={e => setDraftSubj(e.target.value)} placeholder="새 과목명" style={inputStyle} options={subjects} />
        <DataListInput id={`sel-part-${uid}`} value={draftPart} onChange={e => setDraftPart(e.target.value)} placeholder="새 단원명" style={inputStyle} options={safeParts} />
        <button
          onClick={apply}
          disabled={!canApply}
          style={{
            background: canApply ? 'linear-gradient(135deg,#0ea5e9,#6366f1)' : '#1e293b',
            color: canApply ? '#fff' : '#475569',
            border: 'none',
            borderRadius: 8,
            padding: '10px 16px',
            fontSize: 13,
            cursor: canApply ? 'pointer' : 'not-allowed',
            fontWeight: 800,
            flexShrink: 0,
            whiteSpace: 'nowrap'
          }}
        >선택 {selectedCount}장 적용</button>
      </div>
    </div>
  )
}

function CardItem({ card, type, checked, onToggle, onChange, onMergeExisting, topCategories = [], subjects = [], getParts }) {
  const uid = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card)
  const meta = TYPE_META[type] || TYPE_META.new
  const isAnswer = isAnswerCard(card)
  const match = card._match
  const issues = getReviewIssues(card)

  let safeParts = []
  try { if (typeof getParts === 'function') { const partsResult = getParts(draft?.subject || '', getTopCategory(draft)); if (Array.isArray(partsResult)) safeParts = partsResult } } catch(e) {}
  const safeTopCategories = Array.isArray(topCategories) ? topCategories : []
  const safeSubjects = Array.isArray(subjects) ? subjects : []

  const commitEdit = () => { onChange(draft); setEditing(false) }

  const inputStyle = { width: '100%', boxSizing: 'border-box', minWidth: 0, background: '#0a0f1e', border: '1px solid #334155', borderRadius: 6, padding: '6px 9px', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 5, resize: 'vertical' }

  if (editing) {
    return (
      <div style={{ background: checked ? 'rgba(99,102,241,0.1)' : 'rgba(15,23,42,0.7)', border: `1px solid ${checked ? '#6366f1' : '#1e293b'}`, borderRadius: 12, padding: '11px 13px', display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box', cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 6, width: '100%' }}>
          <DataListInput id={`ext-top-${uid}`} value={getTopCategory(draft)} onChange={(e) => setDraft({ ...draft, topCategory: e.target.value })} placeholder="대분류" style={inputStyle} options={safeTopCategories} />
          <DataListInput id={`ext-sub-${uid}`} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="과목" style={inputStyle} options={safeSubjects} />
          <DataListInput id={`ext-part-${uid}`} value={draft.part} onChange={(e) => setDraft({ ...draft, part: e.target.value })} placeholder="단원" style={inputStyle} options={safeParts} />
        </div>
        <input style={inputStyle} value={draft.sourceNumber || ''} onChange={(e) => setDraft({ ...draft, sourceNumber: e.target.value })} placeholder="원문 번호" />
        <input style={inputStyle} value={draft.question || ''} onChange={(e) => setDraft({ ...draft, question: e.target.value })} placeholder="질문" />
        {isAnswer ? (
          <textarea style={{ ...inputStyle, minHeight: 60 }} value={draft.answer || ''} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} placeholder={answerLabel(card)} />
        ) : (
          <>
            <input style={{ ...inputStyle, color: '#818cf8', fontWeight: 700 }} value={draft.mnemonic || ''} onChange={(e) => setDraft({ ...draft, mnemonic: e.target.value })} placeholder="두문자" />
            <textarea style={{ ...inputStyle, minHeight: 60, fontSize: 12 }} value={draft.detail || ''} onChange={(e) => setDraft({ ...draft, detail: e.target.value })} placeholder="설명" />
          </>
        )}
        <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
          <button onClick={commitEdit} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 7, padding: '6px 16px', fontSize: 12, cursor: 'pointer', fontWeight: 600, flex: 1 }}>저장</button>
          <button onClick={() => { setDraft(card); setEditing(false) }} style={{ background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: 7, padding: '6px 14px', fontSize: 12, cursor: 'pointer', flex: 1 }}>취소</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ background: checked ? 'rgba(99,102,241,0.1)' : 'rgba(15,23,42,0.7)', border: `1px solid ${checked ? '#6366f1' : '#1e293b'}`, borderRadius: 12, padding: '11px 13px', display: 'flex', gap: 10, alignItems: 'flex-start', width: '100%', boxSizing: 'border-box' }}>
      <div onClick={onToggle} style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, marginTop: 3, cursor: 'pointer', border: `2px solid ${checked ? '#6366f1' : '#334155'}`, background: checked ? '#6366f1' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {checked && <span style={{ color: '#fff', fontSize: 11, fontWeight: 700 }}>✓</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>
        <div style={{ display: 'flex', gap: 5, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, borderRadius: 4, padding: '2px 7px', fontWeight: 600, background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>{meta.label}</span>
          <span style={{ background: 'rgba(14,165,233,0.12)', color: '#7dd3fc', border: '1px solid rgba(14,165,233,0.28)', fontSize: 10, borderRadius: 4, padding: '2px 7px', wordBreak: 'keep-all' }}>{getTopCategory(card)}</span>
          <span style={{ background: '#1e293b', color: '#94a3b8', fontSize: 10, borderRadius: 4, padding: '2px 7px', wordBreak: 'keep-all' }}>{card.subject || '미분류'}</span>
          <span style={{ background: '#1e293b', color: '#64748b', fontSize: 10, borderRadius: 4, padding: '2px 7px', wordBreak: 'keep-all' }}>{card.part || '미분류'}</span>
          {card.sourceNumber && <span style={{ background: 'rgba(14,165,233,0.12)', color: '#7dd3fc', border: '1px solid rgba(14,165,233,0.28)', fontSize: 10, borderRadius: 4, padding: '2px 7px', wordBreak: 'keep-all' }}>원문 {card.sourceNumber}</span>}
          <span style={{ background: 'rgba(14,165,233,0.12)', color: '#7dd3fc', border: '1px solid rgba(14,165,233,0.28)', fontSize: 10, borderRadius: 4, padding: '2px 7px', wordBreak: 'keep-all' }}>{cardKindLabel(card)}</span>
          {issues.slice(0, 3).map((issue) => (
            <span key={issue} style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.35)', fontSize: 10, borderRadius: 4, padding: '2px 7px', wordBreak: 'keep-all' }}>{issue}</span>
          ))}
        </div>
        <div onClick={onToggle} style={{ cursor: 'pointer', wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
          <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{card.question}</div>
          {isAnswer ? (
            <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.5 }}>{card.answer}</div>
          ) : (
            <>
              <div style={{ color: '#818cf8', fontSize: 14, fontWeight: 700, letterSpacing: 1, marginBottom: type === 'upgrade' ? 4 : 0, overflowWrap: 'anywhere' }}>{card.mnemonic}</div>
              {type === 'upgrade' && <div style={{ color: '#64748b', fontSize: 11, lineHeight: 1.5 }}>{card.detail}</div>}
            </>
          )}
        </div>
        {match && (type === 'upgrade' || type === 'existing') && (
          <div style={{ marginTop: 10, background: 'rgba(2,6,23,0.45)', border: '1px solid #1e293b', borderRadius: 10, padding: 10 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 800, marginBottom: 8 }}>기존 카드 비교</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
              <div>
                <div style={{ color: '#64748b', fontSize: 10, marginBottom: 4 }}>기존</div>
                <div style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 1.45 }}>{isAnswerCard(match) ? (match.answer || '-') : (match.detail || match.mnemonic || '-')}</div>
              </div>
              <div>
                <div style={{ color: '#64748b', fontSize: 10, marginBottom: 4 }}>추출</div>
                <div style={{ color: '#e2e8f0', fontSize: 11, lineHeight: 1.45 }}>{isAnswer ? (card.answer || '-') : (card.detail || card.mnemonic || '-')}</div>
              </div>
            </div>
            {match.id ? (
              <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <button onClick={() => onMergeExisting?.('append')} style={{ background: 'rgba(245,158,11,0.14)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 7, padding: '6px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 800 }}>기존에 합치기</button>
                <button onClick={() => onMergeExisting?.('replace')} style={{ background: 'rgba(99,102,241,0.14)', color: '#c4b5fd', border: '1px solid rgba(99,102,241,0.35)', borderRadius: 7, padding: '6px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 800 }}>새 내용으로 교체</button>
              </div>
            ) : (
              <div style={{ color: '#64748b', fontSize: 11, marginTop: 8 }}>기본 내장 카드와 겹쳐 직접 병합할 수 없습니다.</div>
            )}
          </div>
        )}
      </div>
      <button onClick={(e) => { e.stopPropagation(); setDraft(card); setEditing(true) }} style={{ background: 'none', border: 'none', color: '#334155', cursor: 'pointer', fontSize: 14, padding: '2px 4px', flexShrink: 0 }} title="편집">✎</button>
    </div>
  )
}

export default function ExtractPage({ cards, onImport }) {
  const [geminiKey, setGeminiKey] = useState(() => sessionStorage.getItem('gemini_key') || '')

  const [extractType, setExtractType] = useState('mnemonic')
  const [inputMode, setInputMode] = useState('file')

  const [textInput, setTextInput] = useState('')
  const [dragging, setDragging] = useState(false)
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [extracted, setExtracted] = useState([])
  const [selected, setSelected] = useState(new Set())
  const [filterTab, setFilterTab] = useState('new')
  const [reviewFilter, setReviewFilter] = useState('all')
  const [progress, setProgress] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [importMsg, setImportMsg] = useState('')
  const [loadingPct, setLoadingPct] = useState(0)
  const [truncated, setTruncated] = useState(false)
  const [droppedCount, setDroppedCount] = useState(0)
  const [lastSource, setLastSource] = useState(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (status !== 'loading') {
      if (status === 'done') setLoadingPct(100)
      return
    }
    setLoadingPct(0)
    const iv = setInterval(() => setLoadingPct((p) => Math.min(92, p + Math.max(0.4, (92 - p) * 0.04))), 350)
    return () => clearInterval(iv)
  }, [status])

  const allTopCategories = useMemo(() => {
    let existing = []
    try { if (Array.isArray(cards?.topCategories)) existing = cards.topCategories } catch(e){}
    const newTops = Array.isArray(extracted) ? extracted.map(c => getTopCategory(c)).filter(Boolean) : []
    return [...new Set([DEFAULT_TOP_CATEGORY, ...existing, ...newTops].filter(Boolean))]
  }, [cards?.topCategories, extracted])

  const allSubjects = useMemo(() => {
    let existing = []
    try { if (Array.isArray(cards?.subjects)) existing = cards.subjects } catch(e){}
    const newSubjects = Array.isArray(extracted) ? extracted.map(c => c?.subject).filter(Boolean) : []
    return [...new Set([...existing, ...newSubjects])]
  }, [cards?.subjects, extracted])

  const getPartsForSubject = useCallback((subj, topCategory = '전체') => {
    if (!subj) return []
    let existingParts = []
    try { if (typeof cards?.parts === 'function') existingParts = cards.parts(subj, topCategory) || [] } catch(e){}
    const newParts = Array.isArray(extracted) ? extracted
      .filter(c => matchesTopCategory(c, topCategory) && c?.subject === subj)
      .map(c => c?.part)
      .filter(Boolean) : []
    return [...new Set([...existingParts, ...newParts])]
  }, [cards, extracted])

  const updateGroup = useCallback((oldTop, oldSubj, oldPart, newTop, newSubj, newPart) => {
    setExtracted(prev => prev.map(c => {
      const t = getTopCategory(c) || '미분류'
      const s = c.subject || '미분류'
      const p = c.part || '미분류'
      if (t === oldTop && s === oldSubj && p === oldPart) {
        const updated = { ...c, topCategory: newTop || getTopCategory(c), subject: newSubj, part: newPart }
        return withClassification(updated, cards.allCards || [])
      }
      return c
    }))
  }, [cards.allCards])

  const applyToSelected = useCallback(({ topCategory, subject, part }) => {
    const nextTop = String(topCategory || '').trim()
    const nextSubject = cleanSubjectLabel(subject)
    const nextPart = cleanPartLabel(part)
    if (selected.size === 0 || (!nextTop && !nextSubject && !nextPart)) return

    const appliedCount = selected.size
    setExtracted(prev => prev.map((card, index) => {
      if (!selected.has(index)) return card
      const updated = {
        ...card,
        topCategory: nextTop || getTopCategory(card),
        subject: nextSubject || card.subject,
        part: nextPart || card.part,
      }
      return withClassification(updated, cards.allCards || [])
    }))
    setImportMsg(`✓ 선택 카드 ${appliedCount}장 분류를 적용했습니다`)
    setTimeout(() => setImportMsg(''), 2500)
  }, [cards.allCards, selected])

  const saveGeminiKey = (k) => { sessionStorage.setItem('gemini_key', k); setGeminiKey(k) }

  const readBase64 = (f) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = () => rej(new Error('파일 읽기 실패')); r.readAsDataURL(f)
  })

  const finishExtraction = useCallback((parsed, wasTruncated, options = {}) => {
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(extractType === 'mnemonic' ? '두문자 카드를 추출하지 못했습니다.' : `${cardKindLabel(extractType)} 카드를 추출하지 못했습니다.`)
    }

    const normalized = parsed
      .filter((c) => c && typeof c === 'object')
      .map((c, index) => {
        const sourceNumber = getCardSourceNumber(c)
        if (extractType === 'mnemonic') {
          return { cardType: 'mnemonic', topCategory: getTopCategory(c), subject: c.subject || '', part: c.part || '', sourceNumber, question: c.question || '', mnemonic: c.mnemonic || '', detail: c.detail || '', answer: c.answer || '', _sourceOrder: getCardSourceOrder(c, index) }
        }
        return {
          cardType: extractType,
          topCategory: getTopCategory(c),
          subject: c.subject || '',
          part: c.part || '',
          sourceNumber,
          question: c.question || '',
          mnemonic: '',
          detail: '',
          answer: c.answer || c.summary || c.holding || c.text || '',
          _sourceOrder: getCardSourceOrder(c, index),
        }
      })
      .map(sanitizeCard)

    // 두문자/설명 + 두문자 패턴 검증 — AI가 거부 규칙 어긴 카드 자동 제거
    const beforeFilter = normalized.length
    const validated = normalized.filter((c) => isValidExtractedCard(c, extractType))
    const droppedThisRun = beforeFilter - validated.length

    if (validated.length === 0) {
      throw new Error(extractType !== 'mnemonic'
        ? `추출된 ${cardKindLabel(extractType)} 카드의 ${answerLabel(extractType)}이 모두 비어 있어 사용할 수 없습니다.`
        : '추출된 두문자 카드가 모두 부실(설명 없음·구분자 없음·대제목 오인 등)하여 사용할 수 없습니다. 문서의 두문자 형식과 풀이를 확인하고 다시 시도해주세요.')
    }

    const mergeBase = Array.isArray(options.mergeBase)
      ? options.mergeBase.map((card, index) => {
          const { _type, _match, ...rest } = card || {}
          return { ...rest, _sourceOrder: getCardSourceOrder(card, index) }
        })
      : []

    const classified = mergeExtractedCards([...mergeBase, ...validated])
      .map((c) => withClassification(c, cards.allCards || []))

    setExtracted(classified)
    setSelected(new Set(classified.map((c, i) => i).filter((i) => classified[i]._type !== 'existing')))
    setTruncated(wasTruncated)
    setDroppedCount(droppedThisRun)
    setFilterTab(options.mergeBase ? 'all' : 'new')
    setReviewFilter('all')
    setStatus('done')
    if (options.mergeBase) {
      setImportMsg(`✓ 더 촘촘히 재추출 완료 · 총 ${classified.length}장으로 병합됨${droppedThisRun > 0 ? ` (부실 ${droppedThisRun}장 자동 제외)` : ''}`)
      setTimeout(() => setImportMsg(''), 3500)
    }
  }, [cards.allCards, extractType])

  const runExtraction = useCallback(async (geminiPayload, label, options = {}) => {
    setStatus('loading'); setErrorMsg(''); setTruncated(false); setDroppedCount(0)
    if (!options.mergeBase) { setExtracted([]); setSelected(new Set()) }
    try {
      setProgress(`${label}${options.dense ? ' 더 촘촘히 재추출' : ''} 분석 준비 중...`)
      const prompt = buildPrompt(extractType, options.dense)
      if (!geminiKey) throw new Error("Gemini API 키가 필수입니다.")

      const raw = await extractWithGemini(geminiKey, geminiPayload, prompt, setProgress)
      const { data: parsed, truncated: wasTruncated } = repairJSON(raw)
      finishExtraction(parsed, wasTruncated, { mergeBase: options.mergeBase })
    } catch (e) {
      setErrorMsg(friendlyExtractionError(e))
      setStatus('error')
    }
  }, [geminiKey, extractType, finishExtraction])

  const runTextExtraction = useCallback(async (text, label, options = {}) => {
    setStatus('loading'); setErrorMsg(''); setTruncated(false); setDroppedCount(0)
    if (!options.mergeBase) { setExtracted([]); setSelected(new Set()) }
    try {
      setProgress(`${label}${options.dense ? ' 더 촘촘히 재추출' : ''} 분석 준비 중...`)
      const prompt = buildPrompt(extractType, options.dense)
      if (!geminiKey) throw new Error("Gemini API 키가 필수입니다.")

      const { data: parsed, truncated: wasTruncated } = await extractTextWithChunks(geminiKey, text, prompt, label, setProgress, { dense: options.dense, extractType })
      finishExtraction(parsed, wasTruncated, { mergeBase: options.mergeBase })
    } catch (e) {
      setErrorMsg(friendlyExtractionError(e))
      setStatus('error')
    }
  }, [geminiKey, extractType, finishExtraction])

  const runPdfRangeExtraction = useCallback(async (base64, label, pageCount, options = {}) => {
    setStatus('loading'); setErrorMsg(''); setTruncated(false); setDroppedCount(0)
    if (!options.mergeBase) { setExtracted([]); setSelected(new Set()) }
    try {
      const ranges = buildPdfPageRanges(pageCount, options.dense ? PDF_DENSE_PAGE_BATCH_SIZE : PDF_PAGE_BATCH_SIZE)
      setProgress(`${label}${options.dense ? ' 더 촘촘히 재추출' : ''} · ${pageCount}쪽을 ${ranges.length}개 구간으로 나누는 중...`)
      const prompt = buildPrompt(extractType, options.dense)
      if (!geminiKey) throw new Error("Gemini API 키가 필수입니다.")

      const { data: parsed, truncated: wasTruncated } = await extractPdfWithPageRanges(
        geminiKey,
        base64,
        pageCount,
        prompt,
        label,
        setProgress,
        { dense: options.dense, extractType }
      )
      finishExtraction(parsed, wasTruncated, { mergeBase: options.mergeBase })
    } catch (e) {
      setErrorMsg(friendlyExtractionError(e))
      setStatus('error')
    }
  }, [geminiKey, extractType, finishExtraction])

  const handleFile = useCallback(async (f) => {
    if (!geminiKey) return
    setFile(f)
    const sizeMB = f.size / (1024 * 1024)
    if (sizeMB > MAX_FILE_MB) {
      setErrorMsg(`파일이 너무 큽니다 (${sizeMB.toFixed(1)}MB). 최대 ${MAX_FILE_MB}MB까지 업로드할 수 있습니다.`)
      setStatus('error')
      return
    }
    const ext = f.name.split('.').pop().toLowerCase()
    // Gemini inline_data 는 Word(.doc/.docx)를 안정적으로 지원하지 않음 → PDF/TXT 만 허용
    // (드래그&드롭은 accept 속성을 우회하므로 여기서 한 번 더 막는다)
    if (!['pdf', 'txt'].includes(ext)) {
      setErrorMsg('PDF 또는 TXT 파일만 지원합니다.\nWord 문서는 PDF로 변환한 뒤 업로드해 주세요.')
      setStatus('error')
      return
    }
    if (ext === 'txt') {
      const text = await new Promise((res) => { const r = new FileReader(); r.onload = (e) => res(e.target.result); r.readAsText(f) })
      setLastSource({ kind: 'text', label: f.name, text })
      await runTextExtraction(text, f.name)
    } else {
      const estimatedPageCount = await estimatePdfPageCount(f)
      try {
        setStatus('loading')
        setProgress(`${f.name} PDF 텍스트 확인 중...`)
        const extractedPdfText = await extractPdfTextWithPdfJs(f, setProgress)
        if (extractedPdfText.text.length >= PDF_TEXT_MIN_CHARS) {
          const label = `${f.name} PDF 텍스트`
          setLastSource({
            kind: 'text',
            label,
            text: extractedPdfText.text,
            file: f,
            pageCount: extractedPdfText.pageCount || estimatedPageCount,
          })
          await runTextExtraction(extractedPdfText.text, label)
          return
        }
      } catch (e) {
        console.warn('PDF 텍스트 추출 실패, Gemini PDF 직접 분석으로 전환', e)
      }

      const pageCount = estimatedPageCount
      const base64 = await readBase64(f)
      setLastSource({ kind: 'pdf', label: f.name, file: f, pageCount })
      if (pageCount > PDF_DIRECT_PAGE_LIMIT) {
        await runPdfRangeExtraction(base64, f.name, pageCount)
        return
      }
      const geminiPayload = [
        { inline_data: { mime_type: 'application/pdf', data: base64 } },
        { text: buildPdfInstruction(extractType, false) },
      ]
      await runExtraction(geminiPayload, f.name)
    }
  }, [geminiKey, extractType, runExtraction, runTextExtraction, runPdfRangeExtraction])

  const handleTextSubmit = useCallback(async () => {
    const trimmed = textInput.trim();
    if (!geminiKey || !trimmed) return

    setLastSource({ kind: 'text', label: '텍스트', text: trimmed })
    await runTextExtraction(trimmed, '텍스트')
  }, [geminiKey, textInput, runTextExtraction])

  const rerunDenseExtraction = useCallback(async () => {
    if (!lastSource || extracted.length === 0) return
    const mergeBase = extracted
    if (lastSource.kind === 'text') {
      await runTextExtraction(lastSource.text, lastSource.label || '텍스트', { dense: true, mergeBase })
      return
    }
    if (lastSource.kind === 'pdf' && lastSource.file) {
      const base64 = await readBase64(lastSource.file)
      const pageCount = lastSource.pageCount || await estimatePdfPageCount(lastSource.file)
      if (pageCount > PDF_DIRECT_PAGE_LIMIT) {
        await runPdfRangeExtraction(base64, lastSource.label || lastSource.file.name || 'PDF', pageCount, { dense: true, mergeBase })
        return
      }
      await runExtraction([
        { inline_data: { mime_type: 'application/pdf', data: base64 } },
        { text: buildPdfInstruction(extractType, true) },
      ], lastSource.label || lastSource.file.name || 'PDF', { dense: true, mergeBase })
    }
  }, [lastSource, extracted, extractType, runExtraction, runTextExtraction, runPdfRangeExtraction])

  const toggle = (i) => setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })

  const updateCard = (i, updated) => {
    setExtracted((prev) => { const next = [...prev]; next[i] = withClassification(updated, cards.allCards || []); return next })
  }

  const mergeWithExisting = async (i, mode) => {
    const candidate = extracted[i]
    if (!candidate) return
    const match = candidate._match || classifyCard(candidate, cards.allCards || []).match
    if (!match?.id) {
      setImportMsg('기존 저장 카드와 겹친 항목은 직접 병합할 수 없습니다. 질문을 조금 바꿔 새 카드로 저장해 주세요.')
      setTimeout(() => setImportMsg(''), 3500)
      return
    }

    const patch = buildMergePatch(match, candidate, mode)
    await cards.updateCard(match.id, patch)
    const merged = { ...match, ...patch }
    setExtracted((prev) => prev.map((card, index) =>
      index === i ? { ...card, _type: 'existing', _match: merged } : card
    ))
    setSelected((prev) => {
      const next = new Set(prev)
      next.delete(i)
      return next
    })
    setImportMsg(mode === 'replace' ? '✓ 기존 카드를 새 추출 내용으로 교체했습니다' : '✓ 기존 카드에 새 내용을 합쳤습니다')
    setTimeout(() => setImportMsg(''), 3000)
  }

  const counts = {
    all: extracted.length,
    new: extracted.filter((c) => c._type === 'new').length,
    upgrade: extracted.filter((c) => c._type === 'upgrade').length,
    existing: extracted.filter((c) => c._type === 'existing').length,
  }

  const reviewCounts = {
    selected: selected.size,
    needsReview: extracted.filter((c) => getReviewIssues(c).length > 0).length,
    unclassified: extracted.filter((c) => matchesReviewFilter(c, 'unclassified')).length,
    missingCore: extracted.filter((c) => matchesReviewFilter(c, 'missingCore')).length,
    mnemonic: extracted.filter((c) => matchesReviewFilter(c, 'mnemonic')).length,
    qa: extracted.filter((c) => matchesReviewFilter(c, 'qa')).length,
    case: extracted.filter((c) => matchesReviewFilter(c, 'case')).length,
    statute: extracted.filter((c) => matchesReviewFilter(c, 'statute')).length,
  }

  const visible = extracted
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => (filterTab === 'all' || c._type === filterTab) && matchesReviewFilter(c, reviewFilter))

  const toggleAll = () => {
    const visibleIdxs = visible.map(({ i }) => i)
    const allChecked = visibleIdxs.length > 0 && visibleIdxs.every((i) => selected.has(i))
    setSelected((prev) => {
      const n = new Set(prev)
      visibleIdxs.forEach((i) => allChecked ? n.delete(i) : n.add(i))
      return n
    })
  }

  // addCards 는 async — 반드시 await 해야 added 가 숫자로 들어온다
  const doImport = async () => {
    const extractionBatchId = makeExtractionBatchId()
    const extractedAt = new Date().toISOString()
    const extractionSource = lastSource?.label || file?.name || (inputMode === 'text' ? '텍스트' : 'AI 추출')
    const toAdd = extracted.filter((c, i) => selected.has(i)).map((c) => ({
      ...stripRuntimeMeta(c),
      extractionBatchId,
      extractionSource,
      extractedAt,
    }))
    if (toAdd.length === 0) return
    const result = await cards.addCards(toAdd)
    const added = typeof result === 'number' ? result : result.added
    const updated = typeof result === 'number' ? 0 : result.updated
    const skipped = toAdd.length - added - updated
    const updateText = updated > 0 ? ` · 대분류 ${updated}개 보강` : ''
    setImportMsg(skipped > 0 ? `✓ ${added}개 추가${updateText} (중복 ${skipped}개 제외)` : `✓ ${added}개 추가됨${updateText}`)
    setTimeout(() => { setImportMsg(''); onImport() }, 1500)
  }

  const reset = () => {
    setFile(null); setStatus('idle'); setExtracted([]); setSelected(new Set())
    setErrorMsg(''); setTextInput(''); setTruncated(false); setLastSource(null); setReviewFilter('all')
    setDroppedCount(0)
  }

  const inputStyle = { flex: 1, background: '#0f172a', border: '1px solid #334155', minWidth: 0, borderRadius: 10, padding: '10px 14px', color: '#e2e8f0', fontSize: 14, fontFamily: 'monospace', outline: 'none' }
  const btnStyle = { background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', flexShrink: 0, border: 'none', borderRadius: 10, padding: '10px 20px', fontSize: 14, cursor: 'pointer', fontWeight: 700 }

  return (
    <div style={{ width: '100%', boxSizing: 'border-box', overflowX: 'hidden' }}>
      <h2 style={{ color: '#e2e8f0', fontSize: 20, fontWeight: 800, marginBottom: 4 }}>AI 카드 추출</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24, wordBreak: 'keep-all' }}>
        Gemini 무료 API 키로 PDF와 텍스트를 작게 나눠 분석하고, 원문 번호와 순서대로 시험 암기 노트를 빌드합니다.
        <span style={{ display: 'block', color: '#475569', fontSize: 12, marginTop: 6 }}>{EXTRACTOR_VERSION_LABEL}</span>
      </p>

      {/* 🔑 API 키 패널 */}
      <div style={{ marginBottom: 20, width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14, background: 'rgba(15,23,42,0.4)', padding: 16, borderRadius: 14, border: '1px solid #1e293b' }}>
        <div>
          <span style={{ color: '#94a3b8', fontSize: 13, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span><b>Gemini</b> API 키 <span style={{ color: '#64748b', fontSize: 11 }}>(필수 · 무료 티어 가능)</span></span>
            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" style={{ color: '#818cf8', fontSize: 12 }}>발급 링크</a>
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="password" placeholder="AIza..." defaultValue={geminiKey} onBlur={(e) => saveGeminiKey(e.target.value.trim())} style={inputStyle} />
            <button onClick={(e) => saveGeminiKey(e.target.previousSibling.value.trim())} style={btnStyle}>저장</button>
          </div>
        </div>
      </div>

      {!geminiKey && (
        <div style={{ background: 'rgba(99,102,241,0.07)', border: '1px solid rgba(99,102,241,0.2)', borderRadius: 12, padding: 16, color: '#64748b', fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
          무료 Gemini API 키를 등록해야 플래시카드 자동 추출 시스템을 가동할 수 있습니다.
        </div>
      )}

      {geminiKey && status === 'idle' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>추출 방식</div>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                ['mnemonic', '🔤 두문자 카드', '두문자(약어)를 매핑하여 추출'],
                ['qa', '💬 질문-답 카드', '주요 쟁점을 Q&A 형태로 추출'],
                ['case', '⚖ 판례 카드', '판례명·쟁점·요지를 추출'],
                ['statute', '§ 조문 카드', '조문·요건·효과를 추출'],
              ].map(([type, label, desc]) => (
                <button key={type} onClick={() => setExtractType(type)} style={{
                  flex: 1, textAlign: 'left', minWidth: 0,
                  background: extractType === type ? 'rgba(99,102,241,0.12)' : 'rgba(15,23,42,0.6)',
                  border: `1.5px solid ${extractType === type ? '#6366f1' : '#1e293b'}`,
                  borderRadius: 12, padding: '11px 13px', cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  <div style={{ color: extractType === type ? '#e2e8f0' : '#94a3b8', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>{label}</div>
                  <div style={{ color: '#475569', fontSize: 11, marginTop: 2, wordBreak: 'keep-all' }}>{desc}</div>
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 0, marginBottom: 16, background: '#0f172a', borderRadius: 10, padding: 3, width: 'fit-content' }}>
            {[['file', '📄 파일 업로드'], ['text', '✎ 텍스트 붙여넣기']].map(([mode, label]) => (
              <button key={mode} onClick={() => setInputMode(mode)} style={{
                background: inputMode === mode ? '#1e293b' : 'none', color: inputMode === mode ? '#e2e8f0' : '#475569',
                border: 'none', borderRadius: 8, padding: '7px 16px', fontSize: 13, cursor: 'pointer', fontWeight: inputMode === mode ? 600 : 400, transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>

          {inputMode === 'file' ? (
            <div
              style={{
                border: `2px dashed ${dragging ? '#6366f1' : '#334155'}`, borderRadius: 16, padding: '40px 24px', textAlign: 'center', cursor: 'pointer',
                background: dragging ? 'rgba(99,102,241,0.07)' : 'rgba(15,23,42,0.6)', transition: 'all 0.2s', width: '100%', boxSizing: 'border-box'
              }}
              onClick={() => inputRef.current?.click()} onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
            >
              <input ref={inputRef} type="file" accept=".pdf,.txt" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files[0]; if (f) handleFile(f) }} />
              <div style={{ fontSize: 36, marginBottom: 12 }}>📄</div>
              <div style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, wordBreak: 'keep-all' }}>PDF, TXT 파일을 드래그하거나<br /><span style={{ color: '#818cf8', fontWeight: 600 }}>클릭하여 탐색기 열기</span></div>
              <div style={{ color: '#475569', fontSize: 11, marginTop: 10, lineHeight: 1.6, wordBreak: 'keep-all' }}>TXT/PDF 텍스트 우선 분석 · PDF 최대 {MAX_FILE_MB}MB · Word는 PDF로 변환 후 업로드</div>
            </div>
          ) : (
            <div style={{ width: '100%', boxSizing: 'border-box' }}>
              <textarea
                value={textInput} onChange={(e) => setTextInput(e.target.value)}
                placeholder={'강의 필기, 요약문서 등을 붙여넣으세요.\n\n예시:\n이행지체 요건: 이.가.게.귀.위\n[이행기 도래 / 이행 가능 / 이행 게을리함 / 귀책사유 / 위법성]'}
                style={{
                  width: '100%', boxSizing: 'border-box', minWidth: 0, background: 'rgba(15,23,42,0.8)', border: '1px solid #334155',
                  borderRadius: 14, padding: '16px', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', resize: 'vertical', minHeight: 200, lineHeight: 1.7,
                }}
              />
              <button
                onClick={handleTextSubmit} disabled={!textInput.trim()}
                style={{
                  marginTop: 10, width: '100%', background: textInput.trim() ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#1e293b',
                  color: textInput.trim() ? '#fff' : '#475569', border: 'none', borderRadius: 12, padding: '13px', fontSize: 14, cursor: textInput.trim() ? 'pointer' : 'not-allowed', fontWeight: 700,
                }}
              >분석 시작</button>
            </div>
          )}
        </>
      )}

      {status === 'loading' && (
        <div style={{ background: 'rgba(15,23,42,0.8)', border: '1px solid #1e293b', borderRadius: 16, padding: '48px 32px', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ fontSize: 50, fontWeight: 800, color: '#6366f1', marginBottom: 8, fontVariantNumeric: 'tabular-nums', letterSpacing: -1, lineHeight: 1 }}>{Math.round(loadingPct)}%</div>
          <div style={{ background: '#0f172a', borderRadius: 8, height: 6, margin: '0 auto 24px', width: '100%', maxWidth: 300, overflow: 'hidden' }}>
            <div style={{ background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', height: '100%', borderRadius: 8, width: `${loadingPct}%`, transition: 'width 0.35s ease' }} />
          </div>
          <div style={{ color: '#94a3b8', fontSize: 14 }}>{progress}</div>
          {file && <div style={{ color: '#475569', fontSize: 12, marginTop: 6, wordBreak: 'break-all' }}>{file.name}</div>}
        </div>
      )}

      {status === 'error' && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 16, padding: '28px', textAlign: 'center', width: '100%', boxSizing: 'border-box' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⚠️</div>
          <div style={{ color: '#fca5a5', fontSize: 14, marginBottom: 16, wordBreak: 'keep-all', whiteSpace: 'pre-wrap' }}>{errorMsg}</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            {extracted.length > 0 && (
              <button onClick={() => setStatus('done')} style={{ background: '#1e293b', color: '#94a3b8', border: 'none', borderRadius: 10, padding: '9px 20px', fontSize: 13, cursor: 'pointer' }}>기존 결과 보기</button>
            )}
            <button onClick={reset} style={{ background: '#6366f1', color: '#fff', border: 'none', borderRadius: 10, padding: '9px 24px', fontSize: 13, cursor: 'pointer' }}>다시 시도</button>
          </div>
        </div>
      )}

      {status === 'done' && (
        <div style={{ width: '100%' }}>
          {droppedCount > 0 && (
            <div style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: 12, padding: '12px 16px', marginBottom: 12, color: '#86efac', fontSize: 13, lineHeight: 1.55 }}>
              🧹 부실 카드 <b>{droppedCount}장</b>을 자동으로 제외했습니다 (두문자/설명 비어있음, 대제목 오인, 구분자 없음 등).
            </div>
          )}

          {truncated && (
            <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, color: '#fbbf24', fontSize: 13, lineHeight: 1.6 }}>
              ⚠️ <b>일부 결과가 불안정할 수 있습니다:</b> 응답이 중간에 잘렸거나 일부 텍스트 조각 분석에 실패했을 수 있으니, 누락이 보이면 <b>문서를 조금 더 작게 분할하여</b> 실행해 주세요.
            </div>
          )}

          <GroupEditorPanel extracted={extracted} onUpdateGroup={updateGroup} topCategories={allTopCategories} subjects={allSubjects} getParts={getPartsForSubject} />
          <SelectedBatchPanel selectedCount={selected.size} onApply={applyToSelected} topCategories={allTopCategories} subjects={allSubjects} getParts={getPartsForSubject} />

          <div style={{ background: 'rgba(15,23,42,0.72)', border: '1px solid #1e293b', borderRadius: 16, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start', marginBottom: 14, flexWrap: 'wrap' }}>
              <div>
                <div style={{ color: '#e2e8f0', fontSize: 15, fontWeight: 800 }}>검수 대시보드</div>
                <div style={{ color: '#64748b', fontSize: 12, marginTop: 3 }}>미분류·빈칸·기존 카드 보강 후보를 먼저 확인하세요.</div>
              </div>
              <button onClick={rerunDenseExtraction} disabled={!lastSource || extracted.length === 0} style={{
                background: (!lastSource || extracted.length === 0) ? '#1e293b' : 'linear-gradient(135deg,#f59e0b,#d97706)',
                color: (!lastSource || extracted.length === 0) ? '#475569' : '#111827',
                border: 'none', borderRadius: 10, padding: '9px 14px', fontSize: 12,
                cursor: (!lastSource || extracted.length === 0) ? 'not-allowed' : 'pointer', fontWeight: 800, whiteSpace: 'nowrap',
              }}>더 촘촘히 재추출</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(92px, 1fr))', gap: 8 }}>
              {[
                ['선택', reviewCounts.selected, '#818cf8'],
                ['검수 필요', reviewCounts.needsReview, '#f59e0b'],
                ['미분류', reviewCounts.unclassified, '#fbbf24'],
                ['빈칸', reviewCounts.missingCore, '#ef4444'],
                ['보강', counts.upgrade, '#f59e0b'],
                ['이미 보유', counts.existing, '#64748b'],
                ['판례', reviewCounts.case, '#38bdf8'],
                ['조문', reviewCounts.statute, '#22c55e'],
              ].map(([label, count, color]) => (
                <div key={label} style={{ background: 'rgba(10,15,30,0.55)', border: '1px solid #1e293b', borderRadius: 10, padding: '10px 12px' }}>
                  <div style={{ color, fontSize: 19, fontWeight: 900, lineHeight: 1 }}>{count}</div>
                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 5 }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
            {[
              ['all', `전체 ${counts.all}`],
              ['new', `🆕 새 카드 ${counts.new}`],
              ['upgrade', `⬆ 내용 보강 ${counts.upgrade}`],
              ['existing', `✓ 이미 보유 ${counts.existing}`],
            ].map(([tab, label]) => (
              <button key={tab} onClick={() => setFilterTab(tab)} style={{
                background: filterTab === tab ? '#1e293b' : 'none', border: `1px solid ${filterTab === tab ? '#6366f1' : '#1e293b'}`, color: filterTab === tab ? '#e2e8f0' : '#475569', borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: filterTab === tab ? 600 : 400, whiteSpace: 'nowrap'
              }}>{label}</button>
            ))}
            <button onClick={toggleAll} style={{ marginLeft: 'auto', background: 'none', border: '1px solid #1e293b', borderRadius: 8, padding: '5px 12px', color: '#475569', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' }}>
              {visible.length > 0 && visible.every(({ i }) => selected.has(i)) ? '전체 해제' : '전체 선택'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: 12, marginRight: 2 }}>검수 필터</span>
            {REVIEW_FILTERS.map(([key, label]) => {
              const count = key === 'all' ? extracted.length : reviewCounts[key] ?? extracted.filter((c) => matchesReviewFilter(c, key)).length
              return (
                <button key={key} onClick={() => setReviewFilter(key)} style={{
                  background: reviewFilter === key ? 'rgba(99,102,241,0.16)' : 'none',
                  border: `1px solid ${reviewFilter === key ? '#6366f1' : '#1e293b'}`,
                  color: reviewFilter === key ? '#c4b5fd' : '#475569',
                  borderRadius: 8, padding: '5px 10px', fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
                }}>{label} {count}</button>
              )
            })}
            <span style={{ color: '#334155', fontSize: 12 }}>표시 {visible.length}장</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto', overflowX: 'hidden', marginBottom: 14, width: '100%', boxSizing: 'border-box' }}>
            {visible.length === 0 ? <div style={{ color: '#334155', textAlign: 'center', padding: '24px 0', fontSize: 13 }}>조건에 맞는 데이터 카드가 없습니다.</div> : visible.map(({ c, i }) => (
                <CardItem key={i} card={c} type={c._type} checked={selected.has(i)} onToggle={() => toggle(i)} onChange={(updated) => updateCard(i, updated)} onMergeExisting={(mode) => mergeWithExisting(i, mode)} topCategories={allTopCategories} subjects={allSubjects} getParts={getPartsForSubject} />
              ))
            }
          </div>

          <div style={{ display: 'flex', gap: 10, width: '100%', flexWrap: 'wrap' }}>
            <button
              style={{ flex: 1, minWidth: '150px', background: selected.size === 0 ? '#1e293b' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: selected.size === 0 ? '#475569' : '#fff', border: 'none', borderRadius: 12, padding: '13px 20px', fontSize: 14, cursor: selected.size === 0 ? 'not-allowed' : 'pointer', fontWeight: 700, whiteSpace: 'nowrap' }}
              disabled={selected.size === 0} onClick={doImport}
            >내 카드 서재에 추가 ({selected.size}개)</button>
            <button onClick={reset} style={{ background: '#1e293b', color: '#94a3b8', border: 'none', flex: '0 0 auto', borderRadius: 12, padding: '13px 20px', fontSize: 14, cursor: 'pointer', whiteSpace: 'nowrap' }}>새로 추출</button>
          </div>

          {importMsg && <div style={{ marginTop: 10, textAlign: 'center', color: '#22c55e', fontSize: 13, fontWeight: 600 }}>{importMsg}</div>}
        </div>
      )}
    </div>
  )
}

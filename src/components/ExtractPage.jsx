import { useState, useRef, useCallback, useMemo, useEffect, useId } from 'react'
import { isDuplicate, normQuestion } from '../utils/dedup'

function classifyCard(card, allCards) {
  if (!allCards || !Array.isArray(allCards)) return { type: 'new' };
  const isDup = allCards.some(c => isDuplicate(c, card));
  if (isDup) return { type: 'existing' };

  const qNorm = normQuestion(card.question);
  if (qNorm && allCards.some(c => normQuestion(c.question) === qNorm)) {
    return { type: 'upgrade' };
  }
  return { type: 'new' };
}

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-2.0-flash']

const MAX_FILE_MB = 15
const TEXT_CHUNK_CHARS = 9000
const TEXT_CHUNK_OVERLAP = 600
const DENSE_TEXT_CHUNK_CHARS = 5500
const DENSE_TEXT_CHUNK_OVERLAP = 900
const GEMINI_TIMEOUT_MS = 180000
const GEMINI_MAX_OUTPUT_TOKENS = 50000
const GEMINI_CHUNK_OUTPUT_TOKENS = 24000

const DENSE_PROMPT_SUFFIX = `\n\n【더 촘촘히 재추출 모드】\n- 이미 뽑힌 카드와 겹치더라도 누락 가능성이 있으면 다시 추출한다.\n- 큰 단락 하나를 카드 하나로 요약하지 말고, 요건·효과·예외·판례·정의·비교 포인트를 가능한 한 작은 단위로 쪼갠다.\n- 두문자 주변의 괄호, 표, 번호, 조문, 판례명, 예외 문구를 놓치지 않는다.\n- 그러나 거부 규칙은 그대로 유지: mnemonic과 detail이 모두 명확히 작성되지 않는 카드는 절대 출력하지 마라.\n- 풀이를 정확히 모르는 글자가 하나라도 있으면 그 카드는 통째로 버려라. 빈 detail은 0개여야 한다.`

const MNEMONIC_PROMPT = `당신은 한국 법학 시험용 두문자(약어) 카드 추출 전문가입니다.
사법시험·변호사시험·로스쿨 시험에 나오는 두문자를 빠짐없이 뽑되, 풀이가 명확한 것만 카드로 만듭니다.

【카드 거부 규칙 — 가장 중요. 절대 준수】
1. mnemonic 필드와 detail 필드 중 하나라도 비어 있거나 부실하면 그 카드는 출력 금지.
2. detail은 반드시 "① 풀이1 / ② 풀이2 / ③ 풀이3 ..." 형식. mnemonic 글자 수와 detail 항목 수가 일치해야 함.
3. 두문자의 글자 중 풀이를 문서에서 확신할 수 없는 것이 하나라도 있으면 카드 통째로 버려라.
4. "..." "기타" "등" "(불명)" "(생략)" 같은 회피 표현 금지.
5. detail 길이가 4글자 미만이거나, 그저 단어 1개만 들어있으면 그 카드는 부실. 버려라.

이 규칙을 어긴 카드는 시스템이 자동 제거합니다. 따라서 처음부터 풀이가 가능한 두문자만 출력하세요.

【원칙】
- 문서에 실제로 있는 두문자만 추출. 지어내지 말 것.
- 요약 금지. 같은 주제라도 요건/효과/판례/예외는 각각 별도 카드.
- 원문 보존: detail은 문서 표현을 최대한 그대로 옮길 것.

【두문자 인식 패턴 — 하나라도 해당하면 후보로 검토】
1. 점 구분형: "이.가.게.귀.위", "동.매.철", "강.손.해.책"
2. 괄호/대괄호 설명형: "준.통.수 [준비완료·통지·수령]", "[의무위반/상당인과관계/손해범위]"
3. 꺽쇠 분리형: "<요건>이.가.게.귀.위 <효과>강.손.해.책" → 반드시 카드 2장
4. 조항 결합: "392조 강.손.해.책", "451조 동.기"
5. 한글 약어 나열: "모.사.실", "변.대.공"
6. 단어 축약: "출.구.정", "항.전", "적.기.해"
7. 영문/숫자 혼합: "파.판.5.도", "소.객.도 안.지"
8. 한자 포함: "생.원.유", "묘.지.명.철"
9. 특수 표기: "저+건.동.경", "3아.미안.신변"

【출력 필드 작성 규칙】

▶ question — 이 두문자가 정답이 될 수 있는 시험 문제 형식
   ✓ "이행지체의 성립요건 5가지는?"
   ✓ "민법 392조에 따른 이행지체의 효과는?"
   ✗ "이행지체" (단어만 — 금지)

▶ mnemonic — 두문자 표기 그대로 (점·꺽쇠·기호 보존)
   ✓ "이.가.게.귀.위"
   ✗ "이가게귀위" (구분자 제거 금지)

▶ detail — 각 글자의 의미를 번호 매겨 풀어쓰기 (필수)
   - 형식: "① 풀이1 / ② 풀이2 / ③ 풀이3 ..."
   - mnemonic 글자 수 = detail 항목 수
   - 단순 키워드("이행기")가 아니라 정식 표현("이행기가 도래할 것")으로
   - 한 글자라도 모르겠으면 카드 통째 폐기

【모범 예시】

예시1) 문서: "이행지체 요건 — 이.가.게.귀.위 [이행기 도래·이행 가능·이행 게을리·귀책사유·위법성]"
출력:
{"subject":"민법","part":"채권총론","question":"이행지체의 성립요건 5가지는?","mnemonic":"이.가.게.귀.위","detail":"① 이행기가 도래할 것 / ② 이행이 가능할 것 / ③ 채무자가 이행을 게을리할 것 / ④ 채무자의 귀책사유 / ⑤ 이행하지 않는 것이 위법할 것"}

예시2) 문서: "<요건>이.가.게.귀.위 <효과>강.손.해.책 (392조)"
→ 반드시 카드 2장:
{"subject":"민법","part":"채권총론","question":"이행지체의 성립요건은?","mnemonic":"이.가.게.귀.위","detail":"① 이행기 도래 / ② 이행 가능 / ③ 이행 게을리 / ④ 귀책사유 / ⑤ 위법성"}
{"subject":"민법","part":"채권총론","question":"이행지체의 효과는? (민법 392조)","mnemonic":"강.손.해.책","detail":"① 강제이행 / ② 손해배상 / ③ 계약해제 / ④ 책임가중"}

예시3) 문서: "준.통.수 [채권자가 수령준비 완료 · 채무자에게 통지 · 수령]"
출력:
{"subject":"민법","part":"채권총론","question":"채권자지체의 요건 3가지는?","mnemonic":"준.통.수","detail":"① 채권자의 수령준비 완료 / ② 채무자에 대한 통지 / ③ 수령(또는 수령에 협력)"}

【금지 예시 — 절대 출력하지 말 것】
✗ {"mnemonic":"이.가.게.귀.위","detail":""}  ← detail 비어 있음
✗ {"mnemonic":"이.가.게.귀.위","detail":"이행지체 요건"}  ← 항목 없이 단순 키워드
✗ {"mnemonic":"이.가.게.귀.위","detail":"① 이행기 / ② 가능 / ③ ... / ④ ... / ⑤ ..."}  ← 회피 표현
✗ {"mnemonic":"","detail":"① 이행기 도래 ..."}  ← mnemonic 비어 있음

【과목·단원】
- subject: 민법 / 형법 / 헌법 / 행정법 / 민사소송법 / 형사소송법 / 상법 등
- part: 문서의 장·절·단원 표기를 그대로 (예: 채권총론, 물권법, 법률행위)
- 불명확하면 빈 문자열 대신 "미분류"

【출력 형식】
순수 JSON 배열만. 코드블록·서문·말꼬리 일절 금지.
[{"subject":"","part":"","question":"","mnemonic":"","detail":""}, ...]

【최종 점검】
출력 직전에 거부 규칙 5개를 다시 확인하라.
mnemonic이 비었거나 / detail이 비었거나 / detail이 단순 키워드면 그 카드를 지워라.`

const QA_PROMPT = `당신은 한국 법학 시험 학습 카드 제작 전문가입니다.
시험에 나올 핵심 개념·요건·효과·판례·정의·예외를 Q&A 카드로 빠짐없이 추출하세요.

【카드 거부 규칙 — 절대 준수】
- question과 answer 중 하나라도 비어 있거나 부실하면 카드 출력 금지.
- answer가 단순 키워드 1개만 있는 경우 부실. 버려라.
- "..." "기타" "등" 같은 회피 표현 금지.

【원칙】
- 한 카드에 한 개념만. 묶어서 요약 금지.
- 문서에 없는 내용 지어내지 말 것.
- 카드가 많아도 좋음. 누락이 가장 큰 죄.

【작성 규칙】
▶ question — 시험 문제처럼 구체적으로
   ✓ "민법 제390조 채무불이행에 따른 손해배상의 요건은?"
   ✗ "채무불이행이란?"
▶ answer — 문서 표현 살려 정확히. 번호·구조 보존
   "① ... / ② ... / ③ ..." 또는 "요건: ... / 효과: ..."

【예시】
문서: "선의취득(민법 249조) — 동산을 평온·공연하게 양수한 자가 선의·무과실이면 즉시 소유권 취득"
출력:
{"subject":"민법","part":"물권법","question":"동산 선의취득(민법 249조)의 요건은?","answer":"① 동산일 것 / ② 평온·공연하게 양수 / ③ 양수인이 선의·무과실 / 효과: 즉시 소유권 취득"}

【출력】순수 JSON 배열만.
[{"subject":"","part":"","question":"","answer":""}]

【최종 점검】출력 전 문서를 다시 훑고, 거부 규칙 어긴 카드 있으면 지우고 출력하라.`

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
    ? `\n더 촘촘히 재추출 모드입니다. 이미 추출된 카드 수가 적다고 가정하고, 표·괄호·번호·판례·예외 문구까지 더 작은 단위로 쪼개세요.\n`
    : ''
  const rejectReminder = `\n핵심: mnemonic과 detail 둘 다 반드시 채울 것. detail은 "① ... / ② ..." 형식으로 글자 수만큼. 한쪽이라도 빈 카드는 출력 금지.\n`
  if (total <= 1) {
    return `다음 텍스트에서 카드를 최대한 많이, 빠짐없이 추출해주세요.
요약하지 말고 두문자/핵심 쟁점이 보이면 각각 별도 카드로 만드세요.
${rejectReminder}${denseGuide}
출력은 JSON 배열만 반환하세요.

${chunk}`
  }
  return `다음은 전체 문서 중 ${index + 1}/${total}번째 조각입니다.
이 조각에 있는 두문자/핵심 쟁점을 최대한 많이 추출하세요.
요약하지 말고, 작은 항목도 카드로 분리하세요.
앞뒤 조각과 일부 문맥이 겹칠 수 있으니 완전 동일한 중복만 줄이되, 누락 방지를 더 우선하세요.
${rejectReminder}${denseGuide}
출력은 JSON 배열만 반환하세요.

${chunk}`
}

function cardMergeKey(card) {
  const question = normQuestion(card?.question || '')
  const payload = normQuestion(card?.mnemonic || card?.answer || card?.detail || '')
  return `${question}|||${payload}`
}

function longerValue(a, b) {
  const av = a == null ? '' : String(a)
  const bv = b == null ? '' : String(b)
  return bv.length > av.length ? bv : av
}

function mergeExtractedCards(cards) {
  const map = new Map()
  cards.forEach((card) => {
    if (!card || typeof card !== 'object') return
    const key = cardMergeKey(card)
    if (key === '|||') return
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
      question: longerValue(prev.question, card.question),
      mnemonic: longerValue(prev.mnemonic, card.mnemonic),
      detail: longerValue(prev.detail, card.detail),
      answer: longerValue(prev.answer, card.answer),
    })
  })
  return Array.from(map.values())
}

// 두문자/설명 필수 검증 — AI가 거부 규칙을 어기고 보낸 부실 카드를 코드단에서 자동 제거
function isValidExtractedCard(card, extractType) {
  if (!card || typeof card !== 'object') return false

  const question = String(card.question || '').trim()
  if (!question) return false

  if (extractType === 'qa') {
    const answer = String(card.answer || '').trim()
    // 답이 비었거나, 2글자 미만이면 부실
    if (answer.length < 2) return false
    // 회피 표현만 들어있으면 거부
    if (/^[…·.\-\s]+$/.test(answer)) return false
    return true
  }

  // 두문자 모드: mnemonic과 detail 둘 다 필수
  const mnem = String(card.mnemonic || '').trim()
  const detail = String(card.detail || '').trim()

  if (!mnem) return false
  if (!detail) return false

  // detail이 단순 기호/공백만 있는 경우 거부
  if (/^[…·.\-\s]+$/.test(detail)) return false
  // detail이 너무 짧으면 단순 키워드일 가능성 → 거부
  if (detail.length < 4) return false
  // detail이 회피 표현으로만 끝나면 거부
  if (/(\.\.\.\s*\/?\s*){2,}/.test(detail)) return false
  if (/^(기타|등|불명|생략)$/.test(detail)) return false

  return true
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
        [{ text: makeChunkPrompt(chunks[i], i, chunks.length, { dense: options.dense }) }],
        systemPrompt,
        (msg) => setProgress(`${prefix} · ${msg.replace(/^☁️\s*/, '')}`),
        { maxOutputTokens: chunks.length > 1 ? GEMINI_CHUNK_OUTPUT_TOKENS : GEMINI_MAX_OUTPUT_TOKENS }
      )
      const { data, truncated } = repairJSON(raw)
      if (Array.isArray(data)) collected.push(...data)
      wasTruncated = wasTruncated || truncated
    } catch (e) {
      if (chunks.length === 1) throw e
      failed.push({ index: i + 1, message: e.message })
      console.warn(`텍스트 조각 ${i + 1}/${chunks.length} 추출 실패`, e)
      if (failed.length > Math.max(1, Math.ceil(chunks.length * 0.35))) {
        throw new Error(`텍스트 조각 ${failed.length}개 분석에 실패했습니다. 문서를 더 작게 나눠 다시 시도해주세요.`)
      }
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
]

function isUnclassified(value) {
  const v = String(value || '').trim()
  return !v || v === '미분류'
}

function getReviewIssues(card) {
  const issues = []
  const isQA = !card?.mnemonic && card?.answer != null
  if (isUnclassified(card?.subject)) issues.push('과목 확인')
  if (isUnclassified(card?.part)) issues.push('단원 확인')
  if (!String(card?.question || '').trim()) issues.push('질문 없음')
  if (isQA) {
    if (!String(card?.answer || '').trim()) issues.push('답 없음')
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
  if (filter === 'unclassified') return isUnclassified(card?.subject) || isUnclassified(card?.part)
  if (filter === 'missingCore') return getReviewIssues(card).some((x) => ['질문 없음', '답 없음', '두문자 없음', '설명 없음'].includes(x))
  if (filter === 'mnemonic') return !!card?.mnemonic
  if (filter === 'qa') return !card?.mnemonic && card?.answer != null
  return true
}

function buildPrompt(extractType, dense = false) {
  const base = extractType === 'qa' ? QA_PROMPT : MNEMONIC_PROMPT
  return dense ? `${base}${DENSE_PROMPT_SUFFIX}` : base
}

function buildPdfInstruction(dense = false) {
  const reject = '단, mnemonic과 detail 둘 다 반드시 채울 것. 풀이가 명확하지 않은 두문자는 카드 자체를 출력하지 마세요.'
  return dense
    ? `더 촘촘히 재추출합니다. 이 PDF를 처음부터 끝까지 다시 훑고, 요건·효과·예외·판례·조문·표·괄호 설명·두문자를 작은 단위로 최대한 많이 카드화하세요. 이미 나온 카드와 겹쳐도 누락 방지가 우선입니다. ${reject} 출력은 JSON 배열만 반환하세요.`
    : `이 문서의 모든 내용을 처음부터 끝까지 훑어 카드를 최대한 많이, 빠짐없이 추출해주세요. 요약하지 말고 두문자/핵심 쟁점이 보이면 각각 별도 카드로 만드세요. ${reject} 출력은 JSON 배열만 반환하세요.`
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

function GroupRow({ group, onApply, subjects, getParts }) {
  const uid = useId()
  const [draftSubj, setDraftSubj] = useState(group.subject === '미분류' ? '' : group.subject)
  const [draftPart, setDraftPart] = useState(group.part === '미분류' ? '' : group.part)

  useEffect(() => {
    setDraftSubj(group.subject === '미분류' ? '' : group.subject)
    setDraftPart(group.part === '미분류' ? '' : group.part)
  }, [group])

  const changed = draftSubj !== (group.subject === '미분류' ? '' : group.subject) ||
                  draftPart !== (group.part === '미분류' ? '' : group.part)

  const safeParts = typeof getParts === 'function' ? (getParts(draftSubj) || []) : []
  const inputStyle = { width: '100%', boxSizing: 'border-box', background: '#0f172a', border: '1px solid #334155', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, outline: 'none', minWidth: 0 }

  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'rgba(15,23,42,0.6)', padding: '12px 16px', borderRadius: 12, marginBottom: 8, border: '1px solid #1e293b' }}>
      <div style={{ flex: 1, display: 'flex', gap: 8, flexWrap: 'nowrap' }}>
        <DataListInput id={`ge-sub-${uid}`} value={draftSubj} onChange={e => setDraftSubj(e.target.value)} placeholder="과목" style={inputStyle} options={subjects} />
        <DataListInput id={`ge-part-${uid}`} value={draftPart} onChange={e => setDraftPart(e.target.value)} placeholder="단원" style={inputStyle} options={safeParts} />
      </div>
      <div style={{ width: 44, textAlign: 'center', color: '#94a3b8', fontSize: 12, fontWeight: 700 }}>{group.count}장</div>
      <button onClick={() => { if (changed) onApply(group.subject, group.part, draftSubj, draftPart) }} disabled={!changed} style={{ background: changed ? 'linear-gradient(135deg,#6366f1,#8b5cf6)' : '#1e293b', color: changed ? '#fff' : '#64748b', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13, cursor: changed ? 'pointer' : 'not-allowed', fontWeight: 700, flexShrink: 0 }}>적용</button>
    </div>
  )
}

function GroupEditorPanel({ extracted, onUpdateGroup, subjects, getParts }) {
  const [open, setOpen] = useState(true)

  const groups = useMemo(() => {
    const map = new Map()
    extracted.forEach(c => {
      const subj = c.subject || '미분류'
      const pt = c.part || '미분류'
      const key = `${subj}|||${pt}`
      if (!map.has(key)) map.set(key, { subject: subj, part: pt, count: 0 })
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
              <GroupRow key={`${g.subject}|||${g.part}`} group={g} onApply={onUpdateGroup} subjects={subjects} getParts={getParts} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CardItem({ card, type, checked, onToggle, onChange, subjects = [], getParts }) {
  const uid = useId()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(card)
  const meta = TYPE_META[type] || TYPE_META.new
  const isQA = !card.mnemonic && card.answer != null
  const issues = getReviewIssues(card)

  let safeParts = []
  try { if (typeof getParts === 'function') { const partsResult = getParts(draft?.subject || ''); if (Array.isArray(partsResult)) safeParts = partsResult } } catch(e) {}
  const safeSubjects = Array.isArray(subjects) ? subjects : []

  const commitEdit = () => { onChange(draft); setEditing(false) }

  const inputStyle = { width: '100%', boxSizing: 'border-box', minWidth: 0, background: '#0a0f1e', border: '1px solid #334155', borderRadius: 6, padding: '6px 9px', color: '#e2e8f0', fontSize: 13, fontFamily: 'inherit', outline: 'none', marginBottom: 5, resize: 'vertical' }

  if (editing) {
    return (
      <div style={{ background: checked ? 'rgba(99,102,241,0.1)' : 'rgba(15,23,42,0.7)', border: `1px solid ${checked ? '#6366f1' : '#1e293b'}`, borderRadius: 12, padding: '11px 13px', display: 'flex', flexDirection: 'column', width: '100%', boxSizing: 'border-box', cursor: 'default' }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', gap: 6, width: '100%' }}>
          <DataListInput id={`ext-sub-${uid}`} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} placeholder="과목" style={inputStyle} options={safeSubjects} />
          <DataListInput id={`ext-part-${uid}`} value={draft.part} onChange={(e) => setDraft({ ...draft, part: e.target.value })} placeholder="단원" style={inputStyle} options={safeParts} />
        </div>
        <input style={inputStyle} value={draft.question || ''} onChange={(e) => setDraft({ ...draft, question: e.target.value })} placeholder="질문" />
        {isQA ? (
          <textarea style={{ ...inputStyle, minHeight: 60 }} value={draft.answer || ''} onChange={(e) => setDraft({ ...draft, answer: e.target.value })} placeholder="답" />
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
          <span style={{ background: '#1e293b', color: '#94a3b8', fontSize: 10, borderRadius: 4, padding: '2px 7px', wordBreak: 'keep-all' }}>{card.subject || '미분류'}</span>
          <span style={{ background: '#1e293b', color: '#64748b', fontSize: 10, borderRadius: 4, padding: '2px 7px', wordBreak: 'keep-all' }}>{card.part || '미분류'}</span>
          {issues.slice(0, 3).map((issue) => (
            <span key={issue} style={{ background: 'rgba(245,158,11,0.12)', color: '#fbbf24', border: '1px solid rgba(245,158,11,0.35)', fontSize: 10, borderRadius: 4, padding: '2px 7px', wordBreak: 'keep-all' }}>{issue}</span>
          ))}
        </div>
        <div onClick={onToggle} style={{ cursor: 'pointer', wordBreak: 'keep-all', overflowWrap: 'break-word' }}>
          <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{card.question}</div>
          {isQA ? (
            <div style={{ color: '#94a3b8', fontSize: 12, lineHeight: 1.5 }}>{card.answer}</div>
          ) : (
            <>
              <div style={{ color: '#818cf8', fontSize: 14, fontWeight: 700, letterSpacing: 1, marginBottom: type === 'upgrade' ? 4 : 0, overflowWrap: 'anywhere' }}>{card.mnemonic}</div>
              {type === 'upgrade' && <div style={{ color: '#64748b', fontSize: 11, lineHeight: 1.5 }}>{card.detail}</div>}
            </>
          )}
        </div>
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

  const allSubjects = useMemo(() => {
    let existing = []
    try { if (Array.isArray(cards?.subjects)) existing = cards.subjects } catch(e){}
    const newSubjects = Array.isArray(extracted) ? extracted.map(c => c?.subject).filter(Boolean) : []
    return [...new Set([...existing, ...newSubjects])]
  }, [cards?.subjects, extracted])

  const getPartsForSubject = useCallback((subj) => {
    if (!subj) return []
    let existingParts = []
    try { if (typeof cards?.parts === 'function') existingParts = cards.parts(subj) || [] } catch(e){}
    const newParts = Array.isArray(extracted) ? extracted.filter(c => c?.subject === subj).map(c => c?.part).filter(Boolean) : []
    return [...new Set([...existingParts, ...newParts])]
  }, [cards, extracted])

  const updateGroup = useCallback((oldSubj, oldPart, newSubj, newPart) => {
    setExtracted(prev => prev.map(c => {
      const s = c.subject || '미분류'
      const p = c.part || '미분류'
      if (s === oldSubj && p === oldPart) {
        const updated = { ...c, subject: newSubj, part: newPart }
        updated._type = classifyCard(updated, cards.allCards || []).type
        return updated
      }
      return c
    }))
  }, [cards.allCards])

  const saveGeminiKey = (k) => { sessionStorage.setItem('gemini_key', k); setGeminiKey(k) }

  const readBase64 = (f) => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = () => rej(new Error('파일 읽기 실패')); r.readAsDataURL(f)
  })

  const finishExtraction = useCallback((parsed, wasTruncated, options = {}) => {
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error(extractType === 'qa' ? '핵심 Q&A 내용을 추출하지 못했습니다.' : '두문자 카드를 추출하지 못했습니다.')
    }

    const normalized = parsed
      .filter((c) => c && typeof c === 'object')
      .map((c) =>
        extractType === 'qa'
          ? { subject: c.subject || '', part: c.part || '', question: c.question || '', mnemonic: '', detail: '', answer: c.answer || '' }
          : { subject: c.subject || '', part: c.part || '', question: c.question || '', mnemonic: c.mnemonic || '', detail: c.detail || '', answer: c.answer || '' }
      )

    // 두문자/설명 필수 검증 — AI가 거부 규칙 어긴 부실 카드를 코드단에서 자동 제거
    const beforeFilter = normalized.length
    const validated = normalized.filter((c) => isValidExtractedCard(c, extractType))
    const droppedThisRun = beforeFilter - validated.length

    if (validated.length === 0) {
      throw new Error(extractType === 'qa'
        ? '추출된 Q&A 카드의 답이 모두 비어 있어 사용할 수 없습니다. 문서를 좀 더 명확하게 정리해 다시 시도해주세요.'
        : '추출된 두문자 카드에 설명(detail)이 모두 비어 있어 사용할 수 없습니다. 문서에 두문자 풀이가 함께 적혀 있는지 확인하고 다시 시도해주세요.')
    }

    const mergeBase = Array.isArray(options.mergeBase)
      ? options.mergeBase.map(({ _type, ...card }) => card)
      : []

    const classified = mergeExtractedCards([...mergeBase, ...validated])
      .map((c) => ({ ...c, _type: classifyCard(c, cards.allCards || []).type }))

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
      setErrorMsg(e.message)
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

      const { data: parsed, truncated: wasTruncated } = await extractTextWithChunks(geminiKey, text, prompt, label, setProgress, { dense: options.dense })
      finishExtraction(parsed, wasTruncated, { mergeBase: options.mergeBase })
    } catch (e) {
      setErrorMsg(e.message)
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
      const base64 = await readBase64(f)
      setLastSource({ kind: 'pdf', label: f.name, file: f })
      const geminiPayload = [
        { inline_data: { mime_type: 'application/pdf', data: base64 } },
        { text: buildPdfInstruction(false) },
      ]
      await runExtraction(geminiPayload, f.name)
    }
  }, [geminiKey, runExtraction, runTextExtraction])

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
      await runExtraction([
        { inline_data: { mime_type: 'application/pdf', data: base64 } },
        { text: buildPdfInstruction(true) },
      ], lastSource.label || lastSource.file.name || 'PDF', { dense: true, mergeBase })
    }
  }, [lastSource, extracted, runExtraction, runTextExtraction])

  const toggle = (i) => setSelected((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })

  const updateCard = (i, updated) => {
    setExtracted((prev) => { const next = [...prev]; next[i] = { ...updated, _type: classifyCard(updated, cards.allCards || []).type }; return next })
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
    const toAdd = extracted.filter((c, i) => selected.has(i)).map(({ _type, ...c }) => c)
    if (toAdd.length === 0) return
    const added = await cards.addCards(toAdd)
    const skipped = toAdd.length - added
    setImportMsg(skipped > 0 ? `✓ ${added}개 추가 (중복 ${skipped}개 제외)` : `✓ ${added}개 추가됨`)
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
        Gemini로 PDF와 텍스트를 분석해 시험 암기 노트를 빌드합니다.
      </p>

      {/* 🔑 API 키 패널 */}
      <div style={{ marginBottom: 20, width: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 14, background: 'rgba(15,23,42,0.4)', padding: 16, borderRadius: 14, border: '1px solid #1e293b' }}>
        <div>
          <span style={{ color: '#94a3b8', fontSize: 13, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
            <span><b>Gemini</b> API 키 <span style={{ color: '#64748b', fontSize: 11 }}>(필수 · 대용량 PDF용)</span></span>
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
          Gemini API 키를 등록해야 플래시카드 자동 추출 시스템을 가동할 수 있습니다.
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
              <div style={{ color: '#475569', fontSize: 11, marginTop: 10, lineHeight: 1.6, wordBreak: 'keep-all' }}>TXT는 자동 분할 분석 · PDF는 단원 단위 업로드 권장 (최대 {MAX_FILE_MB}MB) · Word는 PDF로 변환 후 업로드</div>
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
              🧹 두문자나 설명이 비어 있던 <b>{droppedCount}장</b>을 자동으로 제외했습니다. 시험에 쓸 수 있는 카드만 남겼어요.
            </div>
          )}

          {truncated && (
            <div style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 12, padding: '14px 16px', marginBottom: 16, color: '#fbbf24', fontSize: 13, lineHeight: 1.6 }}>
              ⚠️ <b>일부 결과가 불안정할 수 있습니다:</b> 응답이 중간에 잘렸거나 일부 텍스트 조각 분석에 실패했을 수 있으니, 누락이 보이면 <b>문서를 조금 더 작게 분할하여</b> 실행해 주세요.
            </div>
          )}

          <GroupEditorPanel extracted={extracted} onUpdateGroup={updateGroup} subjects={allSubjects} getParts={getPartsForSubject} />

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
                <CardItem key={i} card={c} type={c._type} checked={selected.has(i)} onToggle={() => toggle(i)} onChange={(updated) => updateCard(i, updated)} subjects={allSubjects} getParts={getPartsForSubject} />
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

// 한국어 답안 채점 유틸 (v2).
// 핵심 변경:
//   1) 정확도는 "정규화된 음절 시퀀스의 LCS 비율"로 계산
//      → 공백·구두점·일부 조사 차이는 정확도에 영향 없음
//   2) 표시용 diff는 어절 단위로 별도 생성 → 가독성 확보
//   3) 음절 단위 LCS는 사전 정규화로 길이가 크게 줄어 큰 답안도 안전

const KOR_PARTICLE_RE = /(?:은|는|이|가|을|를|의|에|에서|에게|으로|로|와|과|이나|도|만|까지|부터)\b/g

export function normalizeMoney(value = '') {
  let text = String(value)

  text = text.replace(/(\d+(?:,\d{3})*)\s*억\s*(\d+(?:,\d{3})*)\s*만\s*원/g, (_, eok, man) => {
    const eokValue = Number.parseInt(String(eok).replace(/,/g, ''), 10)
    const manValue = Number.parseInt(String(man).replace(/,/g, ''), 10)
    return `${(eokValue * 100000000 + manValue * 10000).toLocaleString('en-US')}원`
  })

  text = text.replace(/(\d+(?:,\d{3})*)\s*억\s*원/g, (_, eok) =>
    `${(Number.parseInt(String(eok).replace(/,/g, ''), 10) * 100000000).toLocaleString('en-US')}원`
  )

  text = text.replace(/(\d+(?:,\d{3})*)\s*만\s*원/g, (_, man) =>
    `${(Number.parseInt(String(man).replace(/,/g, ''), 10) * 10000).toLocaleString('en-US')}원`
  )

  text = text.replace(/(\d{4,})\s*원/g, (_, number) =>
    `${Number(number).toLocaleString('en-US')}원`
  )

  return text.replace(/(\d|,)\s+원/g, '$1원')
}

// 표시용 정규화 (공백·구두점 통일, 원문 형태는 보존)
export function normalizeForDiff(value = '') {
  return normalizeMoney(value)
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u00B7\u2022\u2027]/g, '.')
    .replace(/[\u00A0\u200B\uFEFF]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 비교용 정규화 (공백·구두점·일부 조사 제거)
function normalizeForCompare(value = '') {
  return normalizeForDiff(value)
    .toLowerCase()
    .replace(KOR_PARTICLE_RE, '')
    .replace(/[\s.,;:!?()\[\]{}"'\u00B7\u3001\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F\-_/+]/g, '')
}

// LCS 길이만 계산 (메모리 O(n))
function lcsLength(a, b) {
  const m = a.length
  const n = b.length
  if (m === 0 || n === 0) return 0

  let prev = new Uint32Array(n + 1)
  let curr = new Uint32Array(n + 1)
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) curr[j] = prev[j - 1] + 1
      else curr[j] = Math.max(prev[j], curr[j - 1])
    }
    const tmp = prev; prev = curr; curr = tmp
    curr.fill(0)
  }
  return prev[n]
}

const MAX_LCS_CELLS = 4_000_000

function computeAccuracy(userInput, correctAnswer) {
  const u = normalizeForCompare(userInput)
  const c = normalizeForCompare(correctAnswer)
  if (c.length === 0) return u.length === 0 ? 100 : 0
  if (u.length === 0) return 0

  let userStr = u, correctStr = c
  if ((userStr.length + 1) * (correctStr.length + 1) > MAX_LCS_CELLS) {
    const cap = Math.floor(Math.sqrt(MAX_LCS_CELLS)) - 1
    if (userStr.length > cap) {
      const half = Math.floor(cap / 2)
      userStr = userStr.slice(0, half) + userStr.slice(-half)
    }
    if (correctStr.length > cap) {
      const half = Math.floor(cap / 2)
      correctStr = correctStr.slice(0, half) + correctStr.slice(-half)
    }
  }

  const lcs = lcsLength(userStr, correctStr)
  return Math.max(0, Math.min(100, Math.round((lcs / c.length) * 100)))
}

// 표시용 어절 단위 토큰화
function tokenizeForDiff(value) {
  const norm = normalizeForDiff(value)
  if (!norm) return []
  const parts = norm.split(/(\s+|[.,;:!?()\[\]{}"'\u00B7\u3001\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F])/).filter(Boolean)
  return parts.map((raw) => {
    const isWs = /^\s+$/.test(raw)
    const isPunct = /^[.,;:!?()\[\]{}"'\u00B7\u3001\uFF0C\u3002\uFF1B\uFF1A\uFF01\uFF1F]$/.test(raw)
    if (isWs) return { text: raw, key: ' ', kind: 'ws' }
    if (isPunct) return { text: raw, key: raw, kind: 'punct' }
    return { text: raw, key: normalizeForCompare(raw), kind: 'word' }
  })
}

function buildDisplayDiff(userInput, correctAnswer) {
  const aTokens = tokenizeForDiff(userInput)
  const bTokens = tokenizeForDiff(correctAnswer)
  const m = aTokens.length, n = bTokens.length

  if (m === 0) return bTokens.map((t) => ({ type: 'add', text: t.text }))
  if (n === 0) return aTokens.map((t) => ({ type: 'del', text: t.text }))

  if ((m + 1) * (n + 1) > 2_000_000) {
    return [
      { type: 'del', text: aTokens.map((t) => t.text).join('') },
      { type: 'add', text: bTokens.map((t) => t.text).join('') },
    ]
  }

  const dp = new Array(m + 1)
  for (let i = 0; i <= m; i++) dp[i] = new Uint32Array(n + 1)
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (aTokens[i - 1].key === bTokens[j - 1].key && aTokens[i - 1].key !== '') {
        dp[i][j] = dp[i - 1][j - 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
  }

  const result = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aTokens[i - 1].key === bTokens[j - 1].key && aTokens[i - 1].key !== '') {
      result.unshift({ type: 'same', text: aTokens[i - 1].text })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'add', text: bTokens[j - 1].text })
      j--
    } else {
      result.unshift({ type: 'del', text: aTokens[i - 1].text })
      i--
    }
  }

  return result.reduce((merged, part) => {
    const last = merged[merged.length - 1]
    if (last && last.type === part.type) last.text += part.text
    else merged.push({ ...part })
    return merged
  }, [])
}

export function computeDiff(userText = '', correctText = '') {
  return buildDisplayDiff(userText, correctText)
}

export function gradeAnswer(userInput = '', correctAnswer = '') {
  const accuracy = computeAccuracy(userInput, correctAnswer)
  const diff = buildDisplayDiff(userInput, correctAnswer)
  const errorCount = diff.filter((part) => part.type !== 'same').length

  const userNorm = normalizeForCompare(userInput)
  const correctNorm = normalizeForCompare(correctAnswer)

  return {
    diff,
    accuracy,
    errorCount,
    isPerfect: userNorm === correctNorm && userNorm.length > 0,
  }
}

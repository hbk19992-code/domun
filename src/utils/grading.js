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

export function normalizeForDiff(value = '') {
  return normalizeMoney(value).replace(/\s+/g, ' ').trim()
}

export function computeDiff(userText = '', correctText = '') {
  const a = String(userText)
  const b = String(correctText)
  const m = a.length
  const n = b.length

  if (m * n > 1000000) {
    return [
      { type: 'del', text: a },
      { type: 'add', text: b },
    ]
  }

  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  const parts = []
  let i = m
  let j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      parts.unshift({ type: 'same', text: a[i - 1] })
      i -= 1
      j -= 1
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      parts.unshift({ type: 'add', text: b[j - 1] })
      j -= 1
    } else {
      parts.unshift({ type: 'del', text: a[i - 1] })
      i -= 1
    }
  }

  return parts.reduce((merged, part) => {
    const last = merged[merged.length - 1]
    if (last && last.type === part.type) last.text += part.text
    else merged.push({ ...part })
    return merged
  }, [])
}

export function gradeAnswer(userInput = '', correctAnswer = '') {
  const userText = normalizeForDiff(userInput)
  const correctText = normalizeForDiff(correctAnswer)
  const diff = computeDiff(userText, correctText)
  const correctChars = correctText.length || 1
  const sameChars = diff
    .filter((part) => part.type === 'same')
    .reduce((sum, part) => sum + part.text.length, 0)
  const accuracy = Math.round((sameChars / correctChars) * 100)
  const errorCount = diff.filter((part) => part.type !== 'same').length

  return {
    diff,
    accuracy,
    errorCount,
    isPerfect: userText === correctText,
  }
}

// 두문자/질문 정규화 및 카드 비교 공통 로직

export function normMnemonic(s = '') {
  return s
    .replace(/[.\u00B7\u30FB\u318D·・\-\s()\[\]{}\/+]/g, '')
    .replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g, '')
    .toLowerCase().trim()
}

export function normQuestion(s = '') {
  return s
    .replace(/[?？!！.\s]/g, '')
    .replace(/(?:은|는|이|가|을|를|의|에|로|으로|란|이란)$/g, '')
    .toLowerCase().trim()
}

// 두 카드가 중복인지 (정규화된 두문자 OR 질문이 같으면 중복)
export function isDuplicate(a, b) {
  const ma = normMnemonic(a.mnemonic)
  const mb = normMnemonic(b.mnemonic)
  const qa = normQuestion(a.question)
  const qb = normQuestion(b.question)
  if (ma && mb && ma === mb) return true
  if (qa && qb && qa === qb) return true
  return false
}

// 새 카드를 기존 카드와 비교해 분류
// 'new' | 'upgrade' | 'existing'
export function classifyCard(card, existing) {
  const match = existing.find((e) => isDuplicate(e, card))
  if (!match) return { type: 'new', match: null }
  const newLen = (card.detail || '').length
  const existLen = (match.detail || '').length
  if (newLen > existLen + 15) return { type: 'upgrade', match }
  return { type: 'existing', match }
}

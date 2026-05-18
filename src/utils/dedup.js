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
export function isDuplicate(a, b) {
  const ma = normMnemonic(a.mnemonic), mb = normMnemonic(b.mnemonic)
  const qa = normQuestion(a.question), qb = normQuestion(b.question)
  if (ma && mb && ma === mb) return true
  if (qa && qb && qa === qb) return true
  return false
}
export function classifyCard(card, existing) {
  const match = existing.find((e) => isDuplicate(e, card))
  if (!match) return { type: 'new', match: null }
  const newLen = (card.detail || '').length
  const existLen = (match.detail || '').length
  if (newLen > existLen + 15) return { type: 'upgrade', match }
  return { type: 'existing', match }
}

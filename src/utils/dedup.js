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

function normScope(s = '') {
  return String(s ?? '').replace(/\s/g, '').toLowerCase().trim()
}

function normPayload(card = {}) {
  return String(`${card.detail || ''}\n${card.answer || ''}`)
    .replace(/\s/g, '')
    .replace(/[^\uAC00-\uD7A3a-zA-Z0-9]/g, '')
    .toLowerCase()
    .trim()
}

function sameSubjectPart(a = {}, b = {}) {
  return normScope(a.subject) === normScope(b.subject) && normScope(a.part) === normScope(b.part)
}

export function isDuplicate(a, b) {
  const ma = normMnemonic(a.mnemonic), mb = normMnemonic(b.mnemonic)
  const qa = normQuestion(a.question), qb = normQuestion(b.question)
  if (qa && qb && qa === qb) return true
  if (!ma || !mb || ma !== mb || !sameSubjectPart(a, b)) return false

  const pa = normPayload(a), pb = normPayload(b)
  if (pa && pb && pa === pb) return true
  if (qa && qb && Math.min(qa.length, qb.length) >= 8 && (qa.includes(qb) || qb.includes(qa))) return true

  return false
}
export function classifyCard(card, existing) {
  const match = existing.find((e) => isDuplicate(e, card))
  if (!match) return { type: 'new', match: null }
  const newLen = `${card.detail || ''}${card.answer || ''}`.length
  const existLen = `${match.detail || ''}${match.answer || ''}`.length
  if (newLen > existLen + 15) return { type: 'upgrade', match }
  return { type: 'existing', match }
}

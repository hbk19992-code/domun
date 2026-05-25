const CARD_KINDS = new Set(['mnemonic', 'qa', 'case', 'statute', 'record'])

function clean(value) {
  return String(value ?? '').trim()
}

export function getCardKind(card = {}) {
  const explicit = clean(card.cardType)
  if (CARD_KINDS.has(explicit)) return explicit
  if (!clean(card.mnemonic) && clean(card.answer)) return 'qa'
  return 'mnemonic'
}

export function isAnswerCard(card = {}) {
  return getCardKind(card) !== 'mnemonic'
}

export function isCivilRecordGradingCard(card = {}) {
  if (!isAnswerCard(card) || !clean(card.answer)) return false
  if (getCardKind(card) === 'record') return true

  const subject = clean(card.subject)
  const part = clean(card.part)
  const scope = `${subject} ${part}`.replace(/\s/g, '')
  if (/민기록|민사기록|민사기록형/.test(scope)) return true

  return /^DT\d*/i.test(part.replace(/\s/g, '')) && /민/.test(subject)
}

export function cardKindLabel(cardOrKind = {}) {
  const kind = typeof cardOrKind === 'string' ? cardOrKind : getCardKind(cardOrKind)
  if (kind === 'record') return '민사기록형'
  if (typeof cardOrKind !== 'string' && isCivilRecordGradingCard(cardOrKind)) return '민사기록형'
  if (kind === 'case') return '판례'
  if (kind === 'statute') return '조문'
  if (kind === 'qa') return 'Q&A'
  return '두문자'
}

export function answerLabel(cardOrKind = {}) {
  const kind = typeof cardOrKind === 'string' ? cardOrKind : getCardKind(cardOrKind)
  if (kind === 'record') return '모범답안'
  if (typeof cardOrKind !== 'string' && isCivilRecordGradingCard(cardOrKind)) return '모범답안'
  if (kind === 'case') return '판례 요지'
  if (kind === 'statute') return '조문 내용'
  return '정답'
}

export function answerPlaceholder(kind) {
  if (kind === 'record') return '기록형 모범답안이나 채점 포인트를 입력하세요'
  if (kind === 'case') return '판례 요지와 키워드를 입력하세요'
  if (kind === 'statute') return '조문 내용이나 암기 포인트를 입력하세요'
  return '뒤집었을 때 보일 정답 해설을 입력하세요'
}

export const DEFAULT_TOP_CATEGORY = '기본'

export function cleanLabel(value, fallback = '') {
  const text = String(value ?? '').trim()
  return text || fallback
}

export function getTopCategory(card = {}) {
  return cleanLabel(
    card.topCategory ?? card.category ?? card.collection ?? card.deck ?? card.group,
    DEFAULT_TOP_CATEGORY
  )
}

export function matchesTopCategory(card, topCategory) {
  return !topCategory || topCategory === '전체' || getTopCategory(card) === topCategory
}

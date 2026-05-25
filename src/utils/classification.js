export const DEFAULT_TOP_CATEGORY = '기본'
export const GLOBAL_ORDER_KEY = '__all__'
const PART_KEY_SEPARATOR = '\u0000'

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

export function uniqueLabels(values = []) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => cleanLabel(value)).filter(Boolean))]
}

export function sortLabelsByOrder(labels = [], orderList = []) {
  const unique = uniqueLabels(labels)
  const order = uniqueLabels(orderList)
  if (order.length === 0) return unique

  const labelIndex = new Map(unique.map((label, index) => [label, index]))
  const orderIndex = new Map(order.map((label, index) => [label, index]))

  return unique.sort((a, b) => {
    const ai = orderIndex.has(a) ? orderIndex.get(a) : Number.MAX_SAFE_INTEGER
    const bi = orderIndex.has(b) ? orderIndex.get(b) : Number.MAX_SAFE_INTEGER
    if (ai !== bi) return ai - bi
    return labelIndex.get(a) - labelIndex.get(b)
  })
}

export function subjectOrderKey(topCategory = GLOBAL_ORDER_KEY) {
  const key = cleanLabel(topCategory, GLOBAL_ORDER_KEY)
  return key === '전체' ? GLOBAL_ORDER_KEY : key
}

export function partOrderKey(topCategory = GLOBAL_ORDER_KEY, subject = '') {
  return `${subjectOrderKey(topCategory)}${PART_KEY_SEPARATOR}${cleanLabel(subject)}`
}

export function normalizeClassificationOrder(order = {}) {
  const subjects = order?.subjects && typeof order.subjects === 'object' ? order.subjects : {}
  const parts = order?.parts && typeof order.parts === 'object' ? order.parts : {}
  return {
    topCategories: uniqueLabels(order?.topCategories),
    subjects: Object.fromEntries(Object.entries(subjects).map(([key, value]) => [key, uniqueLabels(value)])),
    parts: Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, uniqueLabels(value)])),
  }
}

function orderRank(label, orderList = []) {
  const order = uniqueLabels(orderList)
  const index = order.indexOf(cleanLabel(label))
  return index >= 0 ? index : Number.MAX_SAFE_INTEGER
}

export function sortCardsByClassificationOrder(cards = [], order = {}) {
  const normalized = normalizeClassificationOrder(order)
  const subjectOrderFor = (topCategory) =>
    normalized.subjects[subjectOrderKey(topCategory)] || normalized.subjects[GLOBAL_ORDER_KEY]
  const partOrderFor = (topCategory, subject) =>
    normalized.parts[partOrderKey(topCategory, subject)] || normalized.parts[partOrderKey(GLOBAL_ORDER_KEY, subject)]

  return [...(Array.isArray(cards) ? cards : [])]
    .map((card, index) => ({ card, index }))
    .sort((a, b) => {
      const at = getTopCategory(a.card)
      const bt = getTopCategory(b.card)
      const topDiff = orderRank(at, normalized.topCategories) - orderRank(bt, normalized.topCategories)
      if (topDiff) return topDiff

      const as = cleanLabel(a.card?.subject)
      const bs = cleanLabel(b.card?.subject)
      const subjectDiff = orderRank(as, subjectOrderFor(at)) - orderRank(bs, subjectOrderFor(bt))
      if (subjectDiff) return subjectDiff

      const ap = cleanLabel(a.card?.part)
      const bp = cleanLabel(b.card?.part)
      const partDiff = orderRank(ap, partOrderFor(at, as)) - orderRank(bp, partOrderFor(bt, bs))
      if (partDiff) return partDiff

      return a.index - b.index
    })
    .map(({ card }) => card)
}

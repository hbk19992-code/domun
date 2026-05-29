export const DEFAULT_TOP_CATEGORY = '기본'
export const GLOBAL_ORDER_KEY = '__all__'
const LEGACY_PART_KEY_SEPARATOR = '\u0000'
const PART_KEY_SEPARATOR = '::domun-part::'

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

export function splitPartOrderKey(key = '') {
  const text = String(key || '')
  const separator = text.includes(PART_KEY_SEPARATOR) ? PART_KEY_SEPARATOR : LEGACY_PART_KEY_SEPARATOR
  const [topCategory = GLOBAL_ORDER_KEY, ...subjectParts] = text.split(separator)
  return [cleanLabel(topCategory, GLOBAL_ORDER_KEY), subjectParts.join(separator)]
}

function normalizePartMapKey(key) {
  const [topCategory, subject] = splitPartOrderKey(key)
  return partOrderKey(topCategory, subject)
}

function entriesToOrderMap(entries = []) {
  if (!Array.isArray(entries)) return {}
  return Object.fromEntries(entries
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => [cleanLabel(entry.key), uniqueLabels(entry.values)])
    .filter(([key, values]) => key && values.length > 0)
  )
}

function normalizeOrderMap(value = {}, normalizeKey = (key) => cleanLabel(key)) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {}
  return Object.fromEntries(Object.entries(source)
    .map(([key, labels]) => [normalizeKey(key), uniqueLabels(labels)])
    .filter(([key, labels]) => key && labels.length > 0)
  )
}

export function normalizeClassificationOrder(order = {}) {
  const subjects = order?.subjectsEntries ? entriesToOrderMap(order.subjectsEntries) : order?.subjects
  const parts = order?.partsEntries ? entriesToOrderMap(order.partsEntries) : order?.parts
  return {
    topCategories: uniqueLabels(order?.topCategories),
    subjects: normalizeOrderMap(subjects),
    parts: normalizeOrderMap(parts, normalizePartMapKey),
  }
}

function orderMapToEntries(map = {}) {
  return Object.entries(map)
    .map(([key, values]) => ({ key, values: uniqueLabels(values) }))
    .filter((entry) => cleanLabel(entry.key) && entry.values.length > 0)
}

export function serializeClassificationOrderForStorage(order = {}) {
  const normalized = normalizeClassificationOrder(order)
  return {
    schemaVersion: 2,
    topCategories: normalized.topCategories,
    subjectsEntries: orderMapToEntries(normalized.subjects),
    partsEntries: orderMapToEntries(normalized.parts),
  }
}

export function isStoredClassificationOrderPayload(value = {}) {
  return !!(value && typeof value === 'object' && (value.subjectsEntries || value.partsEntries))
}

function addLabelToMap(map, key, label) {
  const cleanKey = cleanLabel(key)
  const cleanValue = cleanLabel(label)
  if (!cleanKey || !cleanValue) return
  if (!map.has(cleanKey)) map.set(cleanKey, [])
  map.get(cleanKey).push(cleanValue)
}

function keepExistingThenAppend(existing = [], actual = []) {
  const actualLabels = uniqueLabels(actual)
  const actualSet = new Set(actualLabels)
  const kept = uniqueLabels(existing).filter((label) => actualSet.has(label))
  const keptSet = new Set(kept)
  return [...kept, ...actualLabels.filter((label) => !keptSet.has(label))]
}

function rebuildOrderMap(existingMap = {}, actualMap = new Map()) {
  const result = {}
  actualMap.forEach((actualLabels, key) => {
    const next = keepExistingThenAppend(existingMap[key], actualLabels)
    if (next.length > 0) result[key] = next
  })
  return result
}

export function rebuildClassificationOrder(cards = [], order = {}) {
  const normalized = normalizeClassificationOrder(order)
  const topLabels = []
  const subjectLabels = new Map()
  const partLabels = new Map()

  ;(Array.isArray(cards) ? cards : []).forEach((card) => {
    const topCategory = getTopCategory(card)
    const subject = cleanLabel(card?.subject)
    const part = cleanLabel(card?.part)

    topLabels.push(topCategory)

    if (subject) {
      addLabelToMap(subjectLabels, subjectOrderKey(GLOBAL_ORDER_KEY), subject)
      addLabelToMap(subjectLabels, subjectOrderKey(topCategory), subject)
    }

    if (subject && part) {
      addLabelToMap(partLabels, partOrderKey(GLOBAL_ORDER_KEY, subject), part)
      addLabelToMap(partLabels, partOrderKey(topCategory, subject), part)
    }
  })

  return {
    topCategories: keepExistingThenAppend(normalized.topCategories, topLabels),
    subjects: rebuildOrderMap(normalized.subjects, subjectLabels),
    parts: rebuildOrderMap(normalized.parts, partLabels),
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

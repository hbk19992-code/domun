const SRS_KEY = 'card_srs'
const DAY = 86400000
export const INTERVALS = [0, 1, 3, 7, 16, 35]

export function loadSRS() {
  try {
    const raw = localStorage.getItem(SRS_KEY)
    if (raw) return JSON.parse(raw)
    const old = localStorage.getItem('card_statuses')
    if (old) {
      const oldData = JSON.parse(old)
      const now = Date.now()
      const migrated = {}
      for (const [key, status] of Object.entries(oldData)) {
        const box = status === 'known' ? 2 : status === 'unsure' ? 1 : 0
        migrated[key] = { status, box, due: now, last: now, count: 1 }
      }
      return migrated
    }
    return {}
  } catch { return {} }
}
export function saveSRS(data) { localStorage.setItem(SRS_KEY, JSON.stringify(data)) }
export function reviewEntry(prev, result) {
  const now = Date.now()
  let box = prev?.box ?? 0
  if (result === 'known') box = Math.min(5, box + 1)
  else if (result === 'unsure') box = Math.max(1, box)
  else box = 0
  const interval = INTERVALS[box]
  const due = result === 'unknown' ? now + 10 * 60 * 1000 : now + interval * DAY
  return { status: result, box, due, last: now, count: (prev?.count ?? 0) + 1 }
}
export function isDue(entry, now = Date.now()) {
  if (!entry) return false
  return entry.due <= now
}
export function dueLabel(entry, now = Date.now()) {
  if (!entry) return null
  const diff = entry.due - now
  if (diff <= 0) return '지금 복습'
  const days = Math.ceil(diff / DAY)
  if (days >= 1) return `${days}일 후`
  const hours = Math.ceil(diff / 3600000)
  if (hours >= 1) return `${hours}시간 후`
  return '곧'
}

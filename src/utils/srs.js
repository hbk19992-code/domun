// 간격반복(SRS) — 라이트너 박스 방식
// box 0~5, 박스가 높을수록 복습 간격이 길어진다

const SRS_KEY = 'card_srs'
const DAY = 86400000
// 박스별 복습 간격(일): box0=오늘, box1=1일, box2=3일 ...
export const INTERVALS = [0, 1, 3, 7, 16, 35]

export function loadSRS() {
  try {
    const raw = localStorage.getItem(SRS_KEY)
    if (raw) return JSON.parse(raw)
    // 구버전 card_statuses 데이터 마이그레이션
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

export function saveSRS(data) {
  localStorage.setItem(SRS_KEY, JSON.stringify(data))
}

// 카드를 복습한 결과로 다음 일정 계산
export function reviewEntry(prev, result) {
  const now = Date.now()
  let box = prev?.box ?? 0
  if (result === 'known')      box = Math.min(5, box + 1)
  else if (result === 'unsure') box = Math.max(1, box)
  else                          box = 0  // unknown

  const interval = INTERVALS[box]
  // 모름이면 이번 세션 안에 다시(10분 뒤), 아니면 박스 간격만큼 뒤
  const due = result === 'unknown'
    ? now + 10 * 60 * 1000
    : now + interval * DAY

  return { status: result, box, due, last: now, count: (prev?.count ?? 0) + 1 }
}

// 복습 시점이 됐는지
export function isDue(entry, now = Date.now()) {
  if (!entry) return false
  return entry.due <= now
}

// 다음 복습까지 남은 시간을 사람이 읽는 문자열로
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

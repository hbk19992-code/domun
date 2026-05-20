const SCOURT_ORIGIN = 'https://www.scourt.go.kr'
const LIST_URL = `${SCOURT_ORIGIN}/portal/news/NewsListAction.work`
const VIEW_URL = `${SCOURT_ORIGIN}/portal/news/NewsViewAction.work`
const SUPREME_VIEW_URL = `${SCOURT_ORIGIN}/supreme/news/NewsViewAction2.work`
const CACHE_MS = 30 * 60 * 1000

let listCache = null
const detailCache = new Map()

function cleanText(value) {
  return String(value ?? '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
}

function absoluteUrl(value, base = SCOURT_ORIGIN) {
  return new URL(decodeEntities(value), base).toString()
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DomunOPDS/1.0)',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(8000),
  })

  if (!response.ok) {
    throw new Error(`scourt fetch failed: ${response.status} ${url}`)
  }

  return response.text()
}

function viewUrl(seqnum) {
  return `${VIEW_URL}?gubun=4&seqnum=${encodeURIComponent(seqnum)}&type=5`
}

function fallbackReports() {
  return [
    { id: '10611', title: '2025. 9. 1. 판례공보 요약본', updated: '2025-09-01T00:00:00.000Z' },
    { id: '10571', title: '2025. 8. 15. 판례공보 요약본', updated: '2025-08-15T00:00:00.000Z' },
    { id: '10488', title: '2025. 7. 1. 판례공보 요약본', updated: '2025-07-01T00:00:00.000Z' },
    { id: '10315', title: '2025. 3. 15. 판례공보 요약본', updated: '2025-03-15T00:00:00.000Z' },
    { id: '10304', title: '2025. 3. 1. 판례공보 요약본', updated: '2025-03-01T00:00:00.000Z' },
    { id: '10266', title: '2025. 2. 1. 판례공보 요약본', updated: '2025-02-01T00:00:00.000Z' },
    { id: '9758', title: '2024. 3. 15. 판례공보 요약본', updated: '2024-03-15T00:00:00.000Z' },
    { id: '9727', title: '2024. 2. 15. 판례공보 요약본', updated: '2024-02-15T00:00:00.000Z' },
    { id: '9713', title: '2024. 1. 15. 판례공보 요약본', updated: '2024-01-15T00:00:00.000Z' },
  ].map((item) => ({
    ...item,
    summary: '대법원 판례공보 요약본 PDF',
    sourceUrl: viewUrl(item.id),
  }))
}

function parseDate(value) {
  const match = cleanText(value).match(/(\d{4})[.\-]\s*(\d{1,2})[.\-]\s*(\d{1,2})/)
  if (!match) return new Date().toISOString()
  const [, year, month, day] = match
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).toISOString()
}

function parseListItems(html) {
  const items = []
  const seen = new Set()
  const linkRe = /<a\b[^>]*href=["']([^"']*NewsViewAction\.work[^"']*seqnum=(\d+)[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi
  let match

  while ((match = linkRe.exec(html))) {
    const [, href, seqnum, inner] = match
    const title = cleanText(decodeEntities(inner))
    if (!title.includes('판례공보 요약본') || seen.has(seqnum)) continue

    seen.add(seqnum)
    items.push({
      id: seqnum,
      title,
      summary: '대법원 판례공보 요약본 PDF',
      updated: parseDate(title),
      sourceUrl: absoluteUrl(href, SCOURT_ORIGIN),
    })
  }

  return items
}

function firstPdfUrl(html, baseUrl) {
  const linkRe = /<a\b[^>]*href=["']([^"']+)["'][^>]*>[\s\S]*?\.pdf[\s\S]*?<\/a>/i
  const linkMatch = html.match(linkRe)
  if (linkMatch) return absoluteUrl(linkMatch[1], baseUrl)

  const directRe = /(?:href|src)=["']([^"']+\.pdf(?:\?[^"']*)?)["']/i
  const directMatch = html.match(directRe)
  if (directMatch) return absoluteUrl(directMatch[1], baseUrl)

  const onclickRe = /onclick=["'][^"']*(?:download|down|file)[^"']*["'][^>]*>[\s\S]*?\.pdf/i
  const onclickMatch = html.match(onclickRe)
  if (onclickMatch) {
    const hrefMatch = onclickMatch[0].match(/href=["']([^"']+)["']/i)
    if (hrefMatch) return absoluteUrl(hrefMatch[1], baseUrl)
  }

  return ''
}

function parseDetail(html, fallback) {
  const title = cleanText(html.match(/제목\s*(?:<\/[^>]+>\s*)*\|?\s*([\s\S]*?)(?:작성자|첨부파일|<\/tr>|<\/dl>)/i)?.[1]) || fallback.title
  const pdfUrl = firstPdfUrl(html, fallback.sourceUrl)
  return {
    ...fallback,
    title: title.includes('판례공보 요약본') ? title : fallback.title,
    summary: '대법원 판례공보 요약본 PDF',
    pdfUrl,
  }
}

async function loadDetail(item) {
  const cached = detailCache.get(item.id)
  if (cached && cached.expiresAt > Date.now()) return cached.item

  const urls = [
    item.sourceUrl || viewUrl(item.id),
    `${SUPREME_VIEW_URL}?gubun=4&seqnum=${encodeURIComponent(item.id)}`,
  ]

  let detail = item
  for (const url of urls) {
    try {
      const html = await fetchText(url)
      detail = parseDetail(html, { ...item, sourceUrl: url })
      if (detail.pdfUrl) break
    } catch {
      detail = { ...detail, sourceUrl: url }
    }
  }

  detailCache.set(item.id, { item: detail, expiresAt: Date.now() + CACHE_MS })
  return detail
}

async function scrapeReports() {
  const reports = []
  const seen = new Set()

  for (let pageIndex = 1; pageIndex <= 3; pageIndex += 1) {
    const url = new URL(LIST_URL)
    url.searchParams.set('gubun', '4')
    url.searchParams.set('pageIndex', String(pageIndex))
    url.searchParams.set('searchWord', '판례공보 요약본')
    url.searchParams.set('type', '5')

    const html = await fetchText(url.toString())
    parseListItems(html).forEach((item) => {
      if (seen.has(item.id)) return
      seen.add(item.id)
      reports.push(item)
    })
  }

  return reports
}

async function loadReports() {
  if (listCache && listCache.expiresAt > Date.now()) return listCache.items

  let items = []
  try {
    items = await scrapeReports()
  } catch {
    items = []
  }

  if (items.length === 0) items = fallbackReports()
  const reports = items.slice(0, 20)
  listCache = { items: reports, expiresAt: Date.now() + CACHE_MS }
  return reports
}

export async function listRecent() {
  return loadReports()
}

export async function getById(id) {
  const normalizedId = cleanText(id).replace(/\.(pdf|epub)$/i, '')
  const reports = await loadReports()
  const report = reports.find((item) => item.id === normalizedId)
  return report ? loadDetail(report) : loadDetail({ id: normalizedId, title: `판례공보 ${normalizedId}`, updated: new Date().toISOString(), summary: '대법원 판례공보 요약본 PDF', sourceUrl: viewUrl(normalizedId) })
}

const NAV_TYPE = 'application/atom+xml;profile=opds-catalog;kind=navigation'
const ACQ_TYPE = 'application/atom+xml;profile=opds-catalog;kind=acquisition'

export function navigationContentType() {
  return `${NAV_TYPE};charset=utf-8`
}

export function acquisitionContentType() {
  return `${ACQ_TYPE};charset=utf-8`
}

export function siteUrlFromRequest(req) {
  const envUrl = process.env.SITE_URL?.replace(/\/+$/, '')
  if (envUrl) return envUrl

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:5173'
  const proto = req.headers['x-forwarded-proto'] || (host.includes('localhost') ? 'http' : 'https')
  return `${proto}://${host}`.replace(/\/+$/, '')
}

export function catalogTitle() {
  return process.env.CATALOG_TITLE || '대법원 판례공보'
}

export function authorName() {
  return process.env.AUTHOR_NAME || '법원도서관'
}

export function domainFromUrl(siteUrl) {
  try {
    return new URL(siteUrl).hostname
  } catch {
    return 'domun.local'
  }
}

function xml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function absoluteBookUrl(siteUrl, id) {
  return `${siteUrl}/books/${encodeURIComponent(id)}.pdf`
}

export function requireBasicAuth(req, res) {
  const username = process.env.OPDS_USERNAME
  const password = process.env.OPDS_PASSWORD
  if (!username || !password) return true

  const expected = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
  if (req.headers.authorization === expected) return true

  res.setHeader('WWW-Authenticate', 'Basic realm="OPDS"')
  res.status(401).send('Authentication required')
  return false
}

export function buildRootFeed({ siteUrl, updated = new Date().toISOString() }) {
  const domain = domainFromUrl(siteUrl)
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>${xml(siteUrl)}/opds</id>
  <title>${xml(catalogTitle())}</title>
  <updated>${xml(updated)}</updated>
  <link rel="self" href="${xml(siteUrl)}/opds"
        type="${NAV_TYPE}"/>
  <link rel="start" href="${xml(siteUrl)}/opds"
        type="${NAV_TYPE}"/>

  <entry>
    <id>tag:${xml(domain)},2026:recent</id>
    <title>최근 항목</title>
    <updated>${xml(updated)}</updated>
    <link rel="subsection" href="${xml(siteUrl)}/opds/recent"
          type="${ACQ_TYPE}"/>
  </entry>
</feed>`
}

export function buildRecentFeed({ siteUrl, books, updated = new Date().toISOString() }) {
  const domain = domainFromUrl(siteUrl)
  const entries = books.map((book) => `  <entry>
    <id>tag:${xml(domain)},2026:${xml(book.id)}</id>
    <title>${xml(book.title)}</title>
    <author><name>${xml(authorName())}</name></author>
    <updated>${xml(book.updated || updated)}</updated>
    <summary>${xml(book.summary || book.title)}</summary>
    <dc:language xmlns:dc="http://purl.org/dc/terms/">ko</dc:language>
    <link rel="http://opds-spec.org/acquisition"
          href="${xml(absoluteBookUrl(siteUrl, book.id))}"
          type="application/pdf"/>
  </entry>`).join('\n\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"
      xmlns:opds="http://opds-spec.org/2010/catalog"
      xmlns:dc="http://purl.org/dc/terms/">
  <id>${xml(siteUrl)}/opds/recent</id>
  <title>${xml(catalogTitle())} - 최근 항목</title>
  <updated>${xml(updated)}</updated>
  <link rel="self" href="${xml(siteUrl)}/opds/recent"
        type="${ACQ_TYPE}"/>
  <link rel="start" href="${xml(siteUrl)}/opds"
        type="${NAV_TYPE}"/>
${entries ? `\n${entries}\n` : ''}
</feed>`
}

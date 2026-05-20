const textEncoder = new TextEncoder()

function todayStamp() {
  return new Date().toISOString().slice(0, 10)
}

function cleanText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim()
}

function isQACard(card) {
  return !cleanText(card.mnemonic) && cleanText(card.answer)
}

function normalizeCards(cards) {
  return (Array.isArray(cards) ? cards : [])
    .filter((card) => cleanText(card.question))
    .map((card) => ({
      subject: cleanText(card.subject) || '미분류',
      part: cleanText(card.part) || '기본',
      question: cleanText(card.question),
      mnemonic: cleanText(card.mnemonic),
      detail: cleanText(card.detail),
      answer: cleanText(card.answer),
    }))
}

function groupCards(cards) {
  const groups = []
  const index = new Map()

  cards.forEach((card) => {
    const key = `${card.subject}\u0000${card.part}`
    if (!index.has(key)) {
      index.set(key, groups.length)
      groups.push({ subject: card.subject, part: card.part, cards: [] })
    }
    groups[index.get(key)].cards.push(card)
  })

  return groups
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function txtForCards(cards) {
  const normalized = normalizeCards(cards)
  const lines = [
    '두문자 카드',
    `생성일: ${todayStamp()}`,
    `카드 수: ${normalized.length}`,
    '',
  ]

  groupCards(normalized).forEach((group) => {
    lines.push(`[${group.subject} / ${group.part}]`, '')
    group.cards.forEach((card, idx) => {
      lines.push(`${idx + 1}. ${card.question}`)
      if (isQACard(card)) {
        lines.push(`정답: ${card.answer}`)
      } else {
        lines.push(`두문자: ${card.mnemonic || '-'}`)
        if (card.detail) lines.push(`풀이: ${card.detail}`)
      }
      lines.push('')
    })
  })

  return lines.join('\n')
}

function escapeXml(value) {
  return cleanText(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function paragraphHtml(value) {
  const text = cleanText(value)
  if (!text) return ''
  return text.split(/\n{2,}/).map((paragraph) => (
    `<p>${paragraph.split('\n').map(escapeXml).join('<br/>')}</p>`
  )).join('\n')
}

function cardsXhtml(cards) {
  const normalized = normalizeCards(cards)
  const sections = groupCards(normalized).map((group) => {
    const articles = group.cards.map((card, idx) => {
      const answer = isQACard(card)
        ? `<div class="answer"><span>정답</span>${paragraphHtml(card.answer)}</div>`
        : [
            `<p class="mnemonic"><span>두문자</span>${escapeXml(card.mnemonic || '-')}</p>`,
            card.detail ? `<div class="detail"><span>풀이</span>${paragraphHtml(card.detail)}</div>` : '',
          ].join('\n')

      return `
        <article class="card">
          <p class="number">${idx + 1}</p>
          <h3>${escapeXml(card.question)}</h3>
          ${answer}
        </article>
      `
    }).join('\n')

    return `
      <section>
        <h2>${escapeXml(group.subject)} / ${escapeXml(group.part)}</h2>
        ${articles}
      </section>
    `
  }).join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="ko" lang="ko">
<head>
  <title>두문자 카드</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <h1>두문자 카드</h1>
  <p class="meta">${normalized.length}개 카드 · ${todayStamp()}</p>
  ${sections || '<p>내보낼 카드가 없습니다.</p>'}
</body>
</html>`
}

function navXhtml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ko" lang="ko">
<head><title>목차</title></head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>목차</h1>
    <ol>
      <li><a href="cards.xhtml">두문자 카드</a></li>
    </ol>
  </nav>
</body>
</html>`
}

function packageOpf(id, modified) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${id}</dc:identifier>
    <dc:title>두문자 카드</dc:title>
    <dc:language>ko</dc:language>
    <dc:creator>두문자 카드</dc:creator>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="styles" href="styles.css" media-type="text/css"/>
    <item id="cards" href="cards.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine>
    <itemref idref="cards"/>
  </spine>
</package>`
}

const stylesCss = `
body {
  color: #000;
  font-family: serif;
  line-height: 1.55;
  margin: 0;
  padding: 0.4em 0.7em;
}
h1 {
  font-size: 1.35em;
  margin: 0.2em 0 0.15em;
}
h2 {
  border-bottom: 1px solid #000;
  font-size: 1.08em;
  margin: 1.15em 0 0.75em;
  padding-bottom: 0.25em;
}
h3 {
  font-size: 1em;
  margin: 0;
}
p {
  margin: 0.25em 0;
}
.meta,
.number {
  color: #555;
  font-size: 0.8em;
}
.card {
  border-bottom: 1px solid #999;
  margin: 0 0 0.9em;
  padding: 0 0 0.75em;
  page-break-inside: avoid;
}
.mnemonic {
  font-size: 1.18em;
  font-weight: bold;
  margin-top: 0.45em;
}
.answer,
.detail {
  margin-top: 0.45em;
}
span {
  display: block;
  font-size: 0.78em;
  font-weight: bold;
  margin-bottom: 0.15em;
}
`

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < table.length; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(bytes) {
  let crc = -1
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[i]) & 0xff]
  }
  return (crc ^ -1) >>> 0
}

function dosDateTime(date) {
  const year = Math.max(date.getFullYear(), 1980)
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()
  return { time, day }
}

function uint8(size, writer) {
  const bytes = new Uint8Array(size)
  const view = new DataView(bytes.buffer)
  writer(view)
  return bytes
}

function concatBytes(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0)
  const out = new Uint8Array(size)
  let offset = 0
  parts.forEach((part) => {
    out.set(part, offset)
    offset += part.length
  })
  return out
}

function createStoredZip(files) {
  const now = new Date()
  const { time, day } = dosDateTime(now)
  const localParts = []
  const centralParts = []
  let offset = 0

  files.forEach((file) => {
    const nameBytes = textEncoder.encode(file.name)
    const data = file.bytes
    const crc = crc32(data)
    const localOffset = offset

    const localHeader = uint8(30, (view) => {
      view.setUint32(0, 0x04034b50, true)
      view.setUint16(4, 20, true)
      view.setUint16(6, 0, true)
      view.setUint16(8, 0, true)
      view.setUint16(10, time, true)
      view.setUint16(12, day, true)
      view.setUint32(14, crc, true)
      view.setUint32(18, data.length, true)
      view.setUint32(22, data.length, true)
      view.setUint16(26, nameBytes.length, true)
      view.setUint16(28, 0, true)
    })

    localParts.push(localHeader, nameBytes, data)
    offset += localHeader.length + nameBytes.length + data.length

    const centralHeader = uint8(46, (view) => {
      view.setUint32(0, 0x02014b50, true)
      view.setUint16(4, 20, true)
      view.setUint16(6, 20, true)
      view.setUint16(8, 0, true)
      view.setUint16(10, 0, true)
      view.setUint16(12, time, true)
      view.setUint16(14, day, true)
      view.setUint32(16, crc, true)
      view.setUint32(20, data.length, true)
      view.setUint32(24, data.length, true)
      view.setUint16(28, nameBytes.length, true)
      view.setUint16(30, 0, true)
      view.setUint16(32, 0, true)
      view.setUint16(34, 0, true)
      view.setUint16(36, 0, true)
      view.setUint32(38, 0, true)
      view.setUint32(42, localOffset, true)
    })

    centralParts.push(centralHeader, nameBytes)
  })

  const centralStart = offset
  const central = concatBytes(centralParts)
  const endRecord = uint8(22, (view) => {
    view.setUint32(0, 0x06054b50, true)
    view.setUint16(4, 0, true)
    view.setUint16(6, 0, true)
    view.setUint16(8, files.length, true)
    view.setUint16(10, files.length, true)
    view.setUint32(12, central.length, true)
    view.setUint32(16, centralStart, true)
    view.setUint16(20, 0, true)
  })

  return concatBytes([...localParts, central, endRecord])
}

export function exportX4Txt(cards) {
  const text = txtForCards(cards)
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  downloadBlob(blob, `domun_x4_cards_${todayStamp()}.txt`)
}

export function exportX4Epub(cards) {
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
  const randomId = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
  const id = `urn:uuid:${randomId}`
  const files = [
    { name: 'mimetype', bytes: textEncoder.encode('application/epub+zip') },
    { name: 'META-INF/container.xml', bytes: textEncoder.encode(`<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/package.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`) },
    { name: 'OEBPS/package.opf', bytes: textEncoder.encode(packageOpf(id, modified)) },
    { name: 'OEBPS/nav.xhtml', bytes: textEncoder.encode(navXhtml()) },
    { name: 'OEBPS/styles.css', bytes: textEncoder.encode(stylesCss) },
    { name: 'OEBPS/cards.xhtml', bytes: textEncoder.encode(cardsXhtml(cards)) },
  ]

  const zip = createStoredZip(files)
  const blob = new Blob([zip], { type: 'application/epub+zip' })
  downloadBlob(blob, `domun_x4_cards_${todayStamp()}.epub`)
}

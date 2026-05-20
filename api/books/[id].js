import { getById } from '../../lib/content.js'
import { requireBasicAuth } from '../../lib/opds.js'

function cleanText(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').trim()
}

function contentDispositionForPdf(title) {
  const filename = `${cleanText(title) || 'supreme-court-report'}.pdf`
  const asciiFallback = filename.replace(/[^\x20-\x7E]+/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`
}

export default async function handler(req, res) {
  if (!requireBasicAuth(req, res)) return

  try {
    const rawId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id
    const report = await getById(rawId)

    if (!report?.pdfUrl) {
      res.status(404).send('PDF not found')
      return
    }

    const pdfResponse = await fetch(report.pdfUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DomunOPDS/1.0)',
        Accept: 'application/pdf,*/*;q=0.8',
        Referer: report.sourceUrl || 'https://www.scourt.go.kr/',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!pdfResponse.ok) {
      res.status(pdfResponse.status).send('Failed to download PDF')
      return
    }

    const pdf = Buffer.from(await pdfResponse.arrayBuffer())
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', contentDispositionForPdf(report.title))
    res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=86400')
    res.status(200).send(pdf)
  } catch (error) {
    console.error('Supreme Court PDF proxy failed:', error)
    res.status(500).send('Failed to proxy PDF')
  }
}

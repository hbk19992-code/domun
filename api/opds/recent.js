import { listRecent } from '../../lib/content.js'
import { acquisitionContentType, buildRecentFeed, requireBasicAuth, siteUrlFromRequest } from '../../lib/opds.js'

export default async function handler(req, res) {
  if (!requireBasicAuth(req, res)) return

  try {
    const books = await listRecent()
    res.setHeader('Content-Type', acquisitionContentType())
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400')
    res.status(200).send(buildRecentFeed({ siteUrl: siteUrlFromRequest(req), books }))
  } catch (error) {
    console.error('OPDS recent feed failed:', error)
    res.status(500).send('Failed to read OPDS content')
  }
}

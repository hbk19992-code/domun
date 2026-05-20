import { buildRootFeed, navigationContentType, requireBasicAuth, siteUrlFromRequest } from '../lib/opds.js'

export default function handler(req, res) {
  if (!requireBasicAuth(req, res)) return

  res.setHeader('Content-Type', navigationContentType())
  res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=86400')
  res.status(200).send(buildRootFeed({ siteUrl: siteUrlFromRequest(req) }))
}

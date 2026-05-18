async function compress(str) {
  try {
    const stream = new CompressionStream('deflate-raw')
    const writer = stream.writable.getWriter()
    writer.write(new TextEncoder().encode(str))
    writer.close()
    const buf = await new Response(stream.readable).arrayBuffer()
    return btoa(String.fromCharCode(...new Uint8Array(buf)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  } catch {
    return btoa(encodeURIComponent(str))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  }
}
async function decompress(b64) {
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice((b64.length * 3) % 4 || 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length).map((_, i) => binary.charCodeAt(i))
  try {
    const stream = new DecompressionStream('deflate-raw')
    const writer = stream.writable.getWriter()
    writer.write(bytes)
    writer.close()
    const buf = await new Response(stream.readable).arrayBuffer()
    return new TextDecoder().decode(buf)
  } catch {
    return decodeURIComponent(atob(padded))
  }
}
export async function encodeCards(cards) { return compress(JSON.stringify(cards)) }
export async function decodeCards(encoded) { return JSON.parse(await decompress(encoded)) }
export function buildShareUrl(encoded) {
  return `${window.location.origin + window.location.pathname}#s=${encoded}`
}
export function getShareParam() {
  const m = window.location.hash.match(/^#s=(.+)$/)
  return m ? m[1] : null
}
export function clearShareParam() {
  history.replaceState(null, '', window.location.pathname)
}

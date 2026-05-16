// URL 해시에 카드 데이터를 압축해서 넣고 꺼내는 유틸

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
    // 구형 브라우저 fallback
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

export async function encodeCards(cards) {
  const json = JSON.stringify(cards)
  const encoded = await compress(json)
  return encoded
}

export async function decodeCards(encoded) {
  const json = await decompress(encoded)
  return JSON.parse(json)
}

export function buildShareUrl(encoded) {
  const base = window.location.origin + window.location.pathname
  return `${base}#s=${encoded}`
}

export function getShareParam() {
  const hash = window.location.hash
  const match = hash.match(/^#s=(.+)$/)
  return match ? match[1] : null
}

export function clearShareParam() {
  history.replaceState(null, '', window.location.pathname)
}

// URL 공유용 인코더/디코더.
// CompressionStream/DecompressionStream을 우선 사용하고, 미지원 브라우저는
// encodeURIComponent + btoa 조합으로 폴백한다.
// (이전 버전의 폴백 decode 경로에서 한국어 등 멀티바이트 문자가 깨지던 버그를 수정)

function toBase64Url(bytes) {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(b64) {
  const padLen = (4 - (b64.length % 4)) % 4
  const padded = b64.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(padLen)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

async function compress(str) {
  // 우선 deflate-raw + base64url
  try {
    if (typeof CompressionStream !== 'undefined') {
      const stream = new CompressionStream('deflate-raw')
      const writer = stream.writable.getWriter()
      writer.write(new TextEncoder().encode(str))
      writer.close()
      const buf = await new Response(stream.readable).arrayBuffer()
      return 'd1:' + toBase64Url(new Uint8Array(buf))
    }
  } catch {}

  // 폴백: UTF-8 → base64url ("u1:" 접두로 폴백임을 표시)
  const utf8 = new TextEncoder().encode(str)
  return 'u1:' + toBase64Url(utf8)
}

async function decompress(token) {
  // 접두어로 인코딩 방식 식별. 접두어가 없으면 구버전(deflate-raw)으로 가정.
  let mode = 'd1'
  let payload = token
  const colon = token.indexOf(':')
  if (colon > 0 && colon <= 3) {
    mode = token.slice(0, colon)
    payload = token.slice(colon + 1)
  }

  const bytes = fromBase64Url(payload)

  if (mode === 'u1') {
    return new TextDecoder().decode(bytes)
  }

  // d1 (또는 구버전 무접두): deflate-raw
  if (typeof DecompressionStream !== 'undefined') {
    const stream = new DecompressionStream('deflate-raw')
    const writer = stream.writable.getWriter()
    writer.write(bytes)
    writer.close()
    const buf = await new Response(stream.readable).arrayBuffer()
    return new TextDecoder().decode(buf)
  }

  // DecompressionStream을 못 쓰는 환경에서 deflate-raw 토큰을 만났을 때:
  // 직접 풀 방법이 없으므로 사용자에게 알리도록 throw.
  throw new Error('현재 브라우저에서 압축된 공유 링크를 풀 수 없습니다.')
}

export async function encodeCards(cards) {
  return compress(JSON.stringify(cards))
}

export async function decodeCards(encoded) {
  return JSON.parse(await decompress(encoded))
}

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

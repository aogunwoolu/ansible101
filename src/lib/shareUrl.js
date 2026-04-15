/**
 * shareUrl.js
 * Encode/decode app state (YAML + mock facts) to/from URL hash
 * using LZ-string compression for compact, shareable URLs.
 *
 * Hash format: #lz:<lzbase64>
 * Legacy fallback: plain base64 without prefix for backwards compat.
 */
import LZString from 'lz-string'

const PREFIX = 'lz:'

export function encodeState(yaml, facts) {
  try {
    const payload = JSON.stringify({ yaml, facts })
    return PREFIX + LZString.compressToEncodedURIComponent(payload)
  } catch {
    return ''
  }
}

export function decodeState(hash) {
  if (!hash) return null
  try {
    if (hash.startsWith(PREFIX)) {
      const raw = LZString.decompressFromEncodedURIComponent(hash.slice(PREFIX.length))
      if (!raw) return null
      return JSON.parse(raw)
    }
    // Legacy plain-base64 (yaml-only)
    const yaml = decodeURIComponent(escape(atob(hash)))
    return { yaml, facts: null }
  } catch {
    return null
  }
}

/** @deprecated use encodeState/decodeState — kept for API compat */
export function encodeYaml(yaml) {
  try { return btoa(unescape(encodeURIComponent(yaml))) } catch { return '' }
}
export function decodeYaml(b64) {
  try { return decodeURIComponent(escape(atob(b64))) } catch { return null }
}

/**
 * Write YAML + facts into window.location.hash (compressed).
 */
export function pushToUrl(yaml, facts) {
  const encoded = encodeState(yaml, facts)
  window.history.replaceState(null, '', `#${encoded}`)
}

/**
 * Read state from URL hash on page load.
 * Returns { yaml, facts } or null.
 */
export function loadFromUrl() {
  const hash = window.location.hash.slice(1)
  if (!hash) return null
  return decodeState(hash)
}

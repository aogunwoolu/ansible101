/**
 * shareUrl.js
 * Persistence + sharing for app state (YAML + mock facts + project files).
 *
 * Two concerns, deliberately decoupled so the address bar stays clean:
 *   - PERSISTENCE: `persistState` auto-saves to localStorage on every edit.
 *     Nothing is written to the URL, so the address bar isn't cluttered with a
 *     giant hash while you work. `loadFromUrl` restores it on the next visit.
 *   - SHARING: `buildShareUrl` encodes the state into a `#d:` link *on demand*
 *     (when the user clicks Share) and returns the string to copy. The encoded
 *     hash only ever appears in a deliberately-shared URL, never during editing.
 *
 * Encoded share-hash formats (decoded on load for back-compat):
 *   - v3 (default): #d:<base64url(deflate(json-compact))>
 *   - v2: #z:<base64url(lz-uint8(json-compact))>
 *   - v1: #lz:<lz-uri-encoded-json>
 *   - legacy: #<plain-base64-yaml>
 */
import { deflateSync, inflateSync, strFromU8, strToU8 } from 'fflate'
import LZString from 'lz-string'

const V3_PREFIX = 'd:'
const V2_PREFIX = 'z:'
const V1_PREFIX = 'lz:'

function isObject(value) {
  return value !== null && typeof value === 'object'
}

function bytesToBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCodePoint(byte)
  return btoa(binary)
}

function base64ToBytes(base64) {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.codePointAt(i) ?? 0
  return out
}

function utf8ToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text))
}

function base64ToUtf8(base64) {
  return new TextDecoder().decode(base64ToBytes(base64))
}

function toBase64Url(bytes) {
  let out = bytesToBase64(bytes)
    .replaceAll('+', '-')
    .replaceAll('/', '_')

  while (out.endsWith('=')) out = out.slice(0, -1)
  return out
}

function fromBase64Url(base64url) {
  const padded = base64url
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(base64url.length / 4) * 4, '=')
  return base64ToBytes(padded)
}

function compactExtraFiles(extraFiles) {
  if (!Array.isArray(extraFiles) || extraFiles.length === 0) return undefined
  return extraFiles
    .filter((f) => f && typeof f.name === 'string')
    .map((f) => ({ n: f.name, c: typeof f.content === 'string' ? f.content : '' }))
}

function expandExtraFiles(compactFiles) {
  if (!Array.isArray(compactFiles)) return []
  return compactFiles
    .filter((f) => f && typeof f.n === 'string')
    .map((f) => ({ name: f.n, content: typeof f.c === 'string' ? f.c : '' }))
}

function compactLimits(limits) {
  if (!limits || typeof limits !== 'object') return undefined
  const out = {}
  if (limits.inventory && typeof limits.inventory === 'object') out.i = limits.inventory
  if (limits.hostvars && typeof limits.hostvars === 'object') out.h = limits.hostvars
  if (typeof limits.limit === 'string' && limits.limit) out.l = limits.limit
  return Object.keys(out).length ? out : undefined
}

function expandLimits(compact) {
  if (!compact || typeof compact !== 'object') return null
  return {
    inventory: compact.i && typeof compact.i === 'object' ? compact.i : {},
    hostvars: compact.h && typeof compact.h === 'object' ? compact.h : {},
    limit: typeof compact.l === 'string' ? compact.l : '',
  }
}

function compactState(yaml, facts, extraFiles = [], meta = {}) {
  const out = {}
  if (typeof yaml === 'string' && yaml.length > 0) out.y = yaml
  if (facts && typeof facts === 'object' && Object.keys(facts).length > 0) out.f = facts

  const files = compactExtraFiles(extraFiles)
  if (files?.length) out.x = files

  if (typeof meta.mode === 'string' && meta.mode) out.m = meta.mode
  const limits = compactLimits(meta.limits)
  if (limits) out.l = limits

  return out
}

function expandState(parsed) {
  if (!isObject(parsed)) return null

  const isCompact = 'y' in parsed || 'f' in parsed || 'x' in parsed || 'm' in parsed || 'l' in parsed
  if (isCompact) {
    const out = {
      yaml: typeof parsed.y === 'string' ? parsed.y : '',
      facts: isObject(parsed.f) ? parsed.f : null,
      extraFiles: expandExtraFiles(parsed.x),
    }
    if (typeof parsed.m === 'string') out.mode = parsed.m
    if (parsed.l) out.limits = expandLimits(parsed.l)
    return out
  }

  const out = {
    yaml: typeof parsed.yaml === 'string' ? parsed.yaml : '',
    facts: isObject(parsed.facts) ? parsed.facts : null,
    extraFiles: Array.isArray(parsed.extraFiles) ? parsed.extraFiles : [],
  }
  if (typeof parsed.mode === 'string') out.mode = parsed.mode
  if (parsed.limits) out.limits = parsed.limits
  return out
}

export function encodeState(yaml, facts, extraFiles = [], meta = {}) {
  try {
    const payload = JSON.stringify(compactState(yaml, facts, extraFiles, meta))
    const compressed = deflateSync(strToU8(payload), { level: 9, mem: 8 })
    return V3_PREFIX + toBase64Url(compressed)
  } catch {
    return ''
  }
}

export function decodeState(hash) {
  if (!hash) return null
  try {
    if (hash.startsWith(V3_PREFIX)) {
      const bytes = fromBase64Url(hash.slice(V3_PREFIX.length))
      const raw = strFromU8(inflateSync(bytes))
      return expandState(JSON.parse(raw))
    }

    if (hash.startsWith(V2_PREFIX)) {
      const bytes = fromBase64Url(hash.slice(V2_PREFIX.length))
      const raw = LZString.decompressFromUint8Array(bytes)
      if (!raw) return null
      return expandState(JSON.parse(raw))
    }

    if (hash.startsWith(V1_PREFIX)) {
      const raw = LZString.decompressFromEncodedURIComponent(hash.slice(V1_PREFIX.length))
      if (!raw) return null
      return expandState(JSON.parse(raw))
    }

    // Legacy plain-base64 (yaml-only)
    const yaml = base64ToUtf8(hash)
    return { yaml, facts: null, extraFiles: [] }
  } catch {
    return null
  }
}

/** @deprecated use encodeState/decodeState — kept for API compat */
export function encodeYaml(yaml) {
  try { return utf8ToBase64(yaml) } catch { return '' }
}
export function decodeYaml(b64) {
  try { return base64ToUtf8(b64) } catch { return null }
}

const LS_PROJECT = 'ansible101:project'
const LS_PREFIX = 'ls'
// A share link must carry all of its state in the URL (no server). Past this
// length browsers/servers start truncating, so we refuse to build a link and
// tell the user instead. (Persistence isn't affected — that uses localStorage.)
const MAX_HASH = 14000

/**
 * Auto-save state to this browser's localStorage. Does NOT touch the URL, so
 * the address bar stays clean while editing. Restored by `loadFromUrl`.
 */
export function persistState(yaml, facts, extraFiles = [], meta = {}) {
  try {
    const payload = JSON.stringify(compactState(yaml, facts, extraFiles, meta))
    globalThis.localStorage.setItem(LS_PROJECT, payload)
  } catch { /* storage blocked — state stays in memory only */ }
}

/**
 * Build a shareable absolute URL with the state encoded in the hash, for the
 * user to copy. Pure — does not mutate window.location.
 * Returns { url, tooLong }. When the encoded state can't fit in a practical
 * link, `url` is '' and `tooLong` is true.
 */
export function buildShareUrl(yaml, facts, extraFiles = [], meta = {}) {
  const encoded = encodeState(yaml, facts, extraFiles, meta)
  if (!encoded || `#${encoded}`.length > MAX_HASH) return { url: '', tooLong: true }
  const { origin, pathname } = globalThis.location
  return { url: `${origin}${pathname}#${encoded}`, tooLong: false }
}

function loadLocal() {
  try {
    const payload = globalThis.localStorage.getItem(LS_PROJECT)
    if (payload) return expandState(JSON.parse(payload))
  } catch { /* ignore */ }
  return null
}

/**
 * Resolve the state to hydrate on page load.
 *   1. If the URL carries an encoded share hash, decode it (someone opened a
 *      shared link). The result is flagged `fromHash` so the caller can strip
 *      the hash from the address bar and mirror it into localStorage.
 *   2. Otherwise restore the last local session from localStorage — except on
 *      the bare landing route ('/'), so first-time visitors still see the
 *      landing screen rather than being dropped into a previous session.
 * Returns { yaml, facts, extraFiles, …, fromHash? } or null.
 */
export function loadFromUrl() {
  const hash = globalThis.location.hash.slice(1)
  if (hash && hash !== LS_PREFIX) {
    const decoded = decodeState(hash)
    if (decoded) return { ...decoded, fromHash: true }
  }
  if (globalThis.location.pathname !== '/' || hash === LS_PREFIX) {
    return loadLocal()
  }
  return null
}

/**
 * useFileDrop.js
 * Returns { isDragging, dropProps } — attach dropProps to any container div.
 *
 * Preserves full relative paths so an entire Ansible project (group_vars/,
 * host_vars/, roles/<r>/defaults/main.yml, collections/…) can be dropped and
 * resolved. Handles:
 *  - a dragged folder        → recursive webkitGetAsEntry() traversal
 *  - a dragged file          → added with its name
 *  - a .zip                  → extracted; entry paths kept intact
 *  - <input webkitdirectory> → see readFolderInput()
 *
 * After collection, a single shared leading directory is stripped so
 * "myproject/group_vars/all.yml" becomes "group_vars/all.yml".
 */
import { useState, useCallback } from 'react'
import { ZipReader, BlobReader, TextWriter } from '@zip.js/zip.js'

// Extensions we treat as binary and skip. Ansible repos commonly vendor
// offline-install artifacts (rpm/deb/iso/sqlite/...) in roles/*/files/ —
// those are exactly the multi-hundred-MB blobs that make "big repo" zips
// look broken when decoded as UTF-8 text, so they need to be on this list too.
const BINARY_EXT = /\.(png|jpe?g|gif|bmp|ico|webp|svg|pdf|exe|bin|zip|tar|gz|tgz|bz2|xz|zst|lz4|rar|7z|mp[34]|wav|avi|mov|mkv|ttf|woff2?|eot|otf|so|dylib|dll|class|pyc|rpm|deb|jar|war|ear|whl|iso|img|vmdk|vdi|qcow2?|ova|sqlite3?|db|msi|pkg|dmg|appimage|snap)$/i

// Anything bigger than this isn't realistic Ansible source (YAML/INI/Jinja2) —
// treat it as an opaque artifact instead of decoding it as text, which is what
// was hanging/crashing the tab on large vendored repos.
const MAX_TEXT_FILE_BYTES = 5 * 1024 * 1024

function isBinary(name) { return BINARY_EXT.test(name) }
function isTooLarge(size) { return typeof size === 'number' && size > MAX_TEXT_FILE_BYTES }

// OS/archive cruft we never want in the virtual file tree
function isJunk(path) {
  if (path.includes('__MACOSX')) return true
  return path.split('/').some((seg) => seg === '.DS_Store' || seg === 'Thumbs.db')
}

/**
 * Recursively read a webkit FileSystemEntry into {name, content}[] with full
 * relative paths. Resolves to [] for binary/junk/unreadable entries.
 */
function readEntry(entry, prefix = '') {
  return new Promise((resolve) => {
    if (!entry) { resolve([]); return }

    if (entry.isFile) {
      const fullPath = prefix + entry.name
      if (isBinary(fullPath) || isJunk(fullPath)) { resolve([]); return }
      entry.file(
        (file) => {
          if (isTooLarge(file.size)) { resolve([]); return }
          file.text()
            .then((content) => resolve([{ name: fullPath, content }]))
            .catch(() => resolve([]))
        },
        () => resolve([]),
      )
      return
    }

    if (entry.isDirectory) {
      const reader = entry.createReader()
      const collected = []
      // readEntries returns at most ~100 entries per call — loop until empty.
      const readBatch = () => {
        reader.readEntries(
          (entries) => {
            if (entries.length === 0) {
              Promise.all(collected.map((e) => readEntry(e, `${prefix}${entry.name}/`)))
                .then((arrs) => resolve(arrs.flat()))
              return
            }
            collected.push(...entries)
            readBatch()
          },
          () => resolve([]),
        )
      }
      readBatch()
      return
    }

    resolve([])
  })
}

export async function readZip(file) {
  const out = []
  // zip.js (not jszip) — jszip's zip64 offset parsing breaks once a zip's
  // payload crosses 4GB (common for Ansible repos vendoring offline-install
  // artifacts), silently landing reads in the wrong place and throwing
  // "Corrupted zip" even on perfectly valid archives.
  const reader = new ZipReader(new BlobReader(file))
  try {
    const entries = await reader.getEntries()
    for (const entry of entries) {
      if (entry.directory || isBinary(entry.filename) || isJunk(entry.filename)) continue
      if (isTooLarge(entry.uncompressedSize)) continue
      const content = await entry.getData(new TextWriter())
      if (entry.filename) out.push({ name: entry.filename, content }) // keep full path
    }
  } catch (err) {
    // Surface the failure so callers can tell "empty zip" apart from
    // "extraction blew up" — large/corrupt archives were previously silent.
    console.error('readZip failed:', err)
    throw err
  } finally {
    await reader.close()
  }
  return out
}

/**
 * Strip a single shared leading directory when EVERY file shares it.
 * Leaves multi-root drops (group_vars/ + roles/ side by side) untouched.
 */
export function stripCommonRoot(files) {
  if (files.length < 2) return files
  const firstSeg = files[0].name.split('/')[0]
  if (!firstSeg || firstSeg === files[0].name) return files // no dir component
  const allShare = files.every((f) => f.name.startsWith(`${firstSeg}/`))
  if (!allShare) return files
  return files.map((f) => ({ ...f, name: f.name.slice(firstSeg.length + 1) }))
}

/**
 * Extract {name, content}[] from a DataTransfer (folder entries, files, or zips),
 * preserving full relative paths with the shared root stripped.
 *
 * IMPORTANT: reads dataTransfer.items / webkitGetAsEntry SYNCHRONOUSLY (before the
 * first await) — the DataTransfer is emptied once the drop handler returns.
 */
export async function readDataTransferFiles(dataTransfer) {
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : []
  const entries = items
    .filter((it) => it.kind === 'file' && typeof it.webkitGetAsEntry === 'function')
    .map((it) => it.webkitGetAsEntry())
    .filter(Boolean)
  const plainFiles = Array.from(dataTransfer.files || [])

  let results = []
  if (entries.length > 0) {
    // Entry traversal preserves folder structure. Zips read as binary here
    // (skipped) — handle them separately from the plain file list below.
    const arrs = await Promise.all(entries.map((en) => readEntry(en)))
    results = arrs.flat()
    for (const f of plainFiles) {
      if (f.name.toLowerCase().endsWith('.zip')) results.push(...await readZip(f))
    }
  } else {
    for (const f of plainFiles) {
      if (f.name.toLowerCase().endsWith('.zip')) results.push(...await readZip(f))
      else if (!isBinary(f.name) && !isJunk(f.name) && !isTooLarge(f.size)) {
        results.push({ name: f.name, content: await f.text() })
      }
    }
  }
  return stripCommonRoot(results.filter((r) => r.name))
}

/**
 * @param {(files: Array<{name:string, content:string}>) => void} onFiles
 */
export function useFileDrop(onFiles) {
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState(null)

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e) => {
    // only clear when actually leaving the drop target (not a child)
    if (!e.currentTarget.contains(e.relatedTarget)) setIsDragging(false)
  }, [])

  const onDrop = useCallback(async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    setError(null)
    setIsProcessing(true)
    try {
      const results = await readDataTransferFiles(e.dataTransfer)
      if (results.length > 0) onFiles(results)
      else setError('No readable files found — check the archive isn\'t corrupt or empty.')
    } catch (err) {
      setError(`Couldn't read that drop: ${err.message || err}`)
    } finally {
      setIsProcessing(false)
    }
  }, [onFiles])

  return {
    isDragging,
    isProcessing,
    error,
    dropProps: { onDragOver, onDragLeave, onDrop },
  }
}

/**
 * Read a FileList from <input type="file" webkitdirectory> into
 * {name, content}[] using webkitRelativePath, with the shared root stripped.
 */
export async function readFolderInput(fileList) {
  const files = Array.from(fileList || [])
  const out = []
  for (const f of files) {
    const path = f.webkitRelativePath || f.name
    if (isBinary(path) || isJunk(path) || isTooLarge(f.size)) continue
    out.push({ name: path, content: await f.text() })
  }
  return stripCommonRoot(out)
}

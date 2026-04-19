/**
 * useFileDrop.js
 * Returns { isDragging, dropProps } — attach dropProps to any container div.
 * Handles:
 *  - any text file  → added as a single extra file
 *  - .zip           → extracted; every text entry added as an extra file
 */
import { useState, useCallback } from 'react'
import JSZip from 'jszip'

// Extensions we treat as binary and skip when extracting zips
const BINARY_EXT = /\.(png|jpe?g|gif|bmp|ico|webp|pdf|exe|bin|zip|tar|gz|bz2|rar|7z|mp[34]|wav|avi|mov|mkv|ttf|woff2?|eot|otf|so|dylib|dll|class|pyc)$/i

function isBinary(name) { return BINARY_EXT.test(name) }

/**
 * @param {(files: Array<{name:string, content:string}>) => void} onFiles
 */
export function useFileDrop(onFiles) {
  const [isDragging, setIsDragging] = useState(false)

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

    const items = Array.from(e.dataTransfer.files)
    const results = []

    for (const file of items) {
      if (file.name.endsWith('.zip')) {
        try {
          const zip = await JSZip.loadAsync(file)
          const entries = Object.values(zip.files).filter(
            (f) => !f.dir && !isBinary(f.name) && !f.name.includes('__MACOSX'),
          )
          for (const entry of entries) {
            const content = await entry.async('string')
            // Strip single leading folder component
            // e.g. "my-project/scripts/deploy.sh" → "scripts/deploy.sh"
            const segments = entry.name.split('/')
            const name = segments.length > 1 ? segments.slice(1).join('/') : entry.name
            if (name) results.push({ name, content })
          }
        } catch {
          // ignore corrupt zips
        }
      } else if (!isBinary(file.name)) {
        const content = await file.text()
        results.push({ name: file.name, content })
      }
    }

    if (results.length > 0) onFiles(results)
  }, [onFiles])

  return {
    isDragging,
    dropProps: { onDragOver, onDragLeave, onDrop },
  }
}

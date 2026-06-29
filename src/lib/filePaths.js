/**
 * filePaths.js
 * Shared validation for the file tree's rename / new-file / new-folder
 * inputs — used both for inline UI feedback and as a defensive guard in
 * App.jsx's handlers.
 */

/**
 * A relative path is safe if it's non-empty, has no leading/trailing slash,
 * no empty/`.`/`..` segments, and uses forward slashes only.
 */
export function isValidRelativePath(path) {
  if (typeof path !== 'string') return false
  const trimmed = path.trim()
  if (!trimmed) return false
  if (trimmed.includes('\\')) return false
  if (trimmed.startsWith('/') || trimmed.endsWith('/')) return false
  const segs = trimmed.split('/')
  return segs.every((s) => s.length > 0 && s !== '.' && s !== '..')
}

/** True if `path` is already used by another file (or the main buffer). */
export function pathCollides(path, files, mainPath, excludeId) {
  if (mainPath && path === mainPath) return true
  return files.some((f) => f.id !== excludeId && f.name === path)
}

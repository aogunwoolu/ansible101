/**
 * YamlEditor.jsx
 * Monaco-powered YAML editor with sync-highlight support.
 */
import React, { useRef, useEffect, useCallback } from 'react'
import MonacoEditor from '@monaco-editor/react'

const CYBER_THEME_NAME = 'cyber-blueprint'

function defineCyberTheme(monaco) {
  monaco.editor.defineTheme(CYBER_THEME_NAME, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'key',            foreground: '22d3ee', fontStyle: 'bold' },
      { token: 'string',         foreground: 'a5f3fc' },
      { token: 'number',         foreground: 'fbbf24' },
      { token: 'comment',        foreground: '475569', fontStyle: 'italic' },
      { token: 'keyword',        foreground: 'f472b6' },
      { token: 'type',           foreground: '818cf8' },
    ],
    colors: {
      'editor.background':           '#0f172a',
      'editor.foreground':           '#f8fafc',
      'editorLineNumber.foreground': '#475569',
      'editorLineNumber.activeForeground': '#22d3ee',
      'editor.lineHighlightBackground': '#1e293b',
      'editor.selectionBackground': '#1e3a5f',
      'editorCursor.foreground': '#22d3ee',
      'editorWidget.background': '#1e293b',
      'editorSuggestWidget.background': '#1e293b',
      'editorSuggestWidget.border': '#334155',
      'scrollbar.shadow': '#0f172a',
      'scrollbarSlider.background': '#334155',
      'scrollbarSlider.hoverBackground': '#475569',
    },
  })
}

export default function YamlEditor({ value, onChange, highlightLines }) {
  const editorRef = useRef(null)
  const decorationsRef = useRef([])

  // Apply line highlights when highlightLines prop changes
  useEffect(() => {
    const editor = editorRef.current
    if (!editor || !highlightLines) return

    const { start, end } = highlightLines
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
        range: new window.monaco.Range(start, 1, end || start, 1),
        options: {
          isWholeLine: true,
          className: 'bg-cyan-900/40',
          glyphMarginClassName: 'text-cyan-400',
        },
      },
    ])
    editor.revealLineInCenter(start)
  }, [highlightLines])

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    defineCyberTheme(monaco)
    monaco.editor.setTheme(CYBER_THEME_NAME)
  }, [])

  return (
    <div className="h-full w-full overflow-hidden">
      <MonacoEditor
        height="100%"
        language="yaml"
        value={value}
        onChange={onChange}
        onMount={handleEditorDidMount}
        theme={CYBER_THEME_NAME}
        options={{
          fontSize: 13,
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontLigatures: true,
          lineNumbers: 'on',
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
          automaticLayout: true,
          padding: { top: 12, bottom: 12 },
          scrollbar: {
            verticalScrollbarSize: 6,
            horizontalScrollbarSize: 6,
          },
        }}
      />
    </div>
  )
}

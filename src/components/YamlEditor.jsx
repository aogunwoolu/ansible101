/**
 * YamlEditor.jsx
 * Monaco-powered YAML editor with sync-highlight support.
 */
/* eslint-disable react/prop-types */
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

export default function YamlEditor({ value, onChange, highlightLines, language = 'yaml', parseError = null }) {
  const editorRef = useRef(null)
  const monacoRef = useRef(null)
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

  // Apply / clear error squiggles via Monaco model markers
  useEffect(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor || !monaco) return
    const model = editor.getModel()
    if (!model) return

    if (parseError) {
      const lineNum = (parseError.line ?? 0) + 1
      const maxCol = model.getLineMaxColumn(lineNum)
      monaco.editor.setModelMarkers(model, 'yaml-lint', [{
        severity: monaco.MarkerSeverity.Error,
        startLineNumber: lineNum,
        startColumn: (parseError.column ?? 0) + 1,
        endLineNumber: lineNum,
        endColumn: maxCol,
        message: parseError.message,
      }])
    } else {
      monaco.editor.setModelMarkers(model, 'yaml-lint', [])
    }
  }, [parseError])

  const handleEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor
    monacoRef.current = monaco
    defineCyberTheme(monaco)
    monaco.editor.setTheme(CYBER_THEME_NAME)
  }, [])

  return (
    <div className="h-full w-full overflow-hidden">
      <MonacoEditor
        height="100%"
        language={language}
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

import React, { useState, memo, Fragment } from 'react'
import { BotIcon, UserIcon, CopyIcon, RetryIcon } from './Icons.jsx'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import jsonLang from 'highlight.js/lib/languages/json'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import yaml from 'highlight.js/lib/languages/yaml'
import go from 'highlight.js/lib/languages/go'
import rust from 'highlight.js/lib/languages/rust'
import java from 'highlight.js/lib/languages/java'
import csharp from 'highlight.js/lib/languages/csharp'
import cpp from 'highlight.js/lib/languages/cpp'
import c from 'highlight.js/lib/languages/c'
import kotlin from 'highlight.js/lib/languages/kotlin'
import swift from 'highlight.js/lib/languages/swift'
import php from 'highlight.js/lib/languages/php'
import ruby from 'highlight.js/lib/languages/ruby'
import sql from 'highlight.js/lib/languages/sql'
import powershell from 'highlight.js/lib/languages/powershell'
import ini from 'highlight.js/lib/languages/ini'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import plaintext from 'highlight.js/lib/languages/plaintext'

// Register semua bahasa yang ingin didukung
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('json', jsonLang)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('go', go)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('java', java)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('cs', csharp)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('c', c)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('swift', swift)
hljs.registerLanguage('php', php)
hljs.registerLanguage('ruby', ruby)
hljs.registerLanguage('rb', ruby)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('powershell', powershell)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('dockerfile', dockerfile)
hljs.registerLanguage('plaintext', plaintext)

function Code({ inline, className, children, node }) {
  const raw = String(children ?? '')
  // Deteksi inline secara robust: gunakan flag inline bila ada,
  // fallback ke heuristik (tanpa className bahasa dan tanpa newline)
  const isInline = (typeof inline === 'boolean') ? inline : (!className && !raw.includes('\n'))
  if (isInline) return <code className="inline-code">{raw}</code>

  // Ekstrak bahasa dari className (e.g., "language-html")
  const match = /language-([\w-]+)/.exec(className || '')
  const language = (match?.[1]?.toLowerCase()) || 'plaintext'

  // [AUTO-DETECTION] Gunakan bahasa spesifik jika terdaftar, 
  // atau deteksi otomatis untuk SEMUA bahasa yang didukung
  let html
  let detectedLang = language
  
  try {
    if (hljs.getLanguage(language)) {
      // Bahasa terdaftar → gunakan langsung
      html = hljs.highlight(raw, { language }).value
    } else {
      // Bahasa TIDAK terdaftar → deteksi otomatis untuk SEMUA bahasa
      const res = hljs.highlightAuto(raw)
      html = res.value
      detectedLang = res.language || 'text'
    }
  } catch {
    // Fallback jika terjadi error
    html = raw.replace(/[&<>"]/g, s => ({'&':'&amp;','<':'<','>':'>','"':'&quot;'}[s]))
    detectedLang = 'text'
  }

  // Ambil metadata (filename/title)
  const meta = node?.data?.meta ? String(node.data.meta) : ''
  const fileMatch = /(?:title|filename)=(?:"([^"]+)"|'([^']+)'|([^\s]+))/.exec(meta || '')
  const fileLabel = fileMatch ? (fileMatch[1] || fileMatch[2] || fileMatch[3]) : ''

  async function onCopy() {
    try { await navigator.clipboard.writeText(raw) } catch {}
  }
  
  return (
    <div className="codeblock">
      <div className="code-header top">
        <span className="lang" title={fileLabel || detectedLang}>
          {fileLabel || detectedLang}
        </span>
        <button className="action" onClick={onCopy} title="Copy code" aria-label="Copy code">
          <CopyIcon />
        </button>
      </div>
      <div className="code-scroll">
        <pre className="code-pre">
          <code
            className={`hljs language-${detectedLang}`}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </pre>
      </div>
    </div>
  )
}

function normalizeMathDelimiters(text) {
  if (!text) return text
  // Convert \[ ... \] to $$ ... $$ (block)
  text = text.replace(/\\\[((?:.|\n)*?)\\\]/g, '\n$$$1$$\n')
  // Convert \( ... \) to $ ... $ (inline)
  text = text.replace(/\\\(((?:.|\n)*?)\\\)/g, '$$$1$')
  // Convert single-$ blocks spanning multiple lines to $$ ... $$
  text = text.replace(/(^|[^\\])\$(?!\$)([\s\S]*?)\$(?!\$)/g, (m, p1, body) => {
    return body.includes('\n') ? p1 + '$$' + body + '$$' : m
  })
  return text
}

function MessageImpl({ role, content, onCopy, onRetry }) {
  const isAssistant = role === 'assistant'
  const [showActions, setShowActions] = useState(false)
  return (
    <>
      <div className={`msg ${role}`}>
        {isAssistant ? <div className="avatar assistant"><BotIcon /></div> : <div className="spacer" />}
        <div className="bubble appear" onClick={() => setShowActions(v => !v)}>
          <div className="bubble-inner">
          <ReactMarkdown
            remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
            rehypePlugins={[rehypeKatex]}
            components={{
              a: ({ node, ...props }) => <a target="_blank" rel="noreferrer" {...props} />,
              pre: ({ children }) => <Fragment>{children}</Fragment>,
              code: Code
            }}
          >
            {normalizeMathDelimiters(content) || ''}
          </ReactMarkdown>
          </div>
        </div>
        {!isAssistant ? <div className="avatar user"><UserIcon /></div> : <div className="spacer" />}
      </div>
      {(onCopy || (onRetry && isAssistant)) && showActions && (
        <div className={`msg-actions ${role}`}>
          <div className="spacer" />
          <div className="actions">
            {onRetry && isAssistant && (
              <button className="action" onClick={onRetry} title="Regenerate" aria-label="Regenerate">
                <RetryIcon />
              </button>
            )}
            {onCopy && (
              <button className="action" onClick={onCopy} title="Copy" aria-label="Copy">
                <CopyIcon />
              </button>
            )}
          </div>
          <div className="spacer" />
        </div>
      )}
    </>
  )
}

// Memoize to avoid rerendering unchanged messages.
// Ignore function prop identity changes (onCopy/onRetry), compare by role/content.
// Penting: jangan abaikan perubahan fungsi handler.
// Sebelumnya comparator hanya melihat role/content sehingga onRetry/onCopy
// bisa membawa closure stale (mis. menangkap state loading=true) dan klik
// retry tidak bereaksi. Dengan membandingkan referensi handler, komponen
// akan rerender saat handler berubah sehingga memakai closure terbaru.
export default memo(
  MessageImpl,
  (prev, next) => (
    prev.role === next.role &&
    prev.content === next.content &&
    prev.onRetry === next.onRetry &&
    prev.onCopy === next.onCopy
  )
)

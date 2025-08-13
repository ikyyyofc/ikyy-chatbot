import React, { useEffect, useMemo, useRef, useState } from 'react'
import Message from './components/Message.jsx'

function Avatar({ kind }) {
  return (
    <div className={`avatar ${kind}`}>
      <span className="avatar-emoji">{kind === 'assistant' ? '🤖' : '🙂'}</span>
    </div>
  )
}

const initialAssistantGreeting = {
  role: 'assistant',
  content: 'Halo! Aku asisten AI. Ada yang bisa kubantu?'
}

export default function App() {
  const [messages, setMessages] = useState([initialAssistantGreeting])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const MODEL = 'gpt-5-chat-latest'
  const [controller, setController] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const menuBtnRef = useRef(null)
  const [showScrollDown, setShowScrollDown] = useState(false)
  const listRef = useRef(null)
  const bottomRef = useRef(null)
  const stickRef = useRef(true)
  const lastScrollTickRef = useRef(0)
  const textareaRef = useRef(null)

  // Track if user is near bottom; only then auto-stick
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onScroll = () => {
      const threshold = 80
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold
      stickRef.current = atBottom
      setShowScrollDown(!atBottom)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  // Auto-scroll to bottom when content updates
  useEffect(() => {
    if (!bottomRef.current) return
    if (stickRef.current) {
      const behavior = loading ? 'auto' : 'smooth'
      bottomRef.current.scrollIntoView({ behavior, block: 'end' })
    }
  }, [messages, loading])

  // While streaming, periodically issue a smooth scroll so motion feels fluid
  useEffect(() => {
    let id
    if (loading) {
      id = setInterval(() => {
        if (stickRef.current && bottomRef.current) {
          bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
        }
      }, 180)
    } else {
      if (stickRef.current && bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
      }
    }
    return () => { if (id) clearInterval(id) }
  }, [loading])

  useEffect(() => {
    document.documentElement.dataset.theme = 'dark'
  }, [])

  // Close nav menu when clicking outside or pressing Escape
  useEffect(() => {
    function onDocClick(e) {
      if (!menuOpen) return
      const t = e.target
      if (menuRef.current && menuBtnRef.current) {
        if (!menuRef.current.contains(t) && !menuBtnRef.current.contains(t)) {
          setMenuOpen(false)
        }
      }
    }
    function onKey(e) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('click', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('click', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])


  // no temperature persistence

  const canSend = useMemo(() => input.trim().length > 0 && !loading, [input, loading])

  // Auto-grow textarea
  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, Math.floor(window.innerHeight * 0.4)) + 'px'
  }, [input])

  async function sendMessage() {
    if (!canSend) return
    const userMsg = { role: 'user', content: input.trim() }
    // Add user and a placeholder assistant message
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }])
    setInput('')
    setLoading(true)
    try {
      const ac = new AbortController()
      setController(ac)
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg], model: MODEL }),
        signal: ac.signal
      })
      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let gotFirstChunk = false
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (!gotFirstChunk && chunk) gotFirstChunk = true
        setMessages(prev => {
          const copy = prev.slice()
          // last message is assistant placeholder
          const lastIndex = copy.length - 1
          const last = copy[lastIndex]
          copy[lastIndex] = { ...last, content: (last.content || '') + chunk }
          return copy
        })
        if (stickRef.current && bottomRef.current) {
          bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' })
        }
      }
    } catch (err) {
      console.error(err)
      if (err?.name !== 'AbortError') {
        setMessages(prev => {
          // Replace the placeholder only if still empty
          const copy = prev.slice()
          const lastIndex = copy.length - 1
          const last = copy[lastIndex]
          if (!last?.content) {
            copy[lastIndex] = { role: 'assistant', content: 'Maaf, terjadi kesalahan memproses permintaan.' }
          }
          return copy
        })
      }
    } finally {
      setLoading(false)
      setController(null)
    }
  }

  function stopStreaming() {
    try { controller?.abort() } catch {}
  }

  async function copyMessage(text) {
    try { await navigator.clipboard.writeText(text || '') } catch {}
  }

  async function retryResponseAtIndex(targetIndex) {
    if (loading) return
    if (targetIndex === 0) return // do not allow retry for the very first assistant message
    if (targetIndex < 0 || targetIndex >= messages.length) return
    if (messages[targetIndex]?.role !== 'assistant') return
    const lastUserIndex = messages.slice(0, targetIndex).map(m => m.role).lastIndexOf('user')
    if (lastUserIndex === -1 && targetIndex !== 0) return
    const baseHistory = lastUserIndex >= 0 ? messages.slice(0, lastUserIndex + 1) : []
    setMessages([...baseHistory, { role: 'assistant', content: '' }])
    setLoading(true)
    try {
      const ac = new AbortController()
      setController(ac)
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: baseHistory, model: MODEL }),
        signal: ac.signal
      })
      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages(prev => {
          const copy = prev.slice()
          const idx = copy.length - 1
          copy[idx] = { role: 'assistant', content: (copy[idx].content || '') + chunk }
          return copy
        })
        if (stickRef.current && bottomRef.current) {
          bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' })
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setController(null)
    }
  }

  async function retryLastResponse() {
    if (loading) return
    if (messages.length === 0) return
    // Ensure we are retrying the actual last assistant message
    const lastIndex = [...messages].map(m => m.role).lastIndexOf('assistant')
    if (lastIndex === -1) return
    if (lastIndex === 0) return // do not allow retry for greeting
    const lastUserIndex = messages.slice(0, lastIndex).map(m => m.role).lastIndexOf('user')
    if (lastUserIndex === -1 && lastIndex !== 0) return
    const baseHistory = lastUserIndex >= 0 ? messages.slice(0, lastUserIndex + 1) : []
    // Reset conversation to base history and append fresh placeholder
    setMessages([...baseHistory, { role: 'assistant', content: '' }])
    setLoading(true)
    try {
      const ac = new AbortController()
      setController(ac)
      // Build history up to and including the triggering user message
      const history = baseHistory
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history, model: MODEL }),
        signal: ac.signal
      })
      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        setMessages(prev => {
          const copy = prev.slice()
          const idx = copy.length - 1
          copy[idx] = { role: 'assistant', content: (copy[idx].content || '') + chunk }
          return copy
        })
        if (stickRef.current && bottomRef.current) {
          bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' })
        }
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
      setController(null)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function resetChat() {
    setMessages([initialAssistantGreeting])
    setInput('')
  }

  return (
    <div className={`app${loading ? ' is-loading' : ''}`}>
      <header className="header">
        <div className="brand">
          <div className="brand-title">IKYY</div>
          <div className="brand-sub"><span className="typing-text"><TypingText texts={["Asisten Virtual","AI Temanmu","Selalu Siap Bantu","Modern & Futuristik"]} loop={true} /></span><span className="caret"></span></div>
        </div>
        <div className="controls">
          {/* fixed model: gpt-5-chat-latest */}
          <button className="icon-btn reset-btn" onClick={resetChat} aria-label="Reset chat" title="Reset">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 5V2L7 7l5 5V9a5 5 0 1 1-5 5H5a7 7 0 1 0 7-7Z"/></svg>
          </button>
          <button
            className={`hamburger${menuOpen ? ' open' : ''}`}
            aria-label="Open menu"
            title="Menu"
            onClick={() => setMenuOpen(v => !v)}
            ref={menuBtnRef}
          >
            <span className="bar"></span>
            <span className="bar"></span>
            <span className="bar"></span>
          </button>
        </div>
        {menuOpen && (
          <div className="nav-menu" ref={menuRef}>
            <a href="https://wa.me/" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.52 3.5A10.5 10.5 0 0 0 3.11 17.2L2 22l4.89-1.12A10.5 10.5 0 1 0 20.52 3.5Zm-8.02 17.36a8.83 8.83 0 0 1-4.5-1.26l-.32-.19-2.9.67.62-2.83-.21-.34a8.86 8.86 0 1 1 7.31 3.95Zm4.9-6.64c-.27-.14-1.58-.78-1.83-.87s-.42-.14-.6.14c-.18.27-.69.86-.84 1.04s-.31.2-.58.07a7.21 7.21 0 0 1-2.12-1.31 7.9 7.9 0 0 1-1.46-1.81c-.15-.27 0-.42.11-.55l.32-.38c.11-.14.15-.24.22-.4s.04-.31-.02-.44c-.07-.14-.6-1.45-.82-1.98-.22-.53-.44-.46-.6-.47h-.51c-.16 0-.42.06-.64.31s-.84.82-.84 2c0 1.18.86 2.32.98 2.48.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.52.58.18 1.1.16 1.51.1.46-.07 1.58-.65 1.8-1.28.22-.63.22-1.17.15-1.28-.07-.11-.25-.18-.52-.32Z"/></svg>
              WA
            </a>
            <a href="https://instagram.com/" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5Zm0 2a3 3 0 0 0-3 3v10a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7Zm5 3.5A5.5 5.5 0 1 1 6.5 13 5.5 5.5 0 0 1 12 7.5Zm0 2A3.5 3.5 0 1 0 15.5 13 3.5 3.5 0 0 0 12 9.5Zm5.75-2.9a.85.85 0 1 1-.85.85.85.85 0 0 1 .85-.85Z"/></svg>
              IG
            </a>
            <a href="https://github.com/" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2a10 10 0 0 0-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.18-3.37-1.18a2.66 2.66 0 0 0-1.11-1.47c-.9-.61.07-.6.07-.6a2.1 2.1 0 0 1 1.53 1.03 2.13 2.13 0 0 0 2.91.83 2.14 2.14 0 0 1 .63-1.35c-2.22-.25-4.55-1.11-4.55-4.95A3.88 3.88 0 0 1 6 7.69a3.6 3.6 0 0 1 .1-2.65s.84-.27 2.75 1.02a9.44 9.44 0 0 1 5 0c1.91-1.29 2.75-1.02 2.75-1.02.37.84.41 1.8.1 2.65a3.88 3.88 0 0 1 1.03 2.69c0 3.85-2.33 4.7-4.55 4.95a2.4 2.4 0 0 1 .69 1.86v2.76c0 .26.18.58.69.48A10 10 0 0 0 12 2Z"/></svg>
              GitHub
            </a>
          </div>
        )}
      </header>

      <main ref={listRef} className="chat">
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1
          const showTyping = m.role === 'assistant' && isLast && loading && !m.content
          return (
            <div key={i}>
              {showTyping ? (
                <div className="msg assistant">
                  <div className="avatar assistant"><span className="avatar-emoji">🤖</span></div>
                  <div className="bubble typing"><span className="dot" /><span className="dot" /><span className="dot" /></div>
                  <div className="spacer" />
                </div>
              ) : (
                <Message
                  role={m.role}
                  content={m.content}
                  onCopy={() => copyMessage(m.content)}
                  onRetry={m.role === 'assistant' && i > 0 ? (i === messages.length - 1 ? retryLastResponse : () => {
                    // Retry at specific assistant index: trim and regenerate
                    (async () => {
                      await retryResponseAtIndex(i)
                    })()
                  }) : undefined}
                />
              )}
            </div>
          )
        })}
        <div ref={bottomRef} />
      </main>
      {showScrollDown && (
        <button className="scroll-down" aria-label="Scroll to bottom" title="Scroll to bottom" onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })}>
          ↓
        </button>
      )}

      <footer className="composer">
        <div className="composer-inner">
          <div className="textarea-wrap">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ketik pesan… (Enter kirim, Shift+Enter baris baru)"
              rows={1}
            />
            <button
              className={`icon-btn send-icon${loading ? ' stop' : ''}`}
              onClick={loading ? stopStreaming : sendMessage}
              disabled={!loading && !canSend}
              aria-label={loading ? 'Hentikan respons' : 'Kirim pesan'}
              title={loading ? 'Hentikan respons' : 'Kirim pesan'}
            >
              {loading ? '■' : '➤'}
            </button>
          </div>
        </div>
      </footer>
    </div>
  )
}

function TypingText({ text = '', texts, speed = 90, eraseSpeed = 55, hold = 1400, loop = false }) {
  const [output, setOutput] = useState('')
  const items = Array.isArray(texts) && texts.length ? texts : [text]

  useEffect(() => {
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      setOutput(items[0] || '')
      return
    }
    let word = 0
    let i = 0
    let phase = 'typing' // typing -> holdType -> erasing -> holdErase (if loop)
    let tId
    let cancelled = false

    const tick = () => {
      if (cancelled) return
      const current = items[word] || ''
      if (phase === 'typing') {
        if (i <= current.length) {
          setOutput(current.slice(0, i))
          i += 1
          tId = setTimeout(tick, speed)
        } else if (loop || word < items.length - 1) {
          phase = 'holdType'
          tId = setTimeout(tick, hold)
        }
      } else if (phase === 'holdType') {
        phase = 'erasing'
        tId = setTimeout(tick, eraseSpeed)
      } else if (phase === 'erasing') {
        if (i >= 0) {
          setOutput(current.slice(0, i))
          i -= 1
          tId = setTimeout(tick, eraseSpeed)
        } else {
          phase = 'holdErase'
          tId = setTimeout(tick, hold)
        }
      } else if (phase === 'holdErase') {
        if (word < items.length - 1) {
          word += 1
        } else if (loop) {
          word = 0
        }
        phase = 'typing'; i = 0
        tId = setTimeout(tick, speed)
      }
    }

    tick()
    return () => { cancelled = true; if (tId) clearTimeout(tId) }
  }, [JSON.stringify(items), speed, eraseSpeed, hold, loop])

  return <>{output}</>
}

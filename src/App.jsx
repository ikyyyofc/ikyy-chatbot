import React, { useEffect, useMemo, useRef, useState } from 'react'
import Message from './components/Message.jsx'
import { BotIcon, ResetIcon, WhatsAppIcon, InstagramIcon, GitHubIcon, ChevronDownIcon, SendIcon, StopIcon } from './components/Icons.jsx'
import { GREETING_INSTRUCTION } from '../config.js'

function Avatar({ kind }) {
  return (
    <div className={`avatar ${kind}`}>
      <span className="avatar-emoji">{kind === 'assistant' ? '🤖' : '🙂'}</span>
    </div>
  )
}

// Greeting instruction moved to config.js

export default function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
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
  const greetedRef = useRef(false)
  const streamIdRef = useRef(0)

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

  // Generate the initial assistant greeting via streaming once on mount
  useEffect(() => {
    if (greetedRef.current) return
    greetedRef.current = true
    ;(async () => {
      await generateGreeting()
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    let myStreamId = 0
    try {
      const ac = new AbortController()
      setController(ac)
      myStreamId = streamIdRef.current + 1
      streamIdRef.current = myStreamId
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [...messages, userMsg] }),
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
        // If a newer stream has started, stop updating
        if (myStreamId !== streamIdRef.current) {
          try { await reader.cancel() } catch {}
          break
        }
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
      if (myStreamId === streamIdRef.current) {
        setLoading(false)
        setController(null)
      }
    }
  }

  async function generateGreeting() {
    // Add a placeholder assistant message and stream the greeting
    setMessages([{ role: 'assistant', content: '' }])
    setLoading(true)
    let myStreamId = 0
    try {
      const ac = new AbortController()
      setController(ac)
      myStreamId = streamIdRef.current + 1
      streamIdRef.current = myStreamId
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Use a synthetic user instruction to request a greeting
        body: JSON.stringify({ messages: [{ role: 'user', content: GREETING_INSTRUCTION }] }),
        signal: ac.signal
      })
      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (myStreamId !== streamIdRef.current) {
          try { await reader.cancel() } catch {}
          break
        }
        setMessages(prev => {
          const copy = prev.slice()
          const idx = copy.length - 1
          copy[idx] = { role: 'assistant', content: (copy[idx]?.content || '') + chunk }
          return copy
        })
        if (stickRef.current && bottomRef.current) {
          bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' })
        }
      }
    } catch (err) {
      console.error(err)
      setMessages([{ role: 'assistant', content: 'Halo! Ada yang bisa kubantu hari ini?' }])
    } finally {
      if (myStreamId === streamIdRef.current) {
        setLoading(false)
        setController(null)
      }
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
    let myStreamId = 0
    try {
      const ac = new AbortController()
      setController(ac)
      myStreamId = streamIdRef.current + 1
      streamIdRef.current = myStreamId
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: baseHistory }),
        signal: ac.signal
      })
      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (myStreamId !== streamIdRef.current) {
          try { await reader.cancel() } catch {}
          break
        }
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
      if (myStreamId === streamIdRef.current) {
        setLoading(false)
        setController(null)
      }
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
    let myStreamId = 0
    try {
      const ac = new AbortController()
      setController(ac)
      myStreamId = streamIdRef.current + 1
      streamIdRef.current = myStreamId
      // Build history up to and including the triggering user message
      const history = baseHistory
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: ac.signal
      })
      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (myStreamId !== streamIdRef.current) {
          try { await reader.cancel() } catch {}
          break
        }
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
      if (myStreamId === streamIdRef.current) {
        setLoading(false)
        setController(null)
      }
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function resetChat() {
    // Abort any in-flight stream and invalidate stale updates
    try { controller?.abort() } catch {}
    streamIdRef.current += 1
    setInput('')
    // Start a fresh greeting
    generateGreeting()
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
            <ResetIcon />
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
            <a href="https://wa.me/6287866255637" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
              <WhatsAppIcon />
              WA
            </a>
            <a href="https://instagram.com/ikyyofc" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
              <InstagramIcon />
              IG
            </a>
            <a href="https://github.com/ikyyyofc" target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
              <GitHubIcon />
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
                  <div className="avatar assistant"><BotIcon /></div>
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
          <ChevronDownIcon />
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
              {loading ? <StopIcon /> : <SendIcon />}
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

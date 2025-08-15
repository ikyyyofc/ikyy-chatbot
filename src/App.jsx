import React, { 
  useEffect, 
  useMemo, 
  useRef, 
  useState, 
  useCallback, 
  useLayoutEffect,
  memo,
  Fragment,
  forwardRef
} from 'react'
import Message from './components/Message.jsx'
import { 
  BotIcon, 
  ResetIcon, 
  WhatsAppIcon, 
  InstagramIcon, 
  GitHubIcon, 
  ChevronDownIcon, 
  SendIcon, 
  StopIcon 
} from './components/Icons.jsx'
import { GREETING_INSTRUCTION } from '../config.js'
import { Virtuoso } from 'react-virtuoso'

function Avatar({ kind }) {
  return (
    <div className={`avatar ${kind}`}>
      <span className="avatar-emoji">{kind === 'assistant' ? '🤖' : '🙂'}</span>
    </div>
  )
}

// Komponen input yang benar-benar terisolasi dari state utama
const InputComposer = memo(({ loading, sendMessage, stopStreaming, onFocusComposer }) => {
  const textareaRef = useRef(null);
  const inputRef = useRef('');
  const canSendRef = useRef(false);
  const [canSend, setCanSend] = useState(false); // trigger re-render for disabled state
  const rafRef = useRef(null);
  
  // Fungsi auto-grow yang sangat efisien
  const resizeTextarea = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }
    
    rafRef.current = requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      
      // Nonaktifkan transition untuk operasi ini
      const originalTransition = el.style.transition;
      el.style.transition = 'none';
      
      // Reset tinggi untuk menghitung ulang
      const previousHeight = el.style.height;
      el.style.height = 'auto';
      
      // Hitung tinggi baru
      const maxHeight = Math.floor(window.innerHeight * 0.4);
      const newHeight = Math.min(el.scrollHeight, maxHeight);
      
      // Hanya ubah jika benar-benar berbeda
      if (Math.abs(newHeight - parseInt(previousHeight || '0')) > 2) {
        el.style.height = `${newHeight}px`;
      }
      
      // Kembalikan transition
      el.style.transition = originalTransition;
    });
  }, []);

  // Handler input yang super ringan
  const handleInput = useCallback((e) => {
    const value = e.target.value;
    inputRef.current = value;
    const nextCanSend = value.trim().length > 0;
    canSendRef.current = nextCanSend;
    setCanSend(nextCanSend);
    
    // Resize hanya jika diperlukan
    if (value.length % 5 === 0 || value.includes('\n')) {
      resizeTextarea();
    }
  }, [resizeTextarea]);

  const handleKeyDown = useCallback((e) => {
    // Biarkan Enter membuat baris baru secara default.
    // Tidak mengirim pesan melalui Enter.
  }, []);

  // Optimasi: Gunakan microtask untuk resize terakhir
  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  return (
    <div className="textarea-wrap">
      <textarea
        ref={textareaRef}
        placeholder="Masukan teks..."
        rows={1}
        spellCheck="false"
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        onFocus={onFocusComposer}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        // Optimasi kritis: Promosikan ke layer GPU
        style={{ 
          willChange: 'height',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
          perspective: '1000px'
        }}
      />
      <button
        className={`icon-btn send-icon${loading ? ' stop' : ''}`}
        onClick={loading ? stopStreaming : () => {
          if (canSendRef.current) {
            sendMessage(inputRef.current);
            // Reset textarea dengan manipulasi DOM langsung
            if (textareaRef.current) {
              textareaRef.current.value = '';
              textareaRef.current.style.height = 'auto';
            }
            inputRef.current = '';
            canSendRef.current = false;
            setCanSend(false);
          }
        }}
        disabled={loading ? false : !canSend}
        aria-label={loading ? 'Hentikan respons' : 'Kirim pesan'}
        title={loading ? 'Hentikan respons' : 'Kirim pesan'}
        // Optimasi kritis: Promosikan ke layer GPU
        style={{ willChange: 'transform' }}
      >
        {loading ? <StopIcon /> : <SendIcon />}
      </button>
    </div>
  );
});

InputComposer.displayName = 'InputComposer';

export default function App() {
  const [messages, setMessages] = useState([])
  const [sessionId] = useState(() => {
    try { if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID() } catch {}
    return 'sess-' + Math.random().toString(36).slice(2) + '-' + Date.now()
  })
  const [loading, setLoading] = useState(false)
  const [controller, setController] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const menuBtnRef = useRef(null)
  const [showScrollDown, setShowScrollDown] = useState(false)
  // Virtualized scroller ref
  const virtuosoRef = useRef(null)
  const stickRef = useRef(true)
  const lastScrollTickRef = useRef(0)
  const greetedRef = useRef(false)
  const streamIdRef = useRef(0)
  const activeAssistantIndexRef = useRef(null)
  const nextIdRef = useRef(1)
  // Live streaming buffer to avoid full-list state updates per chunk
  const liveAppendRef = useRef('')
  const [liveTick, setLiveTick] = useState(0)

  // Simpan referensi ke messages untuk akses tanpa trigger render
  const messagesRef = useRef(messages)
  useLayoutEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Virtuoso provides atBottomStateChange; mirror into stickRef/showScrollDown
  const handleAtBottomChange = useCallback((atBottom) => {
    stickRef.current = atBottom
    setShowScrollDown(!atBottom)
  }, [])

  useEffect(() => {
    document.documentElement.datasetTheme = 'dark'
  }, [])

  // no-op

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

  // Fungsi untuk memperbarui isi pesan pada index tertentu
  const updateMessageContent = useCallback((index, content) => {
    setMessages(prev => {
      const copy = [...prev]
      if (index < copy.length) {
        copy[index] = { ...copy[index], content }
      }
      return copy
    })
  }, [])

  // Commit buffered streaming text into state (called on stream end)
  const flushLiveToState = useCallback((targetIndex) => {
    const add = liveAppendRef.current
    if (!add) return
    setMessages(prev => {
      const copy = [...prev]
      const idx = Math.min(targetIndex, copy.length - 1)
      const last = copy[idx]
      if (last?.role === 'assistant') {
        copy[idx] = { ...last, content: (last.content || '') + add }
      }
      return copy
    })
    liveAppendRef.current = ''
  }, [])

  // Buffer chunk streaming dan repaint baris aktif segera
  const appendToAssistant = useCallback((chunk) => {
    if (!chunk) return
    liveAppendRef.current += chunk
    setLiveTick(t => t + 1)
  }, [])

  const sendMessage = useCallback((text) => {
    if (!text.trim() || loading) return
    const userMsg = { id: nextIdRef.current++, role: 'user', content: text.trim() }
    // Add user and a placeholder assistant message
    setMessages(prev => {
      // reset live buffer for fresh stream render
      liveAppendRef.current = ''
      const newList = [...prev, userMsg, { id: nextIdRef.current++, role: 'assistant', content: '' }]
      // placeholder index is prev.length + 1
      activeAssistantIndexRef.current = prev.length + 1
      return newList
    })
    setLoading(true)
    let myStreamId = 0
    ;(async () => {
      try {
        const ac = new AbortController()
        setController(ac)
        myStreamId = streamIdRef.current + 1
        streamIdRef.current = myStreamId
        const res = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, userMessage: userMsg.content }),
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
          appendToAssistant(chunk)
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
          const targetIndex = (typeof activeAssistantIndexRef.current === 'number') ? activeAssistantIndexRef.current : (messagesRef.current.length - 1)
          flushLiveToState(targetIndex)
          setLoading(false)
          setController(null)
          activeAssistantIndexRef.current = null
        }
      }
    })();
  }, [loading, appendToAssistant, flushLiveToState])

  async function generateGreeting() {
    // Add a placeholder assistant message and stream the greeting
    setMessages(() => {
      activeAssistantIndexRef.current = 0
      liveAppendRef.current = ''
      return [{ id: nextIdRef.current++, role: 'assistant', content: '' }]
    })
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
        body: JSON.stringify({ sessionId, userMessage: GREETING_INSTRUCTION, resetSession: true }),
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
        
        appendToAssistant(chunk)
      }
      
    } catch (err) {
      console.error(err)
      setMessages([{ id: nextIdRef.current++, role: 'assistant', content: 'Halo! Ada yang bisa kubantu hari ini?' }])
    } finally {
      if (myStreamId === streamIdRef.current) {
        const targetIndex = (typeof activeAssistantIndexRef.current === 'number') ? activeAssistantIndexRef.current : (messagesRef.current.length - 1)
        flushLiveToState(targetIndex)
        setLoading(false)
        setController(null)
        activeAssistantIndexRef.current = null
      }
    }
  }

  function stopStreaming() {
    try { 
      controller?.abort() 
      activeAssistantIndexRef.current = null
    } catch {}
  }

  const handleCopy = useCallback(async (text) => {
    try { await navigator.clipboard.writeText(text || '') } catch {}
  }, [])

  // Saat fokus ke input, jaga scroll: hanya auto-scroll ke bawah jika memang sedang di bawah
  const handleComposerFocus = useCallback(() => {
    try {
      if (stickRef.current) {
        const lastIndex = Math.max(0, messagesRef.current.length - 1)
        virtuosoRef.current?.scrollToIndex({ index: lastIndex, align: 'end' })
      }
    } catch {}
  }, [])

  async function retryResponseAtIndex(targetIndex) {
    if (loading) return
    if (targetIndex === 0) return // do not allow retry for the very first assistant message
    if (targetIndex < 0 || targetIndex >= messages.length) return
    if (messages[targetIndex]?.role !== 'assistant') return
    const lastUserIndex = messages.slice(0, targetIndex).map(m => m.role).lastIndexOf('user')
    if (lastUserIndex === -1 && targetIndex !== 0) return
    const baseHistory = lastUserIndex >= 0 ? messages.slice(0, lastUserIndex + 1) : []
    setMessages(() => {
      activeAssistantIndexRef.current = baseHistory.length
      liveAppendRef.current = ''
      return [...baseHistory, { id: nextIdRef.current++, role: 'assistant', content: '' }]
    })
    setLoading(true)
    let myStreamId = 0
    try {
      const ac = new AbortController()
      setController(ac)
      myStreamId = streamIdRef.current + 1
      streamIdRef.current = myStreamId
      // Truncate server session to this base (by user-count) and retry
      const keepUserCount = baseHistory.filter(m => m.role === 'user').length
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'truncate_and_retry', keepUserCount }),
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
        appendToAssistant(chunk)
      }
      
    } catch (err) {
      console.error(err)
      // Isi placeholder dengan pesan error jika gagal
      setMessages(prev => {
        const copy = prev.slice()
        const lastIndex = copy.length - 1
        const last = copy[lastIndex]
        if (last?.role === 'assistant' && !last.content) {
          copy[lastIndex] = { ...last, content: 'Maaf, terjadi kesalahan saat melakukan retry.' }
        }
        return copy
      })
    } finally {
      if (myStreamId === streamIdRef.current) {
        const targetIndex = (typeof activeAssistantIndexRef.current === 'number') ? activeAssistantIndexRef.current : (messagesRef.current.length - 1)
        flushLiveToState(targetIndex)
        setLoading(false)
        setController(null)
        activeAssistantIndexRef.current = null
      }
    }
  }

  // Retry assistant response by message id to avoid stale index issues with virtualization/memoization
  const retryAssistantById = useCallback(async (msgId) => {
    if (loading) return
    const current = messagesRef.current
    const idx = current.findIndex(m => m.id === msgId)
    if (idx <= 0) return
    if (current[idx]?.role !== 'assistant') return

    const lastAssistantIndex = [...current].map(m => m.role).lastIndexOf('assistant')
    if (idx === lastAssistantIndex) {
      await retryLastResponse()
      return
    }

    const lastUserIndex = current.slice(0, idx).map(m => m.role).lastIndexOf('user')
    if (lastUserIndex === -1 && idx !== 0) return
    const baseHistory = lastUserIndex >= 0 ? current.slice(0, lastUserIndex + 1) : []
    setMessages(() => {
      activeAssistantIndexRef.current = baseHistory.length
      liveAppendRef.current = ''
      return [...baseHistory, { id: nextIdRef.current++, role: 'assistant', content: '' }]
    })
    setLoading(true)
    let myStreamId = 0
    try {
      const ac = new AbortController()
      setController(ac)
      myStreamId = streamIdRef.current + 1
      streamIdRef.current = myStreamId
      const keepUserCount = baseHistory.filter(m => m.role === 'user').length
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'truncate_and_retry', keepUserCount }),
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
        appendToAssistant(chunk)
      }
      
    } catch (err) {
      console.error(err)
      // Isi placeholder dengan pesan error jika gagal
      setMessages(prev => {
        const copy = prev.slice()
        const lastIndex = copy.length - 1
        const last = copy[lastIndex]
        if (last?.role === 'assistant' && !last.content) {
          copy[lastIndex] = { ...last, content: 'Maaf, terjadi kesalahan saat melakukan retry.' }
        }
        return copy
      })
    } finally {
      if (myStreamId === streamIdRef.current) {
        const targetIndex = (typeof activeAssistantIndexRef.current === 'number') ? activeAssistantIndexRef.current : (messagesRef.current.length - 1)
        flushLiveToState(targetIndex)
        setLoading(false)
        setController(null)
        activeAssistantIndexRef.current = null
      }
    }
  }, [loading, retryLastResponse, appendToAssistant, sessionId, flushLiveToState])

  // Stable handler to trigger retry by id from Message rows
  const handleRetry = useCallback((id) => { (async () => { await retryAssistantById(id) })() }, [retryAssistantById])

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
    setMessages(() => {
      activeAssistantIndexRef.current = baseHistory.length
      // reset live buffer for fresh stream render
      liveAppendRef.current = ''
      return [...baseHistory, { id: nextIdRef.current++, role: 'assistant', content: '' }]
    })
    setLoading(true)
    let myStreamId = 0
    try {
      const ac = new AbortController()
      setController(ac)
      myStreamId = streamIdRef.current + 1
      streamIdRef.current = myStreamId
      // Ask server to regenerate from last user in session (keeps payload small)
      const res = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, action: 'retry_last' }),
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
        appendToAssistant(chunk)
      }
      
    } catch (err) {
      console.error(err)
      // Isi placeholder dengan pesan error jika gagal
      setMessages(prev => {
        const copy = prev.slice()
        const lastIndex = copy.length - 1
        const last = copy[lastIndex]
        if (last?.role === 'assistant' && !last.content) {
          copy[lastIndex] = { ...last, content: 'Maaf, terjadi kesalahan saat melakukan retry.' }
        }
        return copy
      })
    } finally {
      if (myStreamId === streamIdRef.current) {
        const targetIndex = (typeof activeAssistantIndexRef.current === 'number') ? activeAssistantIndexRef.current : (messagesRef.current.length - 1)
        flushLiveToState(targetIndex)
        setLoading(false)
        setController(null)
        activeAssistantIndexRef.current = null
      }
    }
  }

  function resetChat() {
    // Abort any in-flight stream and invalidate stale updates
    try { 
      controller?.abort() 
    } catch {}
    streamIdRef.current += 1
    // Start a fresh greeting
    generateGreeting()
  }

  // Custom scroller: keep existing semantics and styling by using <main className="chat"> as the scroll container
  const Scroller = useMemo(() => forwardRef(function ScrollerImpl({ className, style, ...rest }, ref) {
    // Virtuoso sets style/children/role; merge className to keep .chat
    const merged = ['chat', className].filter(Boolean).join(' ')
    return <main ref={ref} className={merged} style={style} {...rest} />
  }), [])

  return (
    <div className={`app${loading ? ' is-loading' : ''}`}>
      <header className="header">
        <div className="brand">
          <div className="brand-title">IKYY</div>
          <div className="brand-sub"><span className="typing-text"><TypingText texts={["Asisten Virtual","AI Temanmu","Selalu Siap Bantu","Modern & Futuristik"]} loop={true} /></span><span className="caret"></span></div>
        </div>
        <div className="controls">
          {/* fixed model: gpt-4.1 (default via config) */}
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
            <a href="https://wa.me/6287866255637 " target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
              <WhatsAppIcon />
              WA
            </a>
            <a href="https://instagram.com/ikyyofc " target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
              <InstagramIcon />
              IG
            </a>
            <a href="https://github.com/ikyyyofc " target="_blank" rel="noreferrer" onClick={() => setMenuOpen(false)}>
              <GitHubIcon />
              GitHub
            </a>
          </div>
        )}
      </header>

      <Virtuoso
        ref={virtuosoRef}
        data={messages}
        style={{ height: '100%' }}
        atBottomStateChange={handleAtBottomChange}
        followOutput={true}
        computeItemKey={(index, item) => item?.id ?? `idx-${index}-${item?.role}`}
        components={{ Scroller }}
        itemContent={(i, m) => {
          const isLast = i === messages.length - 1
          const isActiveAssistant = m.role === 'assistant' && (i === (typeof activeAssistantIndexRef.current === 'number' ? activeAssistantIndexRef.current : -1))
          const showTyping = m.role === 'assistant' && isLast && loading && !m.content && !liveAppendRef.current
          const hasPrevUser = i > 0 ? messages.slice(0, i).some(x => x.role === 'user') : false
          const liveExtra = isActiveAssistant ? (liveAppendRef.current || '') : ''
          const contentToShow = (m.content || '') + liveExtra
          const rowTick = isActiveAssistant ? liveTick : 0
          return (
            <div className="msg-row" key={m?.id ?? `msg-${i}-${m.role}`}>
              {showTyping ? (
                <div className="msg assistant">
                  <div className="avatar assistant"><BotIcon /></div>
                  <div className="bubble typing"><span className="dot" /><span className="dot" /><span className="dot" /></div>
                  <div className="spacer" />
                </div>
              ) : (
                <Message
                  id={m.id}
                  role={m.role}
                  content={contentToShow}
                  tick={rowTick}
                  onCopy={handleCopy}
                  onRetry={m.role === 'assistant' && hasPrevUser ? handleRetry : undefined}
                  msgId={m.id}
                  actionsDisabled={loading}
                />
              )}
            </div>
          )
        }}
      />
      {showScrollDown && (
        <button className="scroll-down" aria-label="Scroll to bottom" title="Scroll to bottom" onClick={() => {
          try {
            virtuosoRef.current?.scrollToIndex({ index: messages.length - 1, align: 'end', behavior: 'smooth' })
          } catch {}
        }}>
          <ChevronDownIcon />
        </button>
      )}

      <footer className="composer">
        <div className="composer-inner">
          <InputComposer
            loading={loading}
            sendMessage={sendMessage}
            stopStreaming={stopStreaming}
            onFocusComposer={handleComposerFocus}
          />
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

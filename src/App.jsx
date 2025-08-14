import React, { 
  useEffect, 
  useMemo, 
  useRef, 
  useState, 
  useCallback, 
  useLayoutEffect,
  memo,
  Fragment
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

function Avatar({ kind }) {
  return (
    <div className={`avatar ${kind}`}>
      <span className="avatar-emoji">{kind === 'assistant' ? '🤖' : '🙂'}</span>
    </div>
  )
}

// Komponen input yang benar-benar terisolasi dari state utama
const InputComposer = memo(({ loading, sendMessage, stopStreaming }) => {
  const textareaRef = useRef(null);
  const inputRef = useRef('');
  const canSendRef = useRef(false);
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
    canSendRef.current = value.trim().length > 0 && !loading;
    
    // Resize hanya jika diperlukan
    if (value.length % 5 === 0 || value.includes('\n')) {
      resizeTextarea();
    }
  }, [loading, resizeTextarea]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (canSendRef.current) {
        sendMessage(inputRef.current);
        // Reset textarea dengan manipulasi DOM langsung
        e.target.value = '';
        inputRef.current = '';
        canSendRef.current = false;
        e.target.style.height = 'auto';
      }
    }
  }, [sendMessage]);

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
            textareaRef.current.value = '';
            inputRef.current = '';
            canSendRef.current = false;
            textareaRef.current.style.height = 'auto';
          }
        }}
        disabled={!canSendRef.current}
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
  const greetedRef = useRef(false)
  const streamIdRef = useRef(0)
  // Buffer untuk mengumpulkan chunk sebelum pembaruan state
  const bufferRef = useRef('')
  const bufferTimeoutRef = useRef(null)

  // Simpan referensi ke messages untuk akses tanpa trigger render
  const messagesRef = useRef(messages)
  useLayoutEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // Track jika user is near bottom; only then auto-stick
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

  // Optimasi: Kurangi frekuensi scroll dengan requestAnimationFrame
  useEffect(() => {
    let frameId
    const handleScroll = () => {
      if (stickRef.current && bottomRef.current) {
        bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' })
      }
    }

    if (loading) {
      frameId = requestAnimationFrame(handleScroll)
    }

    return () => {
      if (frameId) cancelAnimationFrame(frameId)
    }
  }, [messages, loading])

  useEffect(() => {
    document.documentElement.datasetTheme = 'dark'
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

  // Fungsi untuk memperbarui pesan dengan buffering
  const updateMessageContent = useCallback((index, content) => {
    setMessages(prev => {
      const copy = [...prev]
      if (index < copy.length) {
        copy[index] = { ...copy[index], content }
      }
      return copy
    })
  }, [])

  // Fungsi untuk memproses buffer
  const processBuffer = useCallback(() => {
    if (bufferRef.current && bufferRef.current.length > 0) {
      const currentMessages = messagesRef.current
      const lastIndex = currentMessages.length - 1
      const lastMessage = currentMessages[lastIndex]
      
      if (lastMessage && lastMessage.role === 'assistant') {
        const newContent = (lastMessage.content || '') + bufferRef.current
        updateMessageContent(lastIndex, newContent)
      }
      bufferRef.current = ''
    }
    
    if (bufferTimeoutRef.current) {
      clearTimeout(bufferTimeoutRef.current)
      bufferTimeoutRef.current = null
    }
  }, [updateMessageContent])

  // Fungsi untuk menambahkan chunk ke buffer
  const addToBuffer = useCallback((chunk) => {
    bufferRef.current += chunk
    
    // Proses buffer setiap 16ms (~60fps)
    if (!bufferTimeoutRef.current) {
      bufferTimeoutRef.current = setTimeout(() => {
        processBuffer()
        // Lakukan scroll hanya setelah pembaruan buffer
        if (stickRef.current && bottomRef.current) {
          bottomRef.current.scrollIntoView({ behavior: 'auto', block: 'end' })
        }
      }, 16)
    }
  }, [processBuffer])

  const sendMessage = useCallback((text) => {
    if (!text.trim() || loading) return
    const userMsg = { role: 'user', content: text.trim() }
    // Add user and a placeholder assistant message
    setMessages(prev => [...prev, userMsg, { role: 'assistant', content: '' }])
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
          body: JSON.stringify({ messages: [...messagesRef.current, userMsg] }),
          signal: ac.signal
        })
        if (!res.ok || !res.body) throw new Error(`API error ${res.status}`)
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let gotFirstChunk = false
        
        // Reset buffer
        bufferRef.current = ''
        if (bufferTimeoutRef.current) {
          clearTimeout(bufferTimeoutRef.current)
          bufferTimeoutRef.current = null
        }
        
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
          
          // Tambahkan ke buffer alih-alih langsung update state
          addToBuffer(chunk)
        }
        
        // Pastikan semua buffer diproses sebelum selesai
        if (bufferTimeoutRef.current) {
          clearTimeout(bufferTimeoutRef.current)
        }
        processBuffer()
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
    })();
  }, [loading, addToBuffer, processBuffer])

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
      
      // Reset buffer
      bufferRef.current = ''
      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current)
        bufferTimeoutRef.current = null
      }
      
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        const chunk = decoder.decode(value, { stream: true })
        if (myStreamId !== streamIdRef.current) {
          try { await reader.cancel() } catch {}
          break
        }
        
        // Tambahkan ke buffer alih-alih langsung update state
        addToBuffer(chunk)
      }
      
      // Pastikan semua buffer diproses sebelum selesai
      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current)
      }
      processBuffer()
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
    try { 
      controller?.abort() 
      // Hapus buffer yang tersisa
      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current)
        bufferTimeoutRef.current = null
      }
      bufferRef.current = ''
    } catch {}
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
      
      // Reset buffer
      bufferRef.current = ''
      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current)
        bufferTimeoutRef.current = null
      }
      
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
        
        // Tambahkan ke buffer alih-alih langsung update state
        addToBuffer(chunk)
      }
      
      // Pastikan semua buffer diproses sebelum selesai
      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current)
      }
      processBuffer()
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
      
      // Reset buffer
      bufferRef.current = ''
      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current)
        bufferTimeoutRef.current = null
      }
      
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
        
        // Tambahkan ke buffer alih-alih langsung update state
        addToBuffer(chunk)
      }
      
      // Pastikan semua buffer diproses sebelum selesai
      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current)
      }
      processBuffer()
    } catch (err) {
      console.error(err)
    } finally {
      if (myStreamId === streamIdRef.current) {
        setLoading(false)
        setController(null)
      }
    }
  }

  function resetChat() {
    // Abort any in-flight stream and invalidate stale updates
    try { 
      controller?.abort() 
      // Hapus buffer yang tersisa
      if (bufferTimeoutRef.current) {
        clearTimeout(bufferTimeoutRef.current)
        bufferTimeoutRef.current = null
      }
      bufferRef.current = ''
    } catch {}
    streamIdRef.current += 1
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

      <main ref={listRef} className="chat">
        {messages.map((m, i) => {
          const isLast = i === messages.length - 1
          const showTyping = m.role === 'assistant' && isLast && loading && !m.content
          return (
            <Fragment key={`msg-${i}-${m.role}`}>
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
            </Fragment>
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
          <InputComposer
            loading={loading}
            sendMessage={sendMessage}
            stopStreaming={stopStreaming}
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
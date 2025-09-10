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
  StopIcon,
  PaperclipIcon
} from './components/Icons.jsx'
import { GREETING_INSTRUCTION } from '../config.js'
import { copyText } from './utils/clipboard.js'
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
  const fileRef = useRef(null);
  const [attach, setAttach] = useState(null); // { dataUrl, name, type, size }
  
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
    const nextCanSend = value.trim().length > 0 || !!attach;
    canSendRef.current = nextCanSend;
    setCanSend(nextCanSend);
    
    // Resize hanya jika diperlukan
    if (value.length % 5 === 0 || value.includes('\n')) {
      resizeTextarea();
    }
  }, [resizeTextarea, attach]);

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

  // Enable send when there's an attachment even if text empty
  useEffect(() => {
    const value = inputRef.current || ''
    const nextCanSend = value.trim().length > 0 || !!attach
    canSendRef.current = nextCanSend
    setCanSend(nextCanSend)
  }, [attach])

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
      {/* Attach image */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={(e) => {
          try {
            const f = e.target.files && e.target.files[0]
            if (!f) return
            const reader = new FileReader()
            reader.onload = () => {
              const dataUrl = String(reader.result || '')
              setAttach({ dataUrl, name: f.name, type: f.type, size: f.size, file: f })
            }
            reader.readAsDataURL(f)
          } catch {}
        }}
      />
      {attach && (
        <div className="attach-preview">
          <div className="ap-inner">
            <img className="ap-thumb" src={attach.dataUrl} alt="preview" />
            <div className="ap-meta">
              <div className="ap-name" title={attach.name || 'image'}>{attach.name || 'image'}</div>
              <div className="ap-size">{Math.round((attach.size || 0)/1024)} KB</div>
            </div>
            <button className="ap-remove" onClick={() => { setAttach(null) }} title="Hapus gambar" aria-label="Hapus gambar">
              <ResetIcon />
            </button>
          </div>
        </div>
      )}
      <div className="composer-actions">
        <button
          className="icon-btn attach-btn"
          onClick={() => { try { fileRef.current?.click() } catch {} }}
          aria-label="Lampirkan gambar"
          title="Lampirkan gambar"
        >
          <PaperclipIcon />
        </button>
        <button
          className={`icon-btn send-icon${loading ? ' stop' : ''}`}
          onClick={loading ? stopStreaming : async () => {
            if (canSendRef.current) {
              let uploadedUrl = null
              try {
                if (attach?.file) {
                  const fd = new FormData()
                  fd.append('file', attach.file, attach.name || 'image')
                  const r = await fetch('/api/upload', { method: 'POST', body: fd })
                  const j = await r.json().catch(() => ({}))
                  if (!r.ok || !j?.ok || !j?.url) throw new Error('upload_failed')
                  uploadedUrl = j.url
                }
              } catch (e) {
                console.error('Upload gagal', e)
                // Tetap kirim pesan tanpa attachment jika upload gagal
              }
              const at = null // we no longer send base64
              sendMessage(inputRef.current, at, uploadedUrl);
              // Reset textarea dengan manipulasi DOM langsung
              if (textareaRef.current) {
                textareaRef.current.value = '';
                textareaRef.current.style.height = 'auto';
              }
              inputRef.current = '';
              canSendRef.current = false;
              setCanSend(false);
              setAttach(null)
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
  // Track current ReadableStream reader to allow hard-cancel
  const readerRef = useRef(null)
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
  // Track initial greeting readiness to control page preloader hide
  const introPendingRef = useRef(true)
  const [searchCount, setSearchCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [imageCount, setImageCount] = useState(0)
  const [imagePrompt, setImagePrompt] = useState('')

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
    // Detect tool markers and update searching counter + query
    try {
      let starts = 0
      let ends = 0
      if (chunk.includes('⟦tool:realtime_info:start:')) {
        const re = /⟦tool:realtime_info:start:([^⟧]*)⟧/g
        let m
        while ((m = re.exec(chunk))) {
          starts += 1
          try { setSearchQuery(decodeURIComponent(m[1] || '')) } catch { setSearchQuery('') }
        }
        try { chunk = chunk.replace(/⟦tool:realtime_info:start:[^⟧]*⟧/g, '') } catch {}
      }
      if (chunk.includes('⟦tool:realtime_info:end:')) {
        const re2 = /⟦tool:realtime_info:end:([^⟧]*)⟧/g
        let m2
        while ((m2 = re2.exec(chunk))) { ends += 1 }
        try { chunk = chunk.replace(/⟦tool:realtime_info:end:[^⟧]*⟧/g, '') } catch {}
      }
      if (starts || ends) {
        setSearchCount((c) => {
          const next = Math.max(0, c + starts - ends)
          if (next === 0) setSearchQuery('')
          return next
        })
      }
      // Detect image tool markers (generate_image and edit_image)
      let imgStarts = 0
      let imgEnds = 0
      // start markers
      if (chunk.includes('⟦tool:generate_image:start') || chunk.includes('⟦tool:edit_image:start')) {
        const reGen = /⟦tool:generate_image:start(?::([^⟧]*))?⟧/g
        const reEdit = /⟦tool:edit_image:start(?::([^⟧]*))?⟧/g
        let m
        while ((m = reGen.exec(chunk))) {
          imgStarts += 1
          try { if (m[1]) setImagePrompt(decodeURIComponent(m[1])) } catch { setImagePrompt('') }
        }
        while ((m = reEdit.exec(chunk))) {
          imgStarts += 1
          try { if (m[1]) setImagePrompt(decodeURIComponent(m[1])) } catch { setImagePrompt('') }
        }
        try { chunk = chunk.replace(/⟦tool:generate_image:start[^⟧]*⟧/g, '') } catch {}
        try { chunk = chunk.replace(/⟦tool:edit_image:start[^⟧]*⟧/g, '') } catch {}
      }
      // end markers
      if (chunk.includes('⟦tool:generate_image:end') || chunk.includes('⟦tool:edit_image:end')) {
        const reGen2 = /⟦tool:generate_image:end(?::([^⟧]*))?⟧/g
        const reEdit2 = /⟦tool:edit_image:end(?::([^⟧]*))?⟧/g
        let m2
        while ((m2 = reGen2.exec(chunk))) { imgEnds += 1 }
        while ((m2 = reEdit2.exec(chunk))) { imgEnds += 1 }
        try { chunk = chunk.replace(/⟦tool:generate_image:end[^⟧]*⟧/g, '') } catch {}
        try { chunk = chunk.replace(/⟦tool:edit_image:end[^⟧]*⟧/g, '') } catch {}
      }
      if (imgStarts || imgEnds) {
        setImageCount((c) => {
          const next = Math.max(0, c + imgStarts - imgEnds)
          if (next === 0) setImagePrompt('')
          return next
        })
      }
    } catch {}
    if (!chunk) return
    liveAppendRef.current += chunk
    setLiveTick(t => t + 1)
    // On first greeting chunk, signal that app is ready (hide preloader)
    try {
      if (introPendingRef.current && (activeAssistantIndexRef.current === 0)) {
        window.dispatchEvent(new Event('app:ready'))
        introPendingRef.current = false
      }
    } catch {}
  }, [])

  const sendMessage = useCallback((text, attachDataUrl = null, attachmentUrl = null) => {
    if (!text.trim() || loading) return
    let content = text.trim()
    if (attachmentUrl) {
      // Render image nicely in the user bubble via Markdown
      content += `\n\n![image](${attachmentUrl})`
    } else if (attachDataUrl) {
      // Fallback only if URL upload failed (should be rare)
      content += `\n\n![image](${attachDataUrl})`
    }
    const userMsg = { id: nextIdRef.current++, role: 'user', content }
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
          body: JSON.stringify({ sessionId, userMessage: userMsg.content, clientStreamId: myStreamId, attachmentDataUrl: attachDataUrl || undefined, attachmentUrl: attachmentUrl || undefined }),
          signal: ac.signal
        })
        if (!res.ok || !res.body) throw new Error(`API error ${res.status}`)
        const reader = res.body.getReader()
        readerRef.current = reader
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
              // Pertahankan id dan properti lain agar aksi (mis. retry) tetap berfungsi
              copy[lastIndex] = { ...last, role: 'assistant', content: 'Maaf, terjadi kesalahan memproses permintaan.' }
            }
            return copy
          })
        }
      } finally {
        // Clear reader ref so Stop won't try cancel a finished stream
        if (readerRef.current) readerRef.current = null
        if (myStreamId === streamIdRef.current) {
          const targetIndex = (typeof activeAssistantIndexRef.current === 'number') ? activeAssistantIndexRef.current : (messagesRef.current.length - 1)
          flushLiveToState(targetIndex)
          setLoading(false)
          setController(null)
          activeAssistantIndexRef.current = null
          setSearchCount(0)
          setSearchQuery('')
          setImageCount(0)
          setImagePrompt('')
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
    // Mark intro as pending until we get the first chunk
    introPendingRef.current = true
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
        body: JSON.stringify({ sessionId, userMessage: GREETING_INSTRUCTION, resetSession: true, clientStreamId: myStreamId }),
        signal: ac.signal
      })
      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`)
      const reader = res.body.getReader()
      readerRef.current = reader
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
      // Jangan tampilkan fallback greeting jika dibatalkan
      if (err?.name !== 'AbortError') {
        setMessages([{ id: nextIdRef.current++, role: 'assistant', content: 'Halo! Ada yang bisa kubantu hari ini?' }])
      }
    } finally {
      if (readerRef.current) readerRef.current = null
      if (myStreamId === streamIdRef.current) {
        const targetIndex = (typeof activeAssistantIndexRef.current === 'number') ? activeAssistantIndexRef.current : (messagesRef.current.length - 1)
        flushLiveToState(targetIndex)
        setLoading(false)
        setController(null)
        activeAssistantIndexRef.current = null
        setSearchCount(0)
        setSearchQuery('')
        setImageCount(0)
        setImagePrompt('')
        setImageCount(0)
        setImagePrompt('')
        // If no chunk ever arrived, still hide the preloader gracefully
        try {
          if (introPendingRef.current) {
            window.dispatchEvent(new Event('app:ready'))
            introPendingRef.current = false
          }
        } catch {}
      }
    }
  }

  function stopStreaming() {
    try {
      // Cancel the active reader first to force-close body stream
      if (readerRef.current) {
        try { readerRef.current.cancel() } catch {}
        readerRef.current = null
      }
      controller?.abort()
    } catch {}
    // Segera commit buffer live ke state agar tidak menghilang dari UI
    try {
      const targetIndex = (typeof activeAssistantIndexRef.current === 'number') ? activeAssistantIndexRef.current : (messagesRef.current.length - 1)
      if (liveAppendRef.current) {
        setMessages(prev => {
          const copy = [...prev]
          const idx = Math.min(targetIndex, copy.length - 1)
          const last = copy[idx]
          if (last?.role === 'assistant') {
            copy[idx] = { ...last, content: (last.content || '') + liveAppendRef.current }
          }
          return copy
        })
        liveAppendRef.current = ''
      }
    } catch {}
    // Inform backend to stop the upstream stream even if proxy keeps connection
    try {
      const id = streamIdRef.current
      if (id && sessionId) {
        fetch('/api/chat/stop', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId, clientStreamId: id }),
          keepalive: true
        }).catch(() => {})
      }
    } catch {}
    // Hapus bubble assistant kosong jika dihentikan sebelum ada teks
    try {
      setMessages(prev => {
        if (!prev || prev.length === 0) return prev
        const copy = prev.slice()
        const lastIndex = copy.length - 1
        const last = copy[lastIndex]
        if (last?.role === 'assistant' && !(last?.content)) {
          copy.pop()
        }
        return copy
      })
    } catch {}
    // Bersihkan indikator pencarian/gambar agar UI tidak menggantung
    try {
      setSearchCount(0)
      setSearchQuery('')
      setImageCount(0)
      setImagePrompt('')
    } catch {}
    activeAssistantIndexRef.current = null
  }

  const handleCopy = useCallback(async (text) => {
    try { await copyText(text || '') } catch {}
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
        body: JSON.stringify({ sessionId, action: 'truncate_and_retry', keepUserCount, clientStreamId: myStreamId }),
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
      // Jangan tampilkan error jika ini pembatalan oleh pengguna
      if (err?.name !== 'AbortError') {
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
        body: JSON.stringify({ sessionId, action: 'truncate_and_retry', keepUserCount, clientStreamId: myStreamId }),
        signal: ac.signal
      })
      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`)
      const reader = res.body.getReader()
      readerRef.current = reader
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
      // Jangan tampilkan error jika ini pembatalan oleh pengguna
      if (err?.name !== 'AbortError') {
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
      }
    } finally {
      if (readerRef.current) readerRef.current = null
      if (myStreamId === streamIdRef.current) {
        const targetIndex = (typeof activeAssistantIndexRef.current === 'number') ? activeAssistantIndexRef.current : (messagesRef.current.length - 1)
        flushLiveToState(targetIndex)
        setLoading(false)
        setController(null)
        activeAssistantIndexRef.current = null
        setSearchCount(0)
        setSearchQuery('')
        setImageCount(0)
        setImagePrompt('')
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
        body: JSON.stringify({ sessionId, action: 'retry_last', clientStreamId: myStreamId }),
        signal: ac.signal
      })
      if (!res.ok || !res.body) throw new Error(`API error ${res.status}`)
      const reader = res.body.getReader()
      readerRef.current = reader
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
      // Jangan tampilkan error jika ini pembatalan oleh pengguna
      if (err?.name !== 'AbortError') {
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
      }
    } finally {
      if (readerRef.current) readerRef.current = null
      if (myStreamId === streamIdRef.current) {
        const targetIndex = (typeof activeAssistantIndexRef.current === 'number') ? activeAssistantIndexRef.current : (messagesRef.current.length - 1)
        flushLiveToState(targetIndex)
        setLoading(false)
        setController(null)
        activeAssistantIndexRef.current = null
        setSearchCount(0)
        setSearchQuery('')
      }
    }
  }

  function resetChat() {
    // Abort any in-flight stream and invalidate stale updates
    try { 
      controller?.abort() 
    } catch {}
    streamIdRef.current += 1
    // Pastikan indikator pencarian bersih saat reset
    try {
      setSearchCount(0)
      setSearchQuery('')
      setImageCount(0)
      setImagePrompt('')
    } catch {}
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
          const isSearching = searchCount > 0
          const isImaging = imageCount > 0
          const showTyping = m.role === 'assistant' && isLast && loading && !m.content && !liveAppendRef.current && !isSearching && !isImaging
          const hasPrevUser = i > 0 ? messages.slice(0, i).some(x => x.role === 'user') : false
          const liveExtra = isActiveAssistant ? (liveAppendRef.current || '') : ''
          const contentToShow = (m.content || '') + liveExtra
          const rowTick = isActiveAssistant ? liveTick : 0
          return (
            <div className="msg-row" key={m?.id ?? `msg-${i}-${m.role}`}>
              {showTyping ? (
                <div className="msg assistant">
                  <div className="avatar assistant"><BotIcon /></div>
                  <div className="bubble skeleton" aria-busy="true" aria-label="Sedang mengetik">
                    <div className="skeleton-lines">
                      <div className="sk-line w80"></div>
                      <div className="sk-line w95"></div>
                      <div className="sk-line w70"></div>
                    </div>
                  </div>
                  <div className="spacer" />
                </div>
              ) : (
                <Message
                  id={m.id}
                  role={m.role}
                  content={contentToShow}
                  tick={rowTick}
                  searching={searchCount > 0 && isActiveAssistant}
                  searchingQuery={searchQuery}
                  imaging={isImaging && isActiveAssistant}
                  imagingText={imagePrompt}
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

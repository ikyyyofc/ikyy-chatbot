import React from 'react'

// All icons are currentColor-driven and tailored to the app's
// neon, modern, and slightly futuristic aesthetic.

export function BotIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3.5v-1.8" />
      <circle cx="12" cy="1.2" r="0.9" fill="currentColor" stroke="none" />
      <rect x="5.2" y="7" width="13.6" height="9.6" rx="3" />
      <rect x="3.6" y="10" width="2.2" height="3.4" rx="1" />
      <rect x="18.2" y="10" width="2.2" height="3.4" rx="1" />
      <circle cx="9.4" cy="11.8" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="11.8" r="1" fill="currentColor" stroke="none" />
      <rect x="9.2" y="13.6" width="5.6" height="2.2" rx="1.1" />
    </svg>
  )
}

export function UserIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8.5" r="3.6" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </svg>
  )
}

export function SendIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4.5 11.5 19.6 4.8a1 1 0 0 1 1.4 1.1l-2.1 12.1a1 1 0 0 1-1.6.7l-5.2-3.9-3.9 2.6.8-4.7-4.3-3.2a1 1 0 0 1 .8-1.8Z" />
    </svg>
  )
}

export function StopIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6.8" y="6.8" width="10.4" height="10.4" rx="1.8" />
    </svg>
  )
}

export function ResetIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 12a8.5 8.5 0 1 0 2.2-5.8" />
      <path d="M3.5 6.2v4h4" />
    </svg>
  )
}

export function ChevronDownIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9.2" />
      <path d="M8 11l4 4 4-4" />
    </svg>
  )
}

export function CopyIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="10" height="10" rx="2.2" />
      <rect x="5" y="5" width="10" height="10" rx="2.2" />
    </svg>
  )
}

export function RetryIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 6v4h-4" />
    </svg>
  )
}

// Brand icons (simplified outlines to match the set)
export function WhatsAppIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.5 11.5a8.5 8.5 0 0 1-12 7.5L4 20l1-4.3a8.5 8.5 0 1 1 15.5-4.2Z" />
      <path d="M7.8 9.5c0 2 1.8 4.6 4.2 5.8.6.3 1 .4 1.4.4.5 0 1.4-.7 1.6-1.1.2-.4 0-.7-.4-.9l-1.6-.8c-.3-.2-.5-.1-.7.1l-.3.4c-.2.2-.4.2-.7.1a5.8 5.8 0 0 1-2.5-2.3c-.1-.3-.1-.5.1-.7l.3-.3c.2-.2.2-.4.1-.7L9 7.9c-.1-.4-.5-.6-.9-.4-.5.2-1.3 1-1.3 2Z" />
    </svg>
  )
}

export function InstagramIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}
      fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.2" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17" cy="7" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function GitHubIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" {...props}
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2.5a9.5 9.5 0 0 0-3 18.5c.5.1.7-.2.7-.5v-2.1c-2.6.6-3.2-1.1-3.2-1.1-.5-1.2-1.2-1.5-1.2-1.5-1-.7.1-.7.1-.7 1 .1 1.5 1 1.5 1 .9 1.5 2.5 1.1 3.1.8.1-.7.4-1.1.7-1.4-2.1-.2-4.4-1.1-4.4-4.9 0-1.1.4-2 .9-2.7 0 0 .8-.3 2.7 1 .8-.2 1.7-.3 2.5-.3.8 0 1.7.1 2.5.3 1.9-1.3 2.7-1 2.7-1 .2.5.3 1 .3 1.6 0 2.6-1.4 3.8-2.8 4.4.4.4.8 1.1.8 2.2v2.6c0 .3.2.6.7.5A9.5 9.5 0 0 0 12 2.5Z" />
    </svg>
  )
}

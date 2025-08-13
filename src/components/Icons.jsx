import React from 'react'

export function BotIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" {...props}
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      {/* antenna */}
      <line x1="12" y1="6.2" x2="12" y2="3.4" />
      <circle cx="12" cy="2.2" r="1" fill="currentColor" stroke="none" />
      {/* head */}
      <rect x="5" y="7.2" width="14" height="9.2" rx="3" />
      {/* ears */}
      <rect x="3.6" y="10" width="2" height="3.2" rx="0.8" />
      <rect x="18.4" y="10" width="2" height="3.2" rx="0.8" />
      {/* eyes */}
      <circle cx="9.5" cy="11.6" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="11.6" r="1" fill="currentColor" stroke="none" />
      {/* mouth */}
      <rect x="9" y="13.6" width="6" height="2.2" rx="1.1" />
    </svg>
  )
}

export function UserIcon(props) {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 12a5 5 0 1 0-5-5 5 5 0 0 0 5 5Z"/>
      <path d="M4 20a8 8 0 0 1 16 0v2H4Z" opacity=".85"/>
    </svg>
  )
}

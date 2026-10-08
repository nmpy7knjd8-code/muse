/** Compact UI icons for the timeline — stroke-based so they match the dark chrome. */

type IconProps = { className?: string; title?: string };

export function LockIcon({ locked, className }: { locked: boolean } & IconProps) {
  return (
    <svg className={'ui-icon' + (className ? ` ${className}` : '')} viewBox="0 0 24 24" width="15" height="15" aria-hidden focusable="false">
      {/* Body */}
      <rect
        x="6" y="11" width="12" height="9" rx="2.2"
        fill={locked ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.7"
      />
      {/* Shackle — closed when locked, open when unlocked */}
      <path
        className="lock-shackle"
        d={locked ? 'M8.5 11V8.2a3.5 3.5 0 0 1 7 0V11' : 'M8.5 11V8.2a3.5 3.5 0 0 1 7 0V7.2'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      {locked && <circle cx="12" cy="15.2" r="1.15" fill="var(--bg, #121117)" />}
    </svg>
  );
}

export function CloseIcon({ className }: IconProps) {
  return (
    <svg className={'ui-icon' + (className ? ` ${className}` : '')} viewBox="0 0 24 24" width="14" height="14" aria-hidden focusable="false">
      <path d="M7 7l10 10M17 7L7 17" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function ReharmIcon({ className }: IconProps) {
  return (
    <svg className={'ui-icon' + (className ? ` ${className}` : '')} viewBox="0 0 24 24" width="14" height="14" aria-hidden focusable="false">
      <path
        d="M7.5 8.5A6 6 0 0 1 18 12M16.5 15.5A6 6 0 0 1 6 12"
        fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
      />
      <path d="M18 8.2v4h-4M6 15.8v-4h4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function MenuIcon({ className }: IconProps) {
  return (
    <svg className={'ui-icon' + (className ? ` ${className}` : '')} viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
      <path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
    </svg>
  );
}

export function BackIcon({ className }: IconProps) {
  return (
    <svg className={'ui-icon' + (className ? ` ${className}` : '')} viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <path d="M15 6l-6 6 6 6" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Tiny staff flourish for the Muse wordmark. */
export function BrandMark({ className }: IconProps) {
  return (
    <svg className={'brand-mark' + (className ? ` ${className}` : '')} viewBox="0 0 28 28" width="22" height="22" aria-hidden focusable="false">
      <defs>
        <linearGradient id="museMark" x1="4" y1="4" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop stopColor="#c4b0ff" />
          <stop offset="1" stopColor="#7fd0a8" />
        </linearGradient>
      </defs>
      <circle cx="14" cy="14" r="12.5" fill="none" stroke="url(#museMark)" strokeWidth="1.4" opacity="0.85" />
      {/* Three short staff lines */}
      <path d="M7 10.5h14M7 14h14M7 17.5h14" stroke="url(#museMark)" strokeWidth="1.35" strokeLinecap="round" opacity="0.9" />
      {/* Note head + stem */}
      <ellipse cx="12.2" cy="17.2" rx="2.4" ry="1.85" fill="url(#museMark)" transform="rotate(-18 12.2 17.2)" />
      <path d="M14.4 16.6V8.4c0-.2.2-.4.5-.35l3.2.7" fill="none" stroke="url(#museMark)" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
  );
}

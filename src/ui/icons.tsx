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

/* ---- Transport icons: optically centered in a 24×24 box ---- */
const tIcon = (cls?: string) => 'ui-icon t-icon' + (cls ? ` ${cls}` : '');

export function PlayIcon({ className, size = 18 }: IconProps & { size?: number }) {
  // Triangle centroid nudged right so it reads centered in a circle.
  return (
    <svg className={tIcon(className)} viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false">
      <path d="M8.5 5.6v12.8a.9.9 0 0 0 1.37.77l10.2-6.4a.9.9 0 0 0 0-1.54L9.87 4.83A.9.9 0 0 0 8.5 5.6z" fill="currentColor" />
    </svg>
  );
}

export function StopIcon({ className, size = 18 }: IconProps & { size?: number }) {
  return (
    <svg className={tIcon(className)} viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false">
      <rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" />
    </svg>
  );
}

export function LoopIcon({ className }: IconProps) {
  return (
    <svg className={tIcon(className)} viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
      <path d="M4.5 11V9.5a3 3 0 0 1 3-3h11M19.5 13v1.5a3 3 0 0 1-3 3h-11" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15.5 3.5l3 3-3 3M8.5 20.5l-3-3 3-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function UndoIcon({ className }: IconProps) {
  return (
    <svg className={tIcon(className)} viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
      <path d="M9 14L4.5 9.5 9 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4.5 9.5h9.5a5.5 5.5 0 0 1 0 11H10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg className={tIcon(className)} viewBox="0 0 24 24" width="18" height="18" aria-hidden focusable="false">
      <path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l.9 12.2a1.5 1.5 0 0 0 1.5 1.3h6.2a1.5 1.5 0 0 0 1.5-1.3L17.5 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CopyIcon({ className }: IconProps) {
  return (
    <svg className={tIcon(className)} viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <rect x="8.5" y="8.5" width="11" height="11" rx="2.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M15.5 8.5V6.7a2.2 2.2 0 0 0-2.2-2.2H6.7a2.2 2.2 0 0 0-2.2 2.2v6.6a2.2 2.2 0 0 0 2.2 2.2h1.8" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

export function DownloadIcon({ className }: IconProps) {
  return (
    <svg className={tIcon(className)} viewBox="0 0 24 24" width="16" height="16" aria-hidden focusable="false">
      <path d="M12 4.5v10M7.5 10.5l4.5 4.5 4.5-4.5M5 19.5h14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

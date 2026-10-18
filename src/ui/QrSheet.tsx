// QR code for the current share link (review fix #13). Encoded locally — no network, works offline.
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFocusTrap } from './focusTrap';
import { CloseIcon, CopyIcon } from './icons';
import { makeQr, qrPath } from './qr';

interface Props {
  url: string;
  label: string;
  onClose: () => void;
  onCopied: (msg: string) => void;
  returnTo: () => HTMLElement | null | undefined;
}

const QUIET = 4;

export function QrSheet({ url, label, onClose, onCopied, returnTo }: Props): ReactNode {
  const panelRef = useRef<HTMLDivElement | null>(null);
  useFocusTrap(panelRef, true, { onEscape: onClose, returnFocus: true, fallback: returnTo });
  const qr = useMemo(() => makeQr(url), [url]);
  const view = qr ? qr.size + QUIET * 2 : 0;
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); onCopied('Share link copied'); }
    catch { window.prompt('Copy this share link', url); }
  };
  return (
    <div className="tutorial-root qr-root" role="dialog" aria-modal="true" aria-labelledby="qr-title"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="tutorial-panel qr-panel" ref={panelRef}>
        <div className="tutorial-head">
          <div>
            <div className="tutorial-title" id="qr-title">Scan to open</div>
            <p className="small muted tutorial-sub">Point another phone’s camera here to open this progression</p>
          </div>
          <button type="button" className="ticon danger" aria-label="Close QR code" onClick={onClose}><CloseIcon /></button>
        </div>
        {qr ? (
          <div className="qr-card">
            <svg viewBox={`0 0 ${view} ${view}`} role="img" aria-label={`QR code linking to ${label}`} shapeRendering="crispEdges">
              <rect width={view} height={view} fill="#fff" />
              <path d={qrPath(qr, QUIET)} fill="#000" />
            </svg>
          </div>
        ) : (
          <p className="small qr-too-long">This progression is too long to fit in a QR code — use <b>Copy link</b> instead.</p>
        )}
        <p className="small muted qr-caption">{label}</p>
        <div className="qr-actions">
          <button type="button" className="t-chip" onClick={() => void copy()}><CopyIcon /> Copy link</button>
        </div>
      </div>
    </div>
  );
}

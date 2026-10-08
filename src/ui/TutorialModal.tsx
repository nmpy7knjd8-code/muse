// Popup player for the bundled feature-intro tutorial video.
import { useEffect, useRef, type ReactNode } from 'react';
import { CloseIcon } from './icons';

interface Props {
  open: boolean;
  onClose: () => void;
}

/** Resolves against Vite `base` (e.g. `/muse/` on GitHub Pages). */
export const TUTORIAL_SRC = `${import.meta.env.BASE_URL}tutorial.mp4`;

export function TutorialModal({ open, onClose }: Props): ReactNode {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const v = videoRef.current;
    if (v) {
      v.currentTime = 0;
      void v.play().catch(() => { /* autoplay may be blocked until a gesture — button already was one */ });
    }
    return () => {
      window.removeEventListener('keydown', onKey);
      v?.pause();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="tutorial-root"
      role="dialog"
      aria-modal="true"
      aria-label="Tutorial"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="tutorial-panel" onClick={(e) => e.stopPropagation()}>
        <div className="tutorial-head">
          <div>
            <div className="tutorial-title">Tutorial</div>
            <p className="small muted tutorial-sub">A quick intro to Muse’s main features</p>
          </div>
          <button type="button" className="ticon danger" aria-label="Close tutorial" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <div className="tutorial-stage">
          <video
            ref={videoRef}
            className="tutorial-video"
            src={TUTORIAL_SRC}
            controls
            playsInline
            preload="metadata"
          />
        </div>
      </div>
    </div>
  );
}

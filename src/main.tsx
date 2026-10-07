import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js', { scope: import.meta.env.BASE_URL }).catch(() => {});
  });
}

// Audio preview rendering hook for scripts (?render-preview) — lazy chunk, not used by the normal UI.
if (new URLSearchParams(location.search).has('render-preview')) {
  void import('./ui/renderPreview').then((m) => { (window as unknown as { musePreview: typeof m }).musePreview = m; });
}

// The real tokens and components of the 1c design system, then the prototype's own layout rules.
import '../../sistema/tokens.css';
import '../../sistema/componenti.css';
// Shared shell of the static mockups: reads ?theme= / ?density= and provides the SVG sprite.
import '../../sistema/shell.js';
import '@xyflow/react/dist/base.css';
import './styles.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';

declare global {
  interface Window {
    CC: { page: (cfg: { states: string[] }) => void };
  }
}

// Injects the glyph/icon sprite (#s-reading, #a-claude, #k-uplink…) used by <Glyph>.
window.CC.page({ states: ['live'] });

const root = document.getElementById('root');
if (root)
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );

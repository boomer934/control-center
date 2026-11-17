import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../../../design/sistema/tokens.css';
import '../../../../../design/sistema/componenti.css';
import './styles/app.css';
import './shell.css';
import { App } from './App';
import { ThemeProvider } from './theme/ThemeProvider';
import { installRendererCapture } from './errors/capture';
import { installFaults } from './errors/faults';

// First thing: whatever fails from here on reaches the main process (logger + Errors Console).
installRendererCapture(window.api.errors);
installFaults();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
);

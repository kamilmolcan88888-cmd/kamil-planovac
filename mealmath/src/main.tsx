import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './i18n';
import './ui/tokens.css';
import { App } from './App';
import { initPwa } from './state/pwa';

initPwa();

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

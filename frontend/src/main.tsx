
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

console.log('[DashINT] Bootstrap starting...');

window.onerror = function(msg, url, line, col, error) {
  console.error('[DashINT GLOBAL ERROR]', { msg, url, line, col, error });
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
  console.log('[DashINT] App render called');
}

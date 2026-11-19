import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Recover automatically if a stale tab requests a chunk hash from an older deploy
if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (event) => {
    try {
      const key = 'vite_preload_reloaded';
      if (!window.sessionStorage.getItem(key)) {
        event.preventDefault();
        window.sessionStorage.setItem(key, '1');
        window.location.reload();
      }
    } catch {
      // Ignore storage errors
    }
  });
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Непредвиденная ошибка интерфейса',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#FAFAFA] p-6 text-[#111317]">
          <div className="max-w-md w-full bg-white border border-[#E4E6EB] rounded-xl p-6 space-y-3">
            <h1 className="text-xl font-semibold">Diamonds Selector</h1>
            <p className="text-sm text-[#5A606D]">
              Не удалось отобразить интерфейс: {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-xs font-medium rounded-lg bg-[#1B365D] text-white"
            >
              Перезагрузить страницу
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);

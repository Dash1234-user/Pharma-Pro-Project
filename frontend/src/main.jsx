import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import App from './App';
import './styles.css';   // your exact same styles.css — zero changes

// React Query client
// staleTime: 30s — data is fresh for 30s before background refetch
// retry: 1     — retry failed requests once before showing error
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:          30 * 1000,
      retry:              1,
      refetchOnWindowFocus: false,   // don't refetch just because user switched tabs
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

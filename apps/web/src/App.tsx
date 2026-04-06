import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppLayout } from './components/layout/AppLayout';
import { useAutoLoad } from './hooks/useAutoLoad';

const EditorPage = lazy(() => import('./pages/editor/EditorPage'));
const QueryPage = lazy(() => import('./pages/query/QueryPage'));
const ChatPage = lazy(() => import('./pages/chat/ChatPage'));
const WikiPage = lazy(() => import('./pages/wiki/WikiPage'));

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-border)] border-t-[var(--color-accent)]" />
    </div>
  );
}

function AppRoutes() {
  useAutoLoad();

  return (
    <AppLayout>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/" element={<Navigate to="/editor" replace />} />
          <Route path="/editor" element={<EditorPage />} />
          <Route path="/query" element={<QueryPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/wiki/*" element={<WikiPage />} />
        </Routes>
      </Suspense>
    </AppLayout>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}

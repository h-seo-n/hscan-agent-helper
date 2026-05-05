import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppShell } from './AppShell';
import { HomePage } from './pages/HomePage';
import { MyPage } from './pages/MyPage';
import { ImagesPage } from './pages/ImagesPage';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('root not found');

createRoot(container).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/my" element={<MyPage />} />
          <Route path="/images" element={<ImagesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  </React.StrictMode>,
);

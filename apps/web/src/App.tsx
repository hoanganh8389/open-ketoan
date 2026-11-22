/**
 * Gốc ứng dụng: các provider (dữ liệu, đăng nhập) và bảng định tuyến.
 * Thêm màn hình mới: tạo trang trong src/features/<nhom>/, thêm Route ở pages.tsx và mục menu ở layout/menu.ts.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { MA_MAT_KET_NOI } from '@ketoan/contracts';
import { AuthProvider, useAuth } from './lib/auth';
import { ApiError } from './lib/api';
import { AppLayout } from './layout/AppLayout';
import { Loading } from './components/ui';
import { LoginPage } from './features/auth/LoginPage';

// [2026-11-22 02:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-038 — B4 (S038-9): mất kết nối máy chủ thì không thử lại từng màn (lib/ketNoi.ts thử một chỗ, nối lại thì tải lại cả)
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: (lan, err) => lan < 1 && !(err instanceof ApiError && err.code === MA_MAT_KET_NOI), refetchOnWindowFocus: false } },
});

function Protected() {
  const { user, loading } = useAuth();
  if (loading) return <Loading />;
  if (!user) return <Navigate to="/dang-nhap" replace />;
  return <AppLayout />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/dang-nhap" element={<LoginPage />} />
            <Route path="/*" element={<Protected />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

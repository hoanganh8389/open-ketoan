// [2026-11-25 Nguyễn Văn Thủy] Thêm nhanh một mục danh mục (khoản mục, …) ngay tại ô chọn trên chứng từ — cùng hộp khai của màn Danh mục (đóng góp)
/**
 * THÊM DANH MỤC NHANH — nút + / F9 ở ô chọn danh mục trên chứng từ mở đúng hộp khai của màn Danh mục (DimensionForm),
 * điền sẵn chữ đang gõ làm tên; ghi xong ô tự chọn mã vừa thêm (danh sách tự tải lại theo khoá ['dimensions', kind]).
 */
import { lazy, Suspense } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { DimensionKind } from '@ketoan/contracts';
import { api } from '@/lib/api';
import { useCoCau } from '@/features/catalog/co-cau/du-lieu';

const BoPhanModal = lazy(() => import('@/features/catalog/co-cau/HopThoai').then((m) => ({ default: m.BoPhanModal })));
const ThemKhoTheoCay = lazy(() => import('@/components/phieu-hang/ThemTheoCoCau').then((m) => ({ default: m.ThemKhoTheoCay })));
const DimensionForm = lazy(() => import('@/features/catalog/DimensionsPage').then((m) => ({ default: m.DimensionForm })));

export function ThemDanhMucNhanh({ kind, text, onClose, onSaved }: { kind: DimensionKind; text: string; onClose: () => void; onSaved: (code: string) => void }) {
  const parents = useQuery({ queryKey: ['dimensions', kind], queryFn: () => api.get<Parameters<typeof import('@/features/catalog/DimensionsPage').DimensionForm>[0]['parents']>(`/api/v1/dimensions/${kind}`), staleTime: 60_000 }).data ?? [];
  return (
    <Suspense fallback={null}>
      <DimensionForm kind={kind} value={{ isNew: true, code: '', name: text.trim(), extra: {} }} parents={parents} onClose={onClose} onSaved={(c) => { onSaved(c); onClose(); }} />
    </Suspense>
  );
}

/** Thêm nhanh bộ phận cho đơn vị của chứng từ (cùng hộp Thêm bộ phận của DM16); ghi xong ô tự chọn bộ phận mới. */
export function ThemBoPhanNhanh({ donVi, onClose, onSaved }: { donVi: string; onClose: () => void; onSaved: (code: string) => void }) {
  const cc = useCoCau();
  return (
    <Suspense fallback={null}>
      <BoPhanModal cc={cc} code={null} donVi={donVi} cha={null} onClose={onClose} onSaved={(_t, c) => { if (c) onSaved(c); onClose(); }} />
    </Suspense>
  );
}

/** Thêm nhanh phân kho cho một chi nhánh (cùng hộp khai kho của Danh mục kho); ghi xong ô tự chọn kho mới, cây đơn vị tải lại. */
export function ThemKhoNhanh({ branchCode, onClose, onSaved }: { branchCode: string; onClose: () => void; onSaved: (code: string) => void }) {
  const qc = useQueryClient();
  return (
    <Suspense fallback={null}>
      {/* [2026-11-26 12:40 AM Nguyễn Văn Thủy] MH-NHAN — hộp Phân kho của sơ đồ tổ chức (gắn sẵn đơn vị) thay form kho rời (đóng góp) */}
      <ThemKhoTheoCay donVi={branchCode || null} onClose={onClose}
        onSaved={(c) => { void qc.invalidateQueries({ queryKey: ['co-cau'] }); void qc.invalidateQueries({ queryKey: ['warehouses'] }); if (c) onSaved(c); }} />
    </Suspense>
  );
}

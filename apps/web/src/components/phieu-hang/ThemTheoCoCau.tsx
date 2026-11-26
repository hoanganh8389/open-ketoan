// [2026-11-26 12:40 AM Nguyễn Văn Thủy] MH-NHAN — thêm nhanh chi nhánh / phân kho từ ô chọn ở chứng từ ĐÚNG theo sơ đồ tổ chức (DM16): dùng chính hộp thoại
// "Thêm đơn vị" (có ô Thuộc, điền sẵn đơn vị cha) và hộp "Phân kho" (gắn sẵn đơn vị) — không thêm rời ngoài cây (đóng góp)
import { DonViModal, PhanKhoModal } from '@/features/catalog/co-cau/HopThoai';
import { useCoCau } from '@/features/catalog/co-cau/du-lieu';

/** Thêm đơn vị (chi nhánh, cửa hàng…) thuộc `cha` — người dùng đổi được ô Thuộc trong hộp. */
export function ThemDonViTheoCay({ cha, onClose, onSaved }: { cha: string | null; onClose: () => void; onSaved: (code: string) => void }) {
  const cc = useCoCau();
  if (cc.loading) return null;
  return <DonViModal cc={cc} code={null} cha={cha} onClose={onClose} onSaved={(code, _t, tiep) => { onSaved(code); if (!tiep) onClose(); }} />;
}

/** Thêm phân kho thuộc đơn vị `donVi`. */
export function ThemKhoTheoCay({ donVi, onClose, onSaved }: { donVi: string | null; onClose: () => void; onSaved: (code: string) => void }) {
  const cc = useCoCau();
  if (cc.loading) return null;
  return <PhanKhoModal cc={cc} code={null} donVi={donVi} onClose={onClose} onSaved={(_t, code) => { if (code) onSaved(code); onClose(); }} />;
}

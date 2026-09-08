/** Same precedence as app_sales_rows: detail rows (including zero), stored total, legacy service. */
export function salesAmount(card: {
  resolved_amount?: number | null;
  the_ban_hang_ct?: { thanh_tien?: unknown; gia_ban?: unknown; so_luong?: unknown }[];
  tong_tien?: unknown;
  dich_vu?: { gia_ban?: unknown };
}): number {
  if (card.resolved_amount != null) return Number(card.resolved_amount);
  if (card.the_ban_hang_ct?.length) {
    return card.the_ban_hang_ct.reduce((sum, ct) => sum + Number(ct.thanh_tien ?? (Number(ct.gia_ban ?? 0) * Number(ct.so_luong ?? 1))), 0);
  }
  return Number(card.tong_tien || card.dich_vu?.gia_ban || 0);
}

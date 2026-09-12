/** Canonicalize a manually entered purchase-receipt code. */
export function normalizePurchaseReceiptCode(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) {
    throw new Error('Mã phiếu thủ công không được để trống.');
  }

  const digits = raw.replace(/^NH-/i, '');
  if (!/^\d{1,6}$/.test(digits)) {
    throw new Error('Mã phiếu thủ công không hợp lệ. Dùng 1-6 chữ số, ví dụ NH-000008.');
  }

  const number = Number(digits);
  if (!Number.isSafeInteger(number) || number <= 0) {
    throw new Error('Mã phiếu thủ công phải lớn hơn 0.');
  }

  return `NH-${String(number).padStart(6, '0')}`;
}

/**
 * A fallback query is safe only when the preview RPC is genuinely absent.
 * Network, permission, timeout and other runtime errors must reach the caller.
 */
export function isMissingPurchaseReceiptCodeRpcError(error: unknown): boolean {
  const candidate = error as { code?: unknown; message?: unknown } | null | undefined;
  const code = String(candidate?.code ?? '').toUpperCase();
  if (code === '42883' || code === 'PGRST202') return true;

  const message = String(candidate?.message ?? '').toLowerCase();
  if (!message.includes('get_next_purchase_receipt_code')) return false;
  return (
    message.includes('does not exist') ||
    message.includes('could not find') ||
    message.includes('schema cache') ||
    message.includes('not found')
  );
}

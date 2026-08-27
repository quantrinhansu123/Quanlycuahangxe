/**
 * Rút gọn giá trị biến ZNS cho vừa giới hạn của Zalo (mỗi tham số tối đa 200 ký tự).
 * Dùng cho biến `service_name`: khi chọn nhiều dịch vụ, ghép tên thành một chuỗi
 * vẫn đọc hiểu được — "A, B, C và N dịch vụ khác" — thay vì liệt kê hết rồi bị Zalo
 * trả lỗi `service_name data breaks max length`.
 */

/** Giới hạn ký tự cho một tham số ZNS (theo cấu hình template phía Zalo). */
export const ZNS_PARAM_MAX_LEN = 200;

/** Câu thay thế khi không tên nào lọt vào giới hạn. */
const GENERIC_SERVICE_LABEL = 'các dịch vụ đã sử dụng';

/** Bỏ đuôi giá tiền / ghi chú trong ngoặc ở cuối tên dịch vụ để hiển thị gọn hơn. */
export function cleanServiceName(name: string): string {
  const trimmed = (name || '').trim();
  const stripped = trimmed
    .replace(/\s*[([][^()[\]]*[)\]]\s*$/u, '') // "(150k)", "[bn]" ở cuối
    .replace(/\s*[-–—]\s*\d[\d.,]*\s*k?%?\s*$/iu, '') // "- 150k", "– 15%" ở cuối
    .trim();
  return stripped || trimmed;
}

/** Cắt chuỗi theo ranh giới từ, độ dài kết quả (đã tính cả "…") không vượt maxLen. */
function truncateAtWord(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const slice = text.slice(0, Math.max(0, maxLen - 1));
  const lastSpace = slice.lastIndexOf(' ');
  const body = lastSpace > maxLen * 0.6 ? slice.slice(0, lastSpace) : slice;
  return `${body.trimEnd()}…`;
}

/** Kẹp một giá trị tham số ZNS bất kỳ về tối đa maxLen ký tự (lưới an toàn). */
export function clampZnsParam(value: string, maxLen = ZNS_PARAM_MAX_LEN): string {
  const text = (value || '').trim();
  return text.length <= maxLen ? text : truncateAtWord(text, maxLen);
}

/** Từ đầu tiên của tên dịch vụ (dùng để gom các biến thể cùng loại). */
function firstWord(name: string): string {
  return (name || '').trim().split(/\s+/)[0] || '';
}

/**
 * Các loại dịch vụ luôn rút gọn về từ đầu tiên, kể cả khi chỉ chọn 1 dịch vụ.
 * (so khớp theo từ đầu, không phân biệt hoa/thường). Thêm loại mới vào đây nếu cần.
 */
const ALWAYS_COLLAPSE_FIRST_WORDS = new Set(['dầu', 'nhớt']);

/**
 * Gom các dịch vụ cùng loại (trùng từ đầu tiên) về đúng từ đó.
 * - Nhóm ≥ 2 dịch vụ → chỉ giữ từ đầu ("Dầu castrol bạc", "Dầu castrol số vàng" → "Dầu").
 * - Nhóm 1 dịch vụ → giữ nguyên tên, trừ khi từ đầu nằm trong ALWAYS_COLLAPSE_FIRST_WORDS
 *   ("Dầu castrol 1l" → "Dầu").
 */
export function collapseServiceNamesByKind(names: string[]): string[] {
  const groups = new Map<string, { label: string; count: number }>();
  for (const raw of names) {
    const name = (raw || '').trim();
    if (!name) continue;
    const key = firstWord(name).toLowerCase();
    if (!key) continue;
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { label: name, count: 1 });
  }
  return [...groups.entries()].map(([key, g]) =>
    g.count > 1 || ALWAYS_COLLAPSE_FIRST_WORDS.has(key) ? firstWord(g.label) : g.label
  );
}

/**
 * Ghép tên nhiều dịch vụ thành một chuỗi ≤ maxLen ký tự, vẫn đọc hiểu được.
 * Ưu tiên giữ trọn các tên đầu, phần dư gộp thành "và N dịch vụ khác".
 */
export function buildServiceNameParam(names: string[], maxLen = ZNS_PARAM_MAX_LEN): string {
  const cleaned = [...new Set(names.map(cleanServiceName).filter(Boolean))];
  if (cleaned.length === 0) return '';

  const full = cleaned.join(', ');
  if (full.length <= maxLen) return full;

  const suffixFor = (remaining: number) => (remaining > 0 ? ` và ${remaining} dịch vụ khác` : '');

  // Ghép tham lam: thêm từng tên tới khi (tên kế tiếp + đuôi tóm tắt) vượt giới hạn.
  const kept: string[] = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    const candidate = [...kept, cleaned[i]].join(', ') + suffixFor(cleaned.length - (i + 1));
    if (candidate.length <= maxLen) kept.push(cleaned[i]);
    else break;
  }

  if (kept.length > 0) {
    return kept.join(', ') + suffixFor(cleaned.length - kept.length);
  }

  // Ngay cả tên đầu tiên cũng dài hơn giới hạn -> cắt theo ranh giới từ.
  const suffix = suffixFor(cleaned.length - 1);
  const room = maxLen - suffix.length;
  if (room >= 8) return truncateAtWord(cleaned[0], room) + suffix;

  return GENERIC_SERVICE_LABEL;
}

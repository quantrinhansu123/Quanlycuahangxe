/** Gõ tắt / xưng hô — bỏ khi tách từ khóa tìm tên. */
const HONORIFICS = new Set([
  'chi', 'chị', 'anh', 'a', 'e', 'em', 'co', 'cô', 'chu', 'chú', 'bac', 'bác',
  'ba', 'bà', 'ong', 'ông', 'cau', 'cậu', 'di', 'dì', 'mo', 'mợ', 'thay', 'thầy',
  'chau', 'cháu', 'cu', 'cụ', 'con', 'be', 'bé',
]);

const FROM =
  'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ';
const TO =
  'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyyd';

/** Bỏ dấu tiếng Việt để so khớp mềm (thuỷ ≈ thủy ≈ thuy). */
export function foldVietnamese(input: string): string {
  let s = (input || '').toLowerCase();
  for (let i = 0; i < FROM.length; i++) {
    s = s.split(FROM[i]).join(TO[i]);
  }
  return s;
}

/** Tách từ khóa tìm kiếm (bỏ xưng hô, giữ từ có nghĩa). */
export function extractVnSearchTokens(term: string): string[] {
  const raw = (term || '').trim();
  if (!raw) return [];

  return raw
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 2)
    .filter((w) => !HONORIFICS.has(foldVietnamese(w)));
}

/** Biến thể chữ hay gõ nhầm (ỷ ↔ ủ ↔ y, ị ↔ i). */
export function expandVnTokenVariants(token: string): string[] {
  const variants = new Set<string>([token]);
  const pairs: [string, string][] = [
    ['ỷ', 'ủ'], ['ủ', 'ỷ'], ['ỷ', 'y'], ['ủ', 'y'], ['ý', 'y'], ['ỳ', 'y'],
    ['ị', 'i'], ['ĩ', 'i'], ['ệ', 'e'], ['ể', 'e'],
  ];

  for (const [a, b] of pairs) {
    for (const v of [...variants]) {
      if (v.includes(a)) variants.add(v.split(a).join(b));
      if (v.includes(b)) variants.add(v.split(b).join(a));
    }
  }

  return [...variants];
}

/** Pattern ilike lỏng — bắt thuỷ / thủy / thuy cùng một họ tên. */
export function looseVnIlikePatterns(token: string): string[] {
  const folded = foldVietnamese(token).replace(/[^a-z0-9]/g, '');
  if (folded.length < 3) return [];

  const patterns = new Set<string>();
  patterns.add(`%${folded.slice(0, 2)}%${folded.slice(-1)}%`);
  if (folded.length >= 4) {
    patterns.add(`%${folded.slice(0, 2)}%${folded.slice(-2)}%`);
    patterns.add(`%${folded[0]}%${folded.slice(-2)}%`);
  }
  return [...patterns];
}

/** So khớp tên không phân biệt dấu + xưng hô. */
export function matchesVnSearch(haystack: string, query: string): boolean {
  const foldedHay = foldVietnamese(haystack);
  const tokens = extractVnSearchTokens(query);
  if (tokens.length === 0) {
    return foldedHay.includes(foldVietnamese(query));
  }
  return tokens.every((t) => foldedHay.includes(foldVietnamese(t)));
}

export interface AttendanceImportLike {
  id?: string;
  id_cham_cong?: string | null;
  nhan_su?: string;
  ngay?: string;
  checkin?: string | null;
}

function minuteOf(value: string | null | undefined): number | null {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
}

/**
 * Ghép từng dòng Excel với đúng bản ghi cũ. Khóa người/ngày là chưa đủ vì một
 * ngày có thể có cặp sáng và cặp chiều; giờ vào là phần bắt buộc của định danh.
 */
export function matchImportedAttendancePairs<T extends AttendanceImportLike, E extends AttendanceImportLike & { id: string }>(
  imported: T[],
  existing: E[],
  personnelKey: (value: string) => string
): { records: T[]; updatedCount: number } {
  const claimedIds = new Set<string>();
  let updatedCount = 0;
  const records = imported.map((source) => {
    const record = { ...source };
    const match = existing.find((candidate) => {
      if (claimedIds.has(candidate.id)) return false;
      if (record.id_cham_cong && candidate.id_cham_cong && record.id_cham_cong === candidate.id_cham_cong) return true;
      if (!record.nhan_su || !candidate.nhan_su || !record.ngay || !candidate.ngay || !record.checkin) return false;
      return personnelKey(record.nhan_su) === personnelKey(candidate.nhan_su)
        && record.ngay === candidate.ngay
        && minuteOf(record.checkin) === minuteOf(candidate.checkin);
    });
    if (match) {
      record.id = match.id;
      claimedIds.add(match.id);
      updatedCount += 1;
    }
    return record;
  });
  return { records, updatedCount };
}

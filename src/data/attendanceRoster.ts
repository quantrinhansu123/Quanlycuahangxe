import { branchKey } from '../lib/branchCatalog';
import { staffNamesMatch } from './attendanceData';
import type { NhanSu } from './personnelData';

export function buildAttendanceRoster(personnel: NhanSu[]) {
  // Pair confirmed in docs/customer-issues-20261021.md. Keep the newer login
  // profile in the roster and resolve historical punches under either ID.
  const vanNamProfiles = personnel.filter(person =>
    staffNamesMatch(person.ho_ten, 'Văn Nam') && branchKey(person.co_so || '') === 'bac ninh',
  );
  const retainedProfiles = vanNamProfiles.filter(person => person.id.startsWith('91c46df1-'));
  const retiredProfiles = vanNamProfiles.filter(person =>
    person.id.startsWith('00000000-') && person.id.endsWith('95da9a5b'),
  );
  const pair = retainedProfiles.length === 1 && retiredProfiles.length === 1
    ? { retained: retainedProfiles[0], retired: retiredProfiles[0] }
    : null;

  const people = pair ? personnel.filter(person => person.id !== pair.retired.id) : personnel;
  const find = (reference: string) => {
    const person = personnel.find(candidate =>
      staffNamesMatch(reference, candidate.id) ||
      staffNamesMatch(reference, candidate.ho_ten) ||
      (candidate.id_nhan_su && staffNamesMatch(reference, candidate.id_nhan_su)),
    );
    return pair && person?.id === pair.retired.id ? pair.retained : person;
  };
  const references = (person: NhanSu | undefined) => {
    if (!person) return [];
    const aliases = pair && person.id === pair.retained.id ? [pair.retired.id, pair.retired.id_nhan_su] : [];
    return [person.ho_ten, person.id, person.id_nhan_su, ...aliases].filter((value): value is string => Boolean(value));
  };
  return { people, find, references };
}

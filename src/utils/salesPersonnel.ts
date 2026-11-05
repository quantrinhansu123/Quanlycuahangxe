export interface SalesPersonnelIdentity {
  id?: string | null;
  auth_user_id?: string | null;
  id_nhan_su?: string | null;
  ho_ten: string;
  vi_tri?: string | null;
  co_so?: string | null;
}

export interface ResolvedSalesPersonnel {
  ho_ten: string;
  vi_tri?: string;
  co_so?: string;
}

export function resolveSalesPersonnelTokens(
  rawStaff: string,
  personnel: readonly SalesPersonnelIdentity[],
): ResolvedSalesPersonnel[] {
  const byAlias = new Map<string, SalesPersonnelIdentity>();
  personnel.forEach(person => {
    [person.id, person.auth_user_id, person.id_nhan_su, person.ho_ten].forEach(alias => {
      const key = alias?.trim().toLocaleLowerCase();
      if (key) byAlias.set(key, person);
    });
  });

  return rawStaff.split(',').map(value => value.trim()).filter(Boolean).map(token => {
    const person = byAlias.get(token.toLocaleLowerCase());
    return person
      ? { ho_ten: person.ho_ten, vi_tri: person.vi_tri ?? undefined, co_so: person.co_so ?? undefined }
      : { ho_ten: token };
  });
}

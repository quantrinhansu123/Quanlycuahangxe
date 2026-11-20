export function routePageKey(pathname: string): string {
  return pathname === '/bao-cao' || pathname.startsWith('/bao-cao/') ? '/bao-cao' : pathname;
}

import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { parse } from 'dotenv';

export const evidenceDir = new URL('../docs/performance-sales-p0/', import.meta.url);
export async function managementRead(query) {
  const local = parse(await readFile(new URL('../.env.local', import.meta.url), 'utf8'));
  const token = local.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Missing management read access');
  const env = parse(await readFile(new URL('../.env', import.meta.url), 'utf8'));
  const project = new URL(env.VITE_SUPABASE_URL).hostname.split('.')[0];
  // All remote work is read-only. No migration is sent to this endpoint.
  const started = performance.now();
  const response = await fetch(`https://api.supabase.com/v1/projects/${project}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: `BEGIN READ ONLY; SET LOCAL statement_timeout = '3s'; ${query}; ROLLBACK;`, read_only: true }),
    signal: AbortSignal.timeout(20000),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`Read-only SQL ${response.status}: ${raw.replaceAll(token, '[redacted]').slice(0, 500)}`);
  return { rows: JSON.parse(raw), httpMs: Math.round(performance.now() - started), bytes: Buffer.byteLength(raw), status: response.status };
}

if (process.argv.includes('--snapshot')) {
  await mkdir(evidenceDir, { recursive: true });
  const result = await managementRead(`SELECT p.proname name, p.oid::regprocedure::text signature,
    p.provolatile, p.prosecdef, p.proacl, pg_get_functiondef(p.oid) definition
    FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN
    ('sales_query','app_sales_rows_searched','app_sales_first_dates','app_customer_rows','app_customer_matches') ORDER BY p.proname`);
  await writeFile(new URL('definitions-before.json', evidenceDir), JSON.stringify(result.rows, null, 2) + '\n');
  const changed = result.rows.filter(r => ['sales_query', 'app_sales_rows_searched', 'app_sales_first_dates'].includes(r.name));
  await writeFile(new URL('../../supabase/rollback/202610040001_sales_p0.sql', import.meta.url),
    '-- Exported before P0 from the live catalog; restore definitions before removing the new helpers.\nBEGIN;\n' +
    changed.map(r => r.definition.trim() + ';').join('\n\n') + `
DROP FUNCTION IF EXISTS public.app_sales_filtered_typed(date,date,text,text,text,text,text);
DROP FUNCTION IF EXISTS public.app_sales_page_json(uuid,text,text,text,numeric,text[]);
DROP FUNCTION IF EXISTS public.app_sales_first_dates_for_keys(text[]);
DROP FUNCTION IF EXISTS public.app_sales_customer_identities(boolean);
NOTIFY pgrst, 'reload schema';
COMMIT;
`);
  console.log(JSON.stringify({ functionsExported: result.rows.length, signatures: result.rows.map(r => r.signature), status: result.status }));
}

-- Manual SQL Editor / psql diagnostics, NOT a schema migration.
-- Run sections separately; retain before/after output with role and timestamp.
-- No writes to application data and no global settings/connection termination.
BEGIN READ ONLY;
SET LOCAL search_path = public, extensions, pg_catalog;
SET LOCAL lock_timeout = '2s';

SELECT now() captured_at, current_user, version();
SELECT name, setting, unit, source FROM pg_settings
WHERE name IN ('max_connections', 'superuser_reserved_connections', 'reserved_connections',
  'statement_timeout', 'idle_in_transaction_session_timeout', 'work_mem',
  'log_min_duration_statement', 'track_io_timing', 'pg_stat_statements.track')
ORDER BY name;

-- Includes role/database overrides; unset pool settings may be managed outside SQL.
SELECT coalesce(r.rolname, '*') role_name, coalesce(d.datname, '*') database_name, cfg
FROM pg_db_role_setting s
LEFT JOIN pg_roles r ON r.oid = s.setrole
LEFT JOIN pg_database d ON d.oid = s.setdatabase
CROSS JOIN LATERAL unnest(s.setconfig) cfg
WHERE cfg LIKE '%statement_timeout=%' OR cfg LIKE 'pgrst.db_pool%'
ORDER BY 1, 2, 3;

-- This counts Postgres backends across the instance, NOT pooler waiting clients.
SELECT datname, usename, application_name, state, count(*) connections
FROM pg_stat_activity WHERE backend_type = 'client backend'
GROUP BY datname, usename, application_name, state ORDER BY connections DESC;
SELECT pid, usename, application_name, state, wait_event_type, wait_event,
  now() - xact_start transaction_age, now() - query_start query_age,
  pg_blocking_pids(pid) blocking_pids
FROM pg_stat_activity
WHERE pid <> pg_backend_pid() AND backend_type = 'client backend'
  AND (state LIKE 'idle in transaction%' OR cardinality(pg_blocking_pids(pid)) > 0
    OR (state = 'active' AND now() - query_start > interval '1 second'))
ORDER BY xact_start NULLS LAST LIMIT 50;

SELECT relname, n_live_tup, n_dead_tup, last_analyze, last_autoanalyze, last_autovacuum
FROM pg_stat_user_tables WHERE schemaname = 'public'
ORDER BY n_live_tup DESC LIMIT 25;
SELECT s.relname, s.indexrelname, s.idx_scan, i.indisvalid, i.indisready,
  pg_size_pretty(pg_relation_size(s.indexrelid)) index_size, pg_get_indexdef(s.indexrelid) definition
FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid
WHERE s.schemaname = 'public'
  AND s.relname IN ('khach_hang','the_ban_hang','the_ban_hang_ct','thu_chi','cham_cong')
ORDER BY s.relname, s.indexrelname;
SELECT c.relname, p.polname, pg_get_expr(p.polqual, p.polrelid) using_expression
FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relnamespace = 'public'::regnamespace
  AND c.relname IN ('khach_hang','the_ban_hang','the_ban_hang_ct','thu_chi','cham_cong');

-- Save these definitions outside the DB before deploying so rollback uses the
-- LIVE version and its existing ACL, rather than overwriting with an older file.
SELECT p.oid::regprocedure function_signature, p.prosecdef security_definer, p.proacl,
  pg_get_functiondef(p.oid) definition
FROM pg_proc p WHERE p.oid IN (
  'public.customer_order_stats(text[])'::regprocedure,
  'public.sales_query(text,date,date,text,text,integer,integer,text,text)'::regprocedure);
ROLLBACK;

-- pg_stat_statements is normally installed by Supabase. If absent or not in
-- public/extensions, use the namespace shown by pg_extension and run separately.
BEGIN READ ONLY;
SET LOCAL search_path = public, extensions, pg_catalog;
SELECT e.extname, n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE e.extname IN ('pg_stat_statements','pg_trgm');
SELECT userid::regrole role_name, queryid, calls, total_exec_time, mean_exec_time,
  max_exec_time, rows, shared_blks_hit, shared_blks_read, temp_blks_written, left(query, 500) query
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
  AND (query ILIKE '%sales_query%' OR query ILIKE '%customer_order_stats%'
    OR query ILIKE '%customers_query%' OR query ILIKE '%the_ban_hang_ct%')
ORDER BY total_exec_time DESC LIMIT 25;
ROLLBACK;

-- READ ONLY EXPLAIN: execution is real but bounded by this transaction's timeout.
-- SQL Editor normally runs as owner (bypasses RLS); use the actual app role and
-- request.headers/request.jwt.claims for a second run matching the user's scope.
-- Example for internal sessions (set privately, don't commit real credentials):
-- SELECT set_config('request.headers', jsonb_build_object('x-app-session', '<session>')::text, true);
-- SET LOCAL ROLE anon;
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '2s';
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)
SELECT public.sales_query(p_start => date_trunc('month', current_date)::date,
  p_end => current_date, p_page => 1, p_limit => 20);
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)
SELECT public.sales_query(p_page => 1, p_limit => 20);
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)
SELECT public.customer_order_stats(ARRAY[]::text[]);
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)
SELECT public.customer_order_stats(ARRAY(
  SELECT k.id::text FROM public.khach_hang k
  WHERE EXISTS (SELECT 1 FROM public.the_ban_hang s
    WHERE lower(btrim(s.khach_hang_id)) IN (k.id::text, lower(btrim(k.ma_khach_hang))))
  ORDER BY k.id LIMIT 1));

-- Actual raw ILIKE predicates used by shortNumericSearchData; use representative
-- terms from the slow request locally rather than committing customer identifiers.
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)
SELECT id FROM public.khach_hang
WHERE bien_so_xe ILIKE '%3743%' OR ma_khach_hang ILIKE '%3743%';
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)
SELECT id FROM public.the_ban_hang
WHERE id_bh ILIKE '%3743%' OR khach_hang_id ILIKE '%3743%';
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)
SELECT id FROM public.the_ban_hang_ct
WHERE ngay >= current_date - 7 AND ngay <= current_date ORDER BY id LIMIT 1000;
EXPLAIN (ANALYZE, BUFFERS, SETTINGS, FORMAT JSON)
SELECT id FROM public.thu_chi
WHERE ngay >= current_date - 7 AND ngay <= current_date ORDER BY ngay, id LIMIT 1000;
ROLLBACK;

// Each statement is capped at 6s, below the analyst default. Separating the OLD
// and NEW computations prevents the validation query from timing out on their
// combined cost. REPEATABLE READ guarantees one business-data snapshot.
export function roleParitySql(oldSql,newSql,role){
  if(!['anon','authenticated'].includes(role))throw new Error('Unexpected role');
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
    SET LOCAL statement_timeout='6s'; SET LOCAL ROLE ${role};
    DO $p05_parity$ BEGIN PERFORM set_config('p05.old_result',(${oldSql})::text,true); END; $p05_parity$;
    WITH new_result AS MATERIALIZED (${newSql}) SELECT
      current_setting('p05.old_result')::jsonb=new_result.result equal,
      (new_result.result->>'totalCount')::integer count,current_user role,
      current_setting('statement_timeout') statement_timeout
    FROM new_result; ROLLBACK;`;
}

BEGIN;
DROP FUNCTION public.financial_p2_query(integer,integer,text,text[],text[],date,date,boolean);
DROP FUNCTION public.app_financial_p2_rows(text,text[],text[],date,date);
DROP FUNCTION public.sales_p2_lookup(text[]);
DROP FUNCTION public.app_sales_p2_rows_for_refs(text[]);
NOTIFY pgrst,'reload schema';
COMMIT;

/**
 * Shared SQL definitions for the execute_sql RPC function.
 * Single source of truth - used by both client initialization and manual install tool.
 */

// Drop old function versions to avoid overload conflicts
export const DROP_OLD_EXECUTE_SQL_FUNCTIONS = `
DO $$
BEGIN
    -- Drop all previous versions to avoid overload conflicts
    DROP FUNCTION IF EXISTS public.execute_sql(text, boolean);
    DROP FUNCTION IF EXISTS public.execute_sql(text);
END $$;
`;

export const CREATE_EXECUTE_SQL_FUNCTION = `
CREATE OR REPLACE FUNCTION public.execute_sql(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result jsonb;
    cleaned_query text;
    affected_rows integer;
    is_read_query boolean;
BEGIN
    -- Remove trailing semicolons and whitespace from query
    cleaned_query := regexp_replace(trim(query), ';\\s*$', '');

    -- Auto-detect: treat as read query if starts with SELECT/WITH/SHOW/EXPLAIN/DESCRIBE/TABLE
    is_read_query := cleaned_query ~* '^[[:space:]]*(SELECT|WITH|SHOW|EXPLAIN|DESCRIBE|TABLE)';

    IF is_read_query THEN
        -- Read query: return results as JSON array
        EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || cleaned_query || ') t' INTO result;
    ELSE
        -- Write query (INSERT/UPDATE/DELETE): execute and return affected rows count
        EXECUTE cleaned_query;
        GET DIAGNOSTICS affected_rows = ROW_COUNT;
        result := jsonb_build_array(jsonb_build_object('affected_rows', affected_rows));
    END IF;

    RETURN COALESCE(result, '[]'::jsonb);
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Error executing SQL (SQLSTATE: %): %', SQLSTATE, SQLERRM;
END;
$$;
`;

export const GRANT_EXECUTE_SQL_FUNCTION = `
-- SECURITY: do NOT expose arbitrary SQL execution to anon/authenticated roles.
REVOKE EXECUTE ON FUNCTION public.execute_sql(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.execute_sql(text) TO service_role;
`;

export const NOTIFY_POSTGREST = `NOTIFY pgrst, 'reload schema';`;

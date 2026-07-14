import { z } from 'zod';
import type { SqlExecutionResult, SqlErrorResponse } from '../types/index.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { SelfhostedSupabaseClient } from '../client/index.js';
import {
    DROP_OLD_EXECUTE_SQL_FUNCTIONS,
    CREATE_EXECUTE_SQL_FUNCTION,
    GRANT_EXECUTE_SQL_FUNCTION,
    NOTIFY_POSTGREST,
} from '../sql/execute_sql_function.js';

const execFileAsync = promisify(execFile);

async function execPostgresMetaQuery(
    postgresMetaUrl: string,
    apiKey: string,
    query: string,
    action: string
): Promise<void> {
    const response = await fetch(postgresMetaUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': apiKey,
        },
        body: JSON.stringify({ query }),
    });

    const responseText = await response.text().catch(() => '');

    if (!response.ok) {
        throw new Error(`${action} failed (${response.status}): ${responseText || response.statusText}`);
    }

    // Defensive: some deployments may return an error payload with a 2xx status.
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json') && responseText) {
        let parsed: unknown;
        try {
            parsed = JSON.parse(responseText) as unknown;
        } catch {
            parsed = undefined;
        }
        if (parsed && typeof parsed === 'object' && 'error' in parsed) {
            throw new Error(`${action} failed: ${responseText}`);
        }
    }
}

/**
 * Type guard to check if a SQL execution result is an error response.
 */
export function isSqlErrorResponse(result: SqlExecutionResult): result is SqlErrorResponse {
    return (result as SqlErrorResponse).error !== undefined;
}

/**
 * Handles SQL execution results and validates them against the expected schema.
 * Throws an error if the result contains an error or doesn't match the schema.
 */
export function handleSqlResponse<T>(result: SqlExecutionResult, schema: z.ZodSchema<T>): T {
    // Check if the result contains an error
    if ('error' in result) {
        throw new Error(`SQL Error (${result.error.code}): ${result.error.message}`);
    }

    // Validate the result against the schema
    try {
        return schema.parse(result);
    } catch (validationError) {
        if (validationError instanceof z.ZodError) {
            throw new Error(`Schema validation failed: ${validationError.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
        }
        throw new Error(`Unexpected validation error: ${validationError}`);
    }
}

/**
 * Executes an external shell command asynchronously.
 * Returns stdout, stderr, and any execution error.
 */
export async function runExternalCommand(command: string, args: readonly string[]): Promise<{
    stdout: string;
    stderr: string;
    error: Error | null;
}> {
    try {
        const { stdout, stderr } = await execFileAsync(command, [...args], {
            maxBuffer: 10 * 1024 * 1024,
        });
        return { stdout, stderr, error: null };
    } catch (error: unknown) {
        const execError = error as Error & { stdout?: string; stderr?: string };
        return {
            stdout: execError.stdout || '',
            stderr: execError.stderr || execError.message, // Use message if stderr is empty
            error: execError,
        };
    }
}

/**
 * Attempts to install the execute_sql RPC function using postgres-meta API.
 * Returns true if installation succeeded, false otherwise.
 */
async function tryInstallRpcFunction(client: SelfhostedSupabaseClient): Promise<boolean> {
    console.warn('Attempting to auto-install execute_sql RPC function...');

    try {
        const supabaseUrl = client.getSupabaseUrl();
        const serviceKey = client.getServiceRoleKey();

        if (!serviceKey) {
            console.error('Auto-install failed: Service role key not available');
            return false;
        }

        const postgresMetaUrl = `${supabaseUrl}/pg/query`;

        // 0. Drop old function versions first (avoid overload conflicts)
        console.warn('Dropping old function versions...');
        await execPostgresMetaQuery(
            postgresMetaUrl,
            serviceKey,
            DROP_OLD_EXECUTE_SQL_FUNCTIONS,
            'Dropping old function versions'
        );

        // 1. Create function
        await execPostgresMetaQuery(
            postgresMetaUrl,
            serviceKey,
            CREATE_EXECUTE_SQL_FUNCTION,
            'Creating execute_sql function'
        );

        // 2. Grant permissions
        await execPostgresMetaQuery(
            postgresMetaUrl,
            serviceKey,
            GRANT_EXECUTE_SQL_FUNCTION,
            'Granting execute_sql permissions'
        );

        // 3. Notify PostgREST
        try {
            await execPostgresMetaQuery(
                postgresMetaUrl,
                serviceKey,
                NOTIFY_POSTGREST,
                'Notifying PostgREST to reload schema'
            );
        } catch (notifyError) {
            console.error('Warning: Failed to notify PostgREST to reload schema. You may need to restart PostgREST or wait a few seconds:', notifyError);
            // Not fatal: function may still become available after a delay depending on deployment.
        }

        // Update client state
        client.setRpcAvailable(true);
        console.warn('Auto-install succeeded! RPC function is now available.');
        return true;
    } catch (error) {
        console.error('Auto-install failed with exception:', error);
        console.error('Note: The function may have been partially created. Try running install_execute_sql_function manually, or restart PostgREST, then retry.');
        return false;
    }
}

/**
 * Executes SQL using the best available method: direct database connection first, then RPC fallback.
 * This bypasses JWT authentication issues when direct database access is available.
 *
 * If RPC function is not found, automatically attempts to install it and retry once.
 */
export async function executeSqlWithFallback(
    client: SelfhostedSupabaseClient,
    sql: string
): Promise<SqlExecutionResult> {
    // Try direct database connection first (bypasses JWT authentication)
    if (client.isPgAvailable()) {
        console.warn('Using direct database connection (bypassing JWT)...');
        return await client.executeSqlWithPg(sql);
    }

    // Fallback to RPC if direct connection not available
    console.warn('Falling back to RPC method...');
    const result = await client.executeSqlViaRpc(sql);

    // Check if RPC function is missing and auto-install is possible
    if (isSqlErrorResponse(result) &&
        result.error.code === 'MCP_CLIENT_ERROR' &&
        result.error.message.includes('RPC function not found')) {

        console.warn('RPC function not found. Attempting auto-install and retry...');

        // Try to install the RPC function
        const installed = await tryInstallRpcFunction(client);

        if (installed) {
            // Wait a moment for PostgREST to reload schema
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Retry the original query
            console.warn('Retrying SQL execution after auto-install...');
            return await client.executeSqlViaRpc(sql);
        }

        // Installation failed, return original error with helpful message
        return {
            error: {
                code: 'MCP_CLIENT_ERROR',
                message: 'execute_sql RPC function not found. Auto-install failed. Please run install_execute_sql_function tool manually, or restart PostgREST, or configure DATABASE_URL for direct connection.',
            }
        };
    }

    return result;
}

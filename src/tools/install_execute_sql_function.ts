/**
 * Install execute_sql RPC Function Tool
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ToolContext } from './types.js';
import {
    DROP_OLD_EXECUTE_SQL_FUNCTIONS,
    CREATE_EXECUTE_SQL_FUNCTION,
    GRANT_EXECUTE_SQL_FUNCTION,
    NOTIFY_POSTGREST,
} from '../sql/execute_sql_function.js';

// Input schema
const InstallExecuteSqlFunctionInputZodSchema = z.object({});

type InstallExecuteSqlFunctionInput = z.infer<typeof InstallExecuteSqlFunctionInputZodSchema>;

// Output schema
const InstallExecuteSqlFunctionOutputZodSchema = z.object({
    success: z.boolean(),
    message: z.string(),
});

type InstallExecuteSqlFunctionOutput = z.infer<typeof InstallExecuteSqlFunctionOutputZodSchema>;

/**
 * Install execute_sql RPC function using postgres-meta API
 */
async function execute(
    input: InstallExecuteSqlFunctionInput,
    context: ToolContext
): Promise<InstallExecuteSqlFunctionOutput> {
    const client = context.selfhostedClient;

    context.log('Installing execute_sql RPC function...', 'info');

    try {
        // Get Supabase URL and service key
        const supabaseUrl = client.getSupabaseUrl();
        const serviceKey = client.getServiceRoleKey();

        if (!serviceKey) {
            throw new Error('Service role key is required to install the execute_sql function');
        }

        // Use postgres-meta API to execute SQL
        const postgresMetaUrl = `${supabaseUrl}/pg/query`;

        // 0. Drop old function versions first (avoid overload conflicts)
        context.log('Dropping old function versions...', 'info');
        await fetch(postgresMetaUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
            },
            body: JSON.stringify({ query: DROP_OLD_EXECUTE_SQL_FUNCTIONS }),
        });

        // 1. Create function
        context.log('Creating execute_sql function...', 'info');
        const createResponse = await fetch(postgresMetaUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
            },
            body: JSON.stringify({ query: CREATE_EXECUTE_SQL_FUNCTION }),
        });

        if (!createResponse.ok) {
            const errorText = await createResponse.text();
            throw new Error(`Failed to create function: ${createResponse.status} ${errorText}`);
        }

        // 2. Grant permissions
        context.log('Granting permissions...', 'info');
        const grantResponse = await fetch(postgresMetaUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
            },
            body: JSON.stringify({ query: GRANT_EXECUTE_SQL_FUNCTION }),
        });

        if (!grantResponse.ok) {
            const errorText = await grantResponse.text();
            throw new Error(`Failed to grant permissions: ${grantResponse.status} ${errorText}`);
        }

        // 3. Notify PostgREST to reload schema
        context.log('Notifying PostgREST to reload schema...', 'info');
        const notifyResponse = await fetch(postgresMetaUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': serviceKey,
            },
            body: JSON.stringify({ query: NOTIFY_POSTGREST }),
        });

        if (!notifyResponse.ok) {
            const errorText = await notifyResponse.text();
            console.error(`Warning: Failed to notify PostgREST: ${notifyResponse.status} ${errorText}`);
            // Don't throw - this is not critical
        }

        context.log('execute_sql function installed successfully!', 'info');
        context.log('You may need to wait a few seconds for PostgREST to reload the schema.', 'info');

        // Update client state to reflect that RPC is now available
        client.setRpcAvailable(true);

        return {
            success: true,
            message: 'execute_sql function installed successfully. You can now use tools that require SQL execution (list_tables, execute_sql, etc.).',
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        context.log(`Error installing execute_sql function: ${errorMessage}`, 'error');
        throw new Error(`Failed to install execute_sql function: ${errorMessage}`);
    }
}

export const installExecuteSqlFunctionTool = {
    name: 'install_execute_sql_function',
    description: 'Install the execute_sql RPC function in the connected Supabase instance. This function is required for tools that need to execute SQL queries (list_tables, list_extensions, execute_sql, etc.). This tool uses the postgres-meta API and does not require direct database access.',
    inputSchema: InstallExecuteSqlFunctionInputZodSchema,
    mcpInputSchema: zodToJsonSchema(InstallExecuteSqlFunctionInputZodSchema),
    outputSchema: InstallExecuteSqlFunctionOutputZodSchema,
    execute,
};

export default installExecuteSqlFunctionTool;


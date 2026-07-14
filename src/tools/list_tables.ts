import { z } from 'zod';
import type { SelfhostedSupabaseClient } from '../client/index.js';
import { handleSqlResponse, executeSqlWithFallback } from './utils.js';
import type { ToolContext } from './types.js';

// Define the schema for the tool's output (an array of table names)
const ListTablesOutputSchema = z.array(z.object({
    schema: z.string(),
    name: z.string(),
    comment: z.string().nullable().optional(), // Add comment if available
}));

// Define input type from schema
const ListTablesInputSchema = z.object({ // No specific input needed for listing tables
    // Optional: add schema filter later if needed
    // schema: z.string().optional().describe('Filter tables by schema name.'),
});
type ListTablesInput = z.infer<typeof ListTablesInputSchema>;

// Static JSON Schema for MCP capabilities
const mcpInputSchema = {
    type: 'object', 
    properties: {},
    required: [],
};

// Define the tool
export const listTablesTool = {
    name: 'list_tables',
    description: 'Lists all accessible tables in the connected database, grouped by schema.',
    inputSchema: ListTablesInputSchema, // Use defined schema
    mcpInputSchema: mcpInputSchema,     // Add the static JSON schema for MCP
    outputSchema: ListTablesOutputSchema,
    // Use explicit types for input and context
    execute: async (input: ListTablesInput, context: ToolContext) => {
        const client = context.selfhostedClient;

        console.error('Listing tables using Supabase REST API introspection...');

        try {
            // Use PostgREST's introspection endpoint
            // PostgREST exposes an OpenAPI schema at the root endpoint
            // We can also try to use the RPC method if available, or fallback to SQL

            // First, try using SQL with fallback
            if (client.isPgAvailable() || client.isRpcAvailable()) {
                const listTablesSql = `
                    SELECT
                        table_schema as schema,
                        table_name as name,
                        NULL as comment
                    FROM
                        information_schema.tables
                    WHERE
                        table_type = 'BASE TABLE'
                        AND table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                        AND table_schema NOT LIKE 'pg_temp_%'
                        AND table_schema NOT LIKE 'pg_toast_temp_%'
                        AND table_schema NOT IN ('auth', 'storage', 'extensions', 'graphql', 'graphql_public', 'pgbouncer', 'realtime', 'supabase_functions', 'supabase_migrations', '_realtime')
                    ORDER BY
                        table_schema,
                        table_name
                `;

                const result = await executeSqlWithFallback(client, listTablesSql);
                return handleSqlResponse(result, ListTablesOutputSchema);
            }

            // If neither pg nor RPC is available, we can't list tables
            // Return a helpful error message
            context.log('Cannot list tables: requires either direct database access (DATABASE_URL) or execute_sql RPC function', 'error');
            throw new Error('Cannot list tables: requires either direct database access (DATABASE_URL) or execute_sql RPC function. Please provide DATABASE_URL or install the execute_sql RPC function in your Supabase instance.');

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            context.log(`Error listing tables: ${errorMessage}`, 'error');
            throw error;
        }
    },
};

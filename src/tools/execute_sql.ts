import { z } from 'zod';
import type { SelfhostedSupabaseClient } from '../client/index.js';
import { handleSqlResponse, executeSqlWithFallback } from './utils.js';
import type { ToolContext } from './types.js';

// Input schema
const ExecuteSqlInputSchema = z.object({
    sql: z.string().describe('The SQL query to execute.'),
});
type ExecuteSqlInput = z.infer<typeof ExecuteSqlInputSchema>;

// Output schema - expects an array of results (rows)
const ExecuteSqlOutputSchema = z.array(z.unknown()).describe('The array of rows returned by the SQL query.');

// Static JSON Schema for MCP capabilities
const mcpInputSchema = {
    type: 'object',
    properties: {
        sql: { type: 'string', description: 'The SQL query to execute.' },
    },
    required: ['sql'],
};

// The tool definition
export const executeSqlTool = {
    name: 'execute_sql',
    description: 'Executes an arbitrary SQL query against the database, using direct database connection when available or RPC function as fallback.',
    inputSchema: ExecuteSqlInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: ExecuteSqlOutputSchema,
    execute: async (input: ExecuteSqlInput, context: ToolContext) => {
        const client = context.selfhostedClient;

        console.error('Executing SQL query.');

        const result = await executeSqlWithFallback(client, input.sql);
        return handleSqlResponse(result, ExecuteSqlOutputSchema);
    },
};

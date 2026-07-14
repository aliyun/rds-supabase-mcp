import { z } from 'zod';

import type { ToolContext } from './types.js';
import { handleSqlResponse } from './utils.js';
import type { SqlExecutionResult } from '../types/index.js';

// Input schema (no parameters needed)
const ListRealtimePublicationsInputSchema = z.object({});
type ListRealtimePublicationsInput = z.infer<typeof ListRealtimePublicationsInputSchema>;

// Output schema based on pg_publication columns
const PublicationSchema = z.object({
    oid: z.number().int(),
    pubname: z.string(),
    pubowner: z.number().int(), // Owner OID
    puballtables: z.boolean(),
    pubinsert: z.boolean(),
    pubupdate: z.boolean(),
    pubdelete: z.boolean(),
    pubtruncate: z.boolean(),
    pubviaroot: z.boolean(),
    // Potentially add pubownername if needed via join
});
const ListRealtimePublicationsOutputSchema = z.array(PublicationSchema);
type ListRealtimePublicationsOutput = z.infer<typeof ListRealtimePublicationsOutputSchema>;

// Static JSON schema for MCP (no parameters)
export const mcpInputSchema = {
    type: 'object',
    properties: {},
    required: [],
};

// Tool definition
export const listRealtimePublicationsTool = {
    name: 'list_realtime_publications',
    description: 'Lists PostgreSQL publications, often used by Supabase Realtime.',
    mcpInputSchema,
    inputSchema: ListRealtimePublicationsInputSchema,
    outputSchema: ListRealtimePublicationsOutputSchema,

    execute: async (
        input: ListRealtimePublicationsInput,
        context: ToolContext
    ): Promise<ListRealtimePublicationsOutput> => {
        const client = context.selfhostedClient;
        console.error('Listing Realtime publications...');

        const sql = `
            SELECT
                oid,
                pubname,
                pubowner,
                puballtables,
                pubinsert,
                pubupdate,
                pubdelete,
                pubtruncate,
                pubviaroot
            FROM pg_catalog.pg_publication;
        `;

        // Try to execute SQL using available methods
        let result: SqlExecutionResult;

        if (client.isRpcAvailable()) {
            console.error('Listing publications using execute_sql RPC function...');
            result = await client.executeSqlViaRpc(sql);
        } else if (client.isPgAvailable()) {
            console.error('Listing publications using direct DB connection...');
            result = await client.executeSqlWithPg(sql);
        } else {
            context.log('Cannot list publications: requires either direct database access (DATABASE_URL) or execute_sql RPC function.', 'error');
            throw new Error('Cannot list publications: requires either direct database access (DATABASE_URL) or execute_sql RPC function.');
        }

        const validatedPublications = handleSqlResponse(result, ListRealtimePublicationsOutputSchema);

        console.error(`Found ${validatedPublications.length} publications.`);
        context.log(`Found ${validatedPublications.length} publications.`);
        return validatedPublications;
    },
};

export default listRealtimePublicationsTool;

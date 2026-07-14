import { z } from 'zod';

import type { ToolContext } from './types.js';
import { handleSqlResponse } from './utils.js';
import type { SqlExecutionResult, StorageBucket } from '../types/index.js';

// Zod schema for the bucket structure (Output Validation)
const BucketSchema = z.object({
    id: z.string(),
    name: z.string(),
    owner: z.string().nullable(),
    public: z.boolean(),
    avif_autodetection: z.boolean(),
    file_size_limit: z.number().nullable(),
    allowed_mime_types: z.array(z.string()).nullable(),
    // Keep timestamps as strings as returned by DB/pg
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
});

const ListStorageBucketsOutputSchema = z.array(BucketSchema);
type ListStorageBucketsOutput = StorageBucket[];

// Static JSON schema for MCP
export const mcpInputSchema = {
    type: 'object',
    properties: {},
    required: [],
};

// Zod schema for runtime input validation
const inputSchema = z.object({});
type Input = z.infer<typeof inputSchema>;

// Tool definition
export const listStorageBucketsTool = {
    name: 'list_storage_buckets',
    description: 'Lists all storage buckets in the project.',
    mcpInputSchema,
    inputSchema,
    outputSchema: ListStorageBucketsOutputSchema,

    execute: async (
        input: Input,
        context: ToolContext
    ): Promise<ListStorageBucketsOutput> => {
        const client = context.selfhostedClient;
        // Use console.error for operational logging
        console.error('Listing storage buckets...');

        const sql = `
            SELECT
                id,
                name,
                owner,
                public,
                avif_autodetection,
                file_size_limit,
                allowed_mime_types,
                created_at::text, -- Cast to text
                updated_at::text  -- Cast to text
            FROM storage.buckets;
        `;

        // Try to execute SQL using available methods
        let result: SqlExecutionResult;

        if (client.isRpcAvailable()) {
            console.error('Listing storage buckets using execute_sql RPC function...');
            result = await client.executeSqlViaRpc(sql);
        } else if (client.isPgAvailable()) {
            console.error('Listing storage buckets using direct DB connection...');
            result = await client.executeSqlWithPg(sql);
        } else {
            context.log('Cannot list storage buckets: requires either direct database access (DATABASE_URL) or execute_sql RPC function.', 'error');
            throw new Error('Cannot list storage buckets: requires either direct database access (DATABASE_URL) or execute_sql RPC function.');
        }

        // Validate and return using handler
        const validatedBuckets = handleSqlResponse(result, ListStorageBucketsOutputSchema);

        console.error(`Found ${validatedBuckets.length} buckets.`);
        context.log(`Found ${validatedBuckets.length} buckets.`); // Also log for MCP
        return validatedBuckets;
    },
};

// Default export for potential dynamic loading
export default listStorageBucketsTool;

import { z } from 'zod';

import type { ToolContext } from './types.js';
import { handleSqlResponse } from './utils.js';
import type { SqlExecutionResult } from '../types/index.js';

// Input schema
const ListStorageObjectsInputSchema = z.object({
    bucket_id: z.string().describe('The ID of the bucket to list objects from.'),
    limit: z.number().int().positive().optional().default(100).describe('Max number of objects to return'),
    offset: z.number().int().nonnegative().optional().default(0).describe('Number of objects to skip'),
    prefix: z.string().optional().describe('Filter objects by a path prefix (e.g., \'public/\')'),
});
type ListStorageObjectsInput = z.infer<typeof ListStorageObjectsInputSchema>;

// Output schema
const StorageObjectSchema = z.object({
    id: z.string().uuid(),
    name: z.string().nullable(), // Name can be null according to schema
    bucket_id: z.string(),
    owner: z.string().uuid().nullable(),
    version: z.string().nullable(),
    // Get mimetype directly from SQL extraction
    mimetype: z.string().nullable(), 
    // size comes from metadata
    size: z.coerce.number().int().nullable(),
    // Keep raw metadata as well
    metadata: z.record(z.unknown()).nullable(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(),
    last_accessed_at: z.string().nullable(),
});
const ListStorageObjectsOutputSchema = z.array(StorageObjectSchema);
type ListStorageObjectsOutput = z.infer<typeof ListStorageObjectsOutputSchema>;

// Static JSON schema for MCP
export const mcpInputSchema = {
    type: 'object',
    properties: {
        bucket_id: { type: 'string', description: 'The ID of the bucket to list objects from.' },
        limit: { type: 'number', description: 'Max number of objects to return', default: 100 },
        offset: { type: 'number', description: 'Number of objects to skip', default: 0 },
        prefix: { type: 'string', description: "Filter objects by a path prefix (e.g., 'public/')" },
    },
    required: ['bucket_id'],
};

// Tool definition
export const listStorageObjectsTool = {
    name: 'list_storage_objects',
    description: 'Lists objects within a specific storage bucket, optionally filtering by prefix.',
    mcpInputSchema,
    inputSchema: ListStorageObjectsInputSchema,
    outputSchema: ListStorageObjectsOutputSchema,

    execute: async (
        input: ListStorageObjectsInput,
        context: ToolContext
    ): Promise<ListStorageObjectsOutput> => {
        const client = context.selfhostedClient;
        const { bucket_id, limit, offset, prefix } = input;

        console.error(`Listing objects for bucket ${bucket_id} (Prefix: ${prefix || 'N/A'})...`);

        // Helper function to escape SQL string literals
        const escapeSqlString = (str: string): string => {
            return str.replace(/'/g, "''");
        };

        // Build SQL query with safe string escaping
        let sql = `
            SELECT
                id,
                name,
                bucket_id,
                owner,
                version,
                metadata ->> 'mimetype' AS mimetype,
                metadata ->> 'size' AS size,
                metadata,
                created_at::text,
                updated_at::text,
                last_accessed_at::text
            FROM storage.objects
            WHERE bucket_id = '${escapeSqlString(bucket_id)}'
        `;

        if (prefix) {
            sql += ` AND name LIKE '${escapeSqlString(prefix)}%'`;
        }

        sql += ' ORDER BY name ASC NULLS FIRST';
        sql += ` LIMIT ${limit}`;
        sql += ` OFFSET ${offset};`;

        // Try to execute SQL using available methods
        let result: SqlExecutionResult;

        if (client.isRpcAvailable()) {
            console.error('Listing storage objects using execute_sql RPC function...');
            result = await client.executeSqlViaRpc(sql);
        } else if (client.isPgAvailable()) {
            console.error('Listing storage objects using direct DB connection...');
            result = await client.executeSqlWithPg(sql);
        } else {
            context.log('Cannot list storage objects: requires either direct database access (DATABASE_URL) or execute_sql RPC function.', 'error');
            throw new Error('Cannot list storage objects: requires either direct database access (DATABASE_URL) or execute_sql RPC function.');
        }

        const objects = handleSqlResponse(result, ListStorageObjectsOutputSchema);

        console.error(`Found ${objects.length} objects.`);
        context.log(`Found ${objects.length} objects.`);
        return objects;
    },
};

export default listStorageObjectsTool;

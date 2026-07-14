import { z } from 'zod';
import type { ToolContext } from './types.js';
import { createContentApiClient } from '../integrations/content-api-client.js';

// Input schema
const SearchDocsInputSchema = z.object({
    graphql_query: z.string().describe('GraphQL query string to search Supabase documentation'),
});
type SearchDocsInput = z.infer<typeof SearchDocsInputSchema>;

// Output schema - GraphQL responses can vary, so we use a flexible schema
const SearchDocsOutputSchema = z.any().describe('GraphQL query results from Supabase documentation');

// Static JSON Schema for MCP capabilities
const mcpInputSchema = {
    type: 'object',
    properties: {
        graphql_query: {
            type: 'string',
            description: 'GraphQL query string to search Supabase documentation. Must be a valid GraphQL query.',
        },
    },
    required: ['graphql_query'],
};

/**
 * Search Supabase official documentation using GraphQL
 * 
 * This tool allows querying the Supabase documentation database using GraphQL.
 * It's useful for finding information about Supabase features, APIs, and best practices.
 * 
 * Note: This queries the official Supabase documentation, not your self-hosted instance.
 */
export const searchDocsTool = {
    name: 'search_docs',
    description: `Search the Supabase official documentation using GraphQL. Must be a valid GraphQL query.
You should default to calling this even if you think you already know the answer, since the documentation is always being updated.
This tool queries the official Supabase documentation to help users understand Supabase features, APIs, and best practices.`,
    inputSchema: SearchDocsInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: SearchDocsOutputSchema,
    execute: async (input: SearchDocsInput, context: ToolContext) => {
        // Debug: log the raw input
        context.log(`Raw input type: ${typeof input}`, 'info');
        context.log(`Raw input: ${JSON.stringify(input)}`, 'info');

        const { graphql_query } = input;

        context.log('Searching Supabase documentation...', 'info');
        context.log(`GraphQL query type: ${typeof graphql_query}`, 'info');
        context.log(`GraphQL query: ${graphql_query.substring(0, 100)}...`, 'info');

        try {
            // Create a new ContentApiClient instance
            const contentApiClient = createContentApiClient();

            // Execute the GraphQL query
            const result = await contentApiClient.query({ query: graphql_query });

            context.log('Documentation search completed successfully', 'info');
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            context.log(`Error searching documentation: ${errorMessage}`, 'error');
            throw new Error(`Failed to search Supabase documentation: ${errorMessage}`);
        }
    },
};


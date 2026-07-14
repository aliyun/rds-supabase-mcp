/**
 * Supabase Documentation Content API Client
 * Provides access to Supabase official documentation via GraphQL
 */

export interface ContentApiClient {
    loadSchema(): Promise<string>;
    query(params: { query: string }): Promise<unknown>;
}

/**
 * Client for querying Supabase official documentation
 */
export class SupabaseDocsApiClient implements ContentApiClient {
    private schemaCache: string | null = null;
    private readonly graphqlEndpoint: string;

    constructor(baseUrl: string = 'https://supabase.com/docs/api/graphql') {
        this.graphqlEndpoint = baseUrl;
    }

    /**
     * Load the GraphQL schema for Supabase documentation
     * Results are cached to avoid repeated requests
     */
    async loadSchema(): Promise<string> {
        if (this.schemaCache) {
            console.error('Using cached GraphQL schema');
            return this.schemaCache;
        }

        console.error(`Fetching GraphQL schema from ${this.graphqlEndpoint}...`);

        try {
            // 使用 GraphQL 查询获取 schema
            const response = await fetch(this.graphqlEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify({
                    query: '{ schema }',
                }),
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch schema: ${response.status} ${response.statusText}`);
            }

            const result = await response.json();

            if (result.errors) {
                throw new Error(
                    `GraphQL errors: ${result.errors.map((e: any) => e.message).join(', ')}`
                );
            }

            if (!result.data || typeof result.data.schema !== 'string') {
                throw new Error('Schema not found in GraphQL response');
            }

            const schema = result.data.schema;
            this.schemaCache = schema;
            console.error('GraphQL schema loaded and cached successfully');
            return schema;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Error loading GraphQL schema: ${errorMessage}`);
            throw new Error(`Failed to load Supabase documentation schema: ${errorMessage}`);
        }
    }

    /**
     * Execute a GraphQL query against Supabase documentation
     */
    async query(params: { query: string }): Promise<unknown> {
        console.error(`Executing GraphQL query against Supabase docs...`);

        const requestBody = {
            query: params.query,
        };

        try {
            const response = await fetch(this.graphqlEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`GraphQL query failed: ${response.status} ${response.statusText} - ${errorText}`);
            }

            const result = await response.json();

            // Check for GraphQL errors in the response
            if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
                const errorMessages = result.errors.map((err: any) => err.message).join(', ');
                throw new Error(`GraphQL errors: ${errorMessages}`);
            }

            console.error('GraphQL query executed successfully');
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Error executing GraphQL query: ${errorMessage}`);
            throw new Error(`Failed to query Supabase documentation: ${errorMessage}`);
        }
    }
}

/**
 * Factory function to create a ContentApiClient instance
 */
export function createContentApiClient(baseUrl?: string): ContentApiClient {
    return new SupabaseDocsApiClient(baseUrl);
}

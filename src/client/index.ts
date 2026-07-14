import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SelfhostedSupabaseClientOptions, SqlExecutionResult, SqlErrorResponse, SqlSuccessResponse } from '../types/index.js';
import { Pool } from 'pg'; // We'll need this later for direct DB access
import type { PoolClient } from 'pg'; // Import PoolClient type
import { UserAuthClient, type UserAuthClientConfig } from '../auth/index.js';
import { AuthMode } from '../config/index.js';

import {
    DROP_OLD_EXECUTE_SQL_FUNCTIONS,
    CREATE_EXECUTE_SQL_FUNCTION,
    GRANT_EXECUTE_SQL_FUNCTION,
    NOTIFY_POSTGREST,
} from '../sql/execute_sql_function.js';

/**
 * A client tailored for interacting with self-hosted Supabase instances.
 * Handles both Supabase API interactions and direct database connections.
 */
export class SelfhostedSupabaseClient {
    private options: SelfhostedSupabaseClientOptions;
    public supabase: SupabaseClient;
    private pgPool: Pool | null = null; // Lazy initialized pool for direct DB access
    private rpcFunctionExists = false;

    /** The authentication mode this client was created with */
    private authMode: AuthMode;
    /** User authentication client (only set for AuthMode.SINGLE_INSTANCE_USER) */
    private userAuthClient: UserAuthClient | null = null;

    /**
     * Creates an instance of SelfhostedSupabaseClient.
     * Note: Call initialize() after creating the instance to check for RPC functions.
     * @param options - Configuration options for the client.
     * @param authMode - The authentication mode (defaults to SINGLE_INSTANCE_ADMIN)
     * @param userAuthClient - Optional UserAuthClient for user-level authentication
     */
    private constructor(
        options: SelfhostedSupabaseClientOptions,
        authMode: AuthMode = AuthMode.SINGLE_INSTANCE_ADMIN,
        userAuthClient: UserAuthClient | null = null
    ) {
        this.options = options;
        this.authMode = authMode;
        this.userAuthClient = userAuthClient;

        // Validate required options
        if (!options.supabaseUrl || !options.supabaseAnonKey) {
            throw new Error('Supabase URL and Anon Key are required.');
        }

        // Initialize the primary Supabase client based on auth mode
        if (userAuthClient) {
            // For user-level auth, use the authenticated client from UserAuthClient
            this.supabase = userAuthClient.getSupabaseClient();
        } else {
            // Use service role key if available (required for Admin API), otherwise use anon key
            const apiKey = options.supabaseServiceRoleKey || options.supabaseAnonKey;
            this.supabase = createClient(options.supabaseUrl, apiKey, options.supabaseClientOptions);
        }
    }

    /**
     * Factory function to create and asynchronously initialize the client.
     * Checks for the existence of the helper RPC function.
     * 
     * @param options - Configuration options for the client
     * @param authMode - The authentication mode (defaults to SINGLE_INSTANCE_ADMIN for backward compatibility)
     */
    public static async create(
        options: SelfhostedSupabaseClientOptions,
        authMode: AuthMode = AuthMode.SINGLE_INSTANCE_ADMIN
    ): Promise<SelfhostedSupabaseClient> {
        const client = new SelfhostedSupabaseClient(options, authMode);
        await client.initialize();
        return client;
    }

    /**
     * Factory function to create a client with user-level authentication.
     * This creates a client that operates under the user's RLS permissions.
     * 
     * @param config - User authentication configuration
     * @returns A SelfhostedSupabaseClient using the authenticated user's session
     * @throws Error if user authentication fails
     */
    public static async createWithUserAuth(config: UserAuthClientConfig): Promise<SelfhostedSupabaseClient> {
        // Create and initialize the user auth client first
        const userAuthClient = await UserAuthClient.create(config);
        
        // Create options for the SelfhostedSupabaseClient
        const options: SelfhostedSupabaseClientOptions = {
            supabaseUrl: config.supabaseUrl,
            supabaseAnonKey: config.supabaseAnonKey,
            // Note: No service role key for user-level auth
        };

        // Create the client with user auth
        const client = new SelfhostedSupabaseClient(
            options,
            AuthMode.SINGLE_INSTANCE_USER,
            userAuthClient
        );
        
        // Initialize without trying to create RPC function (user doesn't have permission)
        await client.initializeForUserAuth();
        
        return client;
    }

    /**
     * Initialize client for user-level authentication.
     * Skips RPC function creation since user doesn't have admin permissions.
     */
    private async initializeForUserAuth(): Promise<void> {
        console.error('Initializing SelfhostedSupabaseClient for user-level authentication...');

        // For user auth, we only check if RPC function exists, don't try to create it
        try {
            // Try to call the RPC function with a simple query
            const { error } = await this.supabase.rpc('execute_sql', {
                query: 'SELECT 1',
            });

            this.rpcFunctionExists = !error;
            if (error) {
                console.error('RPC function not available for user auth mode:', error.message);
            } else {
                console.error('RPC function available for user auth mode.');
            }
        } catch (err) {
            console.error('RPC function check failed:', err);
            this.rpcFunctionExists = false;
        }

        console.error('User auth initialization complete.');
    }

    /**
     * Initializes the client by checking for the required RPC function.
     * Attempts to create the function if it doesn't exist and a service role key is provided.
     */
    public async initialize(): Promise<void> {
        console.error('Initializing SelfhostedSupabaseClient...');
        try {
            await this.checkAndCreateRpcFunction();
            console.error(`RPC function 'public.execute_sql' status: ${this.rpcFunctionExists ? 'Available' : 'Unavailable'}`);
        } catch (error) {
            console.error('Error during client initialization:', error);
            // Decide if we should throw or allow continuation without RPC
            // For now, let's log and continue, executeSqlViaRpc will throw if needed
        }
        console.error('Initialization complete.');
    }

    // --- Public Methods (to be implemented) ---

    /**
     * Executes SQL using the preferred RPC method.
     */
    public async executeSqlViaRpc(query: string): Promise<SqlExecutionResult> {
        if (!this.rpcFunctionExists) {
            // This should ideally not be hit if initialize() succeeded and the function
            // was expected to be available, but good to have a check.
            console.error('Attempted to call executeSqlViaRpc, but RPC function is not available.');
            return {
                error: {
                    message: 'execute_sql RPC function not found or client not properly initialized.',
                    code: 'MCP_CLIENT_ERROR',
                },
            } as SqlErrorResponse;
        }

        console.error('Executing SQL via RPC.');

        try {
            const { data, error } = await this.supabase.rpc('execute_sql', { query });

            if (error) {
                console.error('Error executing SQL via RPC:', error);
                // Attempt to conform to SqlErrorResponse structure
                return {
                    error: {
                        message: error.message,
                        code: error.code, // Propagate Supabase/PostgREST error code
                        details: error.details,
                        hint: error.hint,
                    },
                };
            }

            // The RPC function returns JSONB which Supabase client parses.
            // We expect it to be an array of objects (records).
            // Add a type check for safety, although the RPC function should guarantee the shape.
            if (Array.isArray(data)) {
                 // Explicitly cast to expected success type
                return data as SqlSuccessResponse;
            }
            // If it's not an array, something went wrong with the RPC function's output
            console.error('Unexpected response format from execute_sql RPC:', data);
            return {
                error: {
                    message: 'Unexpected response format from execute_sql RPC. Expected JSON array.',
                    code: 'MCP_RPC_FORMAT_ERROR',
                },
             } as SqlErrorResponse;
        } catch (rpcError: unknown) {
            const errorMessage = rpcError instanceof Error ? rpcError.message : String(rpcError);
             console.error('Exception during executeSqlViaRpc call:', rpcError);
            return {
                error: {
                    message: `Exception during RPC call: ${errorMessage}`,
                    code: 'MCP_RPC_EXCEPTION',
                },
            } as SqlErrorResponse;
        }
    }

    /**
     * Executes SQL directly against the database using the pg library.
     * Requires DATABASE_URL to be configured.
     * Useful for simple queries when RPC is unavailable or direct access is preferred.
     * NOTE: Does not support transactions or parameterization directly.
     * Consider executeTransactionWithPg for more complex operations.
     */
    public async executeSqlWithPg(query: string): Promise<SqlExecutionResult> {
        if (!this.options.databaseUrl) {
            return { error: { message: 'DATABASE_URL is not configured. Cannot execute SQL directly.', code: 'MCP_CONFIG_ERROR' } };
        }
        await this.ensurePgPool(); // Ensure pool is initialized
        if (!this.pgPool) { // Should not happen if ensurePgPool works, but type guard
             return { error: { message: 'pg Pool not available after initialization attempt.', code: 'MCP_POOL_ERROR' } };
        }

        let client: PoolClient | undefined;
        try {
            client = await this.pgPool.connect();
            console.error('Executing SQL via direct PostgreSQL connection.');
            const result = await client.query(query);
            // Return result in a format consistent with SqlSuccessResponse
            // Assuming result.rows is the desired data array
            return result.rows as SqlSuccessResponse;
        } catch (dbError: unknown) {
            const error = dbError instanceof Error ? dbError : new Error(String(dbError));
            console.error('Error executing SQL with pg:', error);
            // Try to extract code if possible (pg errors often have a .code property)
            const code = (dbError as { code?: string })?.code || 'PG_ERROR';
            return { error: { message: error.message, code: code } };
        } finally {
            client?.release();
        }
    }

    /**
     * Encodes special characters in database URL to prevent parsing errors
     * Handles characters like #, $ that may cause issues with pg library
     */
    private encodeDatabaseUrl(url: string): string {
        try {
            // Parse the URL to separate components
            const parsedUrl = new URL(url);
            
            // Encode special characters in password and username
            if (parsedUrl.username) {
                parsedUrl.username = encodeURIComponent(parsedUrl.username);
            }
            
            if (parsedUrl.password) {
                parsedUrl.password = encodeURIComponent(parsedUrl.password);
            }
            
            // Reconstruct the URL
            return parsedUrl.toString();
        } catch (error) {
            // If URL parsing fails, apply basic encoding to common problematic characters
            // We don't encode @ as it's a delimiter in the URL
            console.error('Database URL contains special characters. Applying basic encoding (excluding @).');
            return url
                .replace(/#/g, '%23')   // Encode # as %23
                .replace(/\$/g, '%24'); // Encode $ as %24
        }
    }

    /**
     * Ensures the pg connection pool is initialized.
     * Should be called before accessing this.pgPool.
     */
    private async ensurePgPool(): Promise<void> {
        if (this.pgPool) return;
        if (!this.options.databaseUrl) {
            throw new Error('DATABASE_URL is not configured. Cannot initialize pg pool.');
        }

        console.error('Initializing pg pool...');
        // Use encoded URL to prevent special character issues
        const encodedDbUrl = this.encodeDatabaseUrl(this.options.databaseUrl);
        this.pgPool = new Pool({ connectionString: encodedDbUrl });

        this.pgPool.on('error', (err, client) => {
            console.error('PG Pool Error: Unexpected error on idle client', err);
            // Optional: Implement logic to handle pool errors, e.g., attempt to reset pool
        });

        // Test connection?
        try {
            const client = await this.pgPool.connect();
            console.error('pg pool connected successfully.');
            client.release();
        } catch (err) {
            console.error('Failed to connect pg pool:', err);
            // Clean up pool if connection fails?
            await this.pgPool.end();
            this.pgPool = null;
            throw new Error(`Failed to connect pg pool: ${err instanceof Error ? err.message : String(err)}`);
        }
    }

     /**
     * Executes a series of operations within a single database transaction using the pg library.
     * Requires DATABASE_URL to be configured.
     * @param callback A function that receives a connected pg client and performs queries.
     *                 It should return a promise that resolves on success or rejects on failure.
     *                 The transaction will be committed if the promise resolves,
     *                 and rolled back if it rejects.
     */
    public async executeTransactionWithPg<T>(
        callback: (client: PoolClient) => Promise<T>
    ): Promise<T> {
        if (!this.options.databaseUrl) {
            throw new Error('DATABASE_URL is not configured. Cannot execute transaction directly.');
        }
        await this.ensurePgPool();
        if (!this.pgPool) {
            throw new Error('pg Pool not available for transaction.');
        }

        const client = await this.pgPool.connect();
        try {
            await client.query('BEGIN');
            console.error('BEGIN transaction');
            const result = await callback(client);
            await client.query('COMMIT');
            console.error('COMMIT transaction');
            return result;
        } catch (error) {
            console.error('Transaction Error - Rolling back:', error);
            await client.query('ROLLBACK');
            console.error('ROLLBACK transaction');
            // Re-throw the error so the caller knows the transaction failed
            throw error;
        } finally {
            client.release();
        }
    }

    // --- Helper/Private Methods (to be implemented) ---

    /**
     * Executes SQL using postgres-meta API (/pg/query endpoint)
     * This is available in Supabase instances and doesn't require direct database connection
     */
    private async executeSqlViaPostgresMeta(query: string): Promise<any> {
        const url = `${this.options.supabaseUrl}/pg/query`;
        const apiKey = this.options.supabaseServiceRoleKey || this.options.supabaseAnonKey;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': apiKey,
            },
            body: JSON.stringify({ query }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`postgres-meta API error: ${response.status} ${errorText}`);
        }

        return await response.json();
    }

    private async checkAndCreateRpcFunction(): Promise<void> {
        console.error("Checking for public.execute_sql RPC function...");

        if (!this.options.supabaseServiceRoleKey) {
            console.error("Cannot check/create 'public.execute_sql': supabaseServiceRoleKey not provided.");
            this.rpcFunctionExists = false;
            return;
        }

        try {
            // First, try to check if function exists using postgres-meta API
            // This is more reliable than using supabase.rpc() which may fail with fetch errors
            console.error("Checking if execute_sql function exists using postgres-meta API...");

            const checkQuery = `
                SELECT EXISTS (
                    SELECT 1
                    FROM pg_proc p
                    JOIN pg_namespace n ON p.pronamespace = n.oid
                    WHERE n.nspname = 'public'
                    AND p.proname = 'execute_sql'
                    AND p.pronargs = 1
                ) as function_exists;
            `;

            const checkResult = await this.executeSqlViaPostgresMeta(checkQuery);

            if (checkResult && checkResult.length > 0 && checkResult[0]?.function_exists) {
                console.error("'public.execute_sql' function found. Enforcing least-privilege grants...");
                try {
                    await this.executeSqlViaPostgresMeta(GRANT_EXECUTE_SQL_FUNCTION);
                    this.rpcFunctionExists = true;
                    return;
                } catch (grantError: unknown) {
                    console.error('Failed to enforce grants for execute_sql. Will recreate the function to ensure a clean state:', grantError);
                    // Fall through to recreate path below.
                }
            }

            // Function missing; install a clean function.
            console.error("'public.execute_sql' function not found. Creating...");

            try {
                // Drop old function versions first (avoid overload conflicts)
                console.error("Dropping old function versions...");
                await this.executeSqlViaPostgresMeta(DROP_OLD_EXECUTE_SQL_FUNCTIONS);

                // Create function using postgres-meta API (no db-url required)
                console.error("Creating 'public.execute_sql' function using postgres-meta API...");
                await this.executeSqlViaPostgresMeta(CREATE_EXECUTE_SQL_FUNCTION);
                await this.executeSqlViaPostgresMeta(GRANT_EXECUTE_SQL_FUNCTION);
                console.error("'public.execute_sql' function created and permissions granted successfully.");

                // Attempt to notify PostgREST to reload its schema cache
                console.error("Notifying PostgREST to reload schema cache...");
                await this.executeSqlViaPostgresMeta(NOTIFY_POSTGREST);
                console.error("PostgREST schema reload notification sent.");

                this.rpcFunctionExists = true;
            } catch (postgresMetaError: unknown) {
                console.error("Failed to create function via postgres-meta API:", postgresMetaError);

                // Fallback to direct DB connection if available
                if (this.options.databaseUrl) {
                    try {
                        console.error("Falling back to direct DB connection...");
                        await this.executeSqlWithPg(DROP_OLD_EXECUTE_SQL_FUNCTIONS);
                        await this.executeSqlWithPg(CREATE_EXECUTE_SQL_FUNCTION);
                        await this.executeSqlWithPg(GRANT_EXECUTE_SQL_FUNCTION);
                        await this.executeSqlWithPg(NOTIFY_POSTGREST);
                        console.error("'public.execute_sql' function created via direct DB connection.");
                        this.rpcFunctionExists = true;
                    } catch (pgError: unknown) {
                        const errorMessage = pgError instanceof Error ? pgError.message : String(pgError);
                        console.error("Failed to create function via direct DB connection:", pgError);
                        this.rpcFunctionExists = false;
                        console.error("RPC function creation failed. You can manually install using the install_execute_sql_function tool.");
                    }
                } else {
                    const errorMessage = postgresMetaError instanceof Error ? postgresMetaError.message : String(postgresMetaError);
                    console.error("No fallback available (databaseUrl not provided)");
                    console.error("RPC function creation failed. You can manually install using the install_execute_sql_function tool.");
                    this.rpcFunctionExists = false;
                }
            }
        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error("Exception during RPC function check/creation:", err);
            console.error("RPC function check failed, but continuing initialization...");
            console.error("You can manually install the execute_sql function using the install_execute_sql_function tool.");
            this.rpcFunctionExists = false;
            // Don't throw - allow initialization to continue
        }
    }

    // --- Getters --- 
    public getSupabaseUrl(): string {
        return this.options.supabaseUrl;
    }

    public getAnonKey(): string {
        return this.options.supabaseAnonKey;
    }

    public getServiceRoleKey(): string | undefined {
        return this.options.supabaseServiceRoleKey;
    }

    /**
     * Gets the configured JWT secret, if provided.
     */
    public getJwtSecret(): string | undefined {
        return this.options.jwtSecret;
    }

    /**
     * Gets the configured direct database connection URL, if provided.
     */
    public getDbUrl(): string | undefined {
        return this.options.databaseUrl;
    }

    /**
     * Checks if the direct database connection (pg) is configured.
     */
    public isPgAvailable(): boolean {
        return !!this.options.databaseUrl;
    }

    /**
     * Checks if the execute_sql RPC function is available.
     */
    public isRpcAvailable(): boolean {
        return this.rpcFunctionExists;
    }

    /**
     * Sets the RPC function availability status.
     * Called after successfully installing the execute_sql function.
     */
    public setRpcAvailable(available: boolean): void {
        this.rpcFunctionExists = available;
    }

    /**
     * Gets the authentication mode this client was created with.
     */
    public getAuthMode(): AuthMode {
        return this.authMode;
    }

    /**
     * Checks if this client is using user-level authentication.
     */
    public isUserAuth(): boolean {
        return this.authMode === AuthMode.SINGLE_INSTANCE_USER;
    }

    /**
     * Gets the user ID if using user-level authentication.
     */
    public getUserId(): string | null {
        return this.userAuthClient?.getUserId() || null;
    }

    /**
     * Gets the user email if using user-level authentication.
     */
    public getUserEmail(): string | null {
        return this.userAuthClient?.getUserEmail() || null;
    }

    /**
     * Gets the UserAuthClient if using user-level authentication.
     */
    public getUserAuthClient(): UserAuthClient | null {
        return this.userAuthClient;
    }

    /**
     * Cleanup resources when done with the client.
     */
    public async destroy(): Promise<void> {
        // Clean up user auth client if present
        if (this.userAuthClient) {
            await this.userAuthClient.destroy();
        }
        
        // Clean up pg pool if present
        if (this.pgPool) {
            await this.pgPool.end();
            this.pgPool = null;
        }
    }

}

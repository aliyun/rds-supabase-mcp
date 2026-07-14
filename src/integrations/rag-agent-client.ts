/**
 * RAG Agent MCP Client
 * Connects to a rag-agent MCP server and retrieves available tools
 * 
 * Supports two authentication modes:
 * - Service Key mode: Only --api-key (admin access, no JWT needed)
 * - JWT mode: --api-key + --user + --user-password (user-level access with auto-refresh)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

/**
 * RAG Agent authentication mode
 */
export enum RagAgentAuthMode {
    /** Service Key mode - admin access using service role key */
    SERVICE_KEY = 'service_key',
    /** JWT mode - user-level access with Supabase Auth */
    JWT = 'jwt'
}

/**
 * Basic configuration for RAG Agent (Service Key mode)
 */
export interface RagAgentConfig {
    /** 
     * Full URL to the RAG Agent API (e.g., http://42.121.243.173:80)
     * Should include protocol, hostname, and port
     */
    host: string;
    /** Supabase service role key (for admin access) or anon key (for user access) */
    apiKey: string;
}

/**
 * Extended configuration for RAG Agent with user authentication (JWT mode)
 * Reuses the same user credentials from Supabase MCP user mode
 */
export interface RagAgentUserConfig extends RagAgentConfig {
    /** User email for JWT authentication (same as --supabase-user-email) */
    userEmail: string;
    /** User password for JWT authentication (same as --supabase-user-password) */
    userPassword: string;
}

export interface RagAgentTool {
    name: string;
    description?: string;
    inputSchema: object;
}

/**
 * Type guard to check if config is RagAgentUserConfig
 */
function isUserConfig(config: RagAgentConfig | RagAgentUserConfig): config is RagAgentUserConfig {
    return 'userEmail' in config && 'userPassword' in config;
}

/**
 * Client for connecting to rag-agent MCP server
 */
export class RagAgentClient {
    private config: RagAgentConfig | RagAgentUserConfig;
    private client: Client | null = null;
    private tools: RagAgentTool[] = [];
    private authMode: RagAgentAuthMode;

    constructor(config: RagAgentConfig | RagAgentUserConfig) {
        this.config = config;
        // Determine auth mode based on whether user credentials are provided
        this.authMode = isUserConfig(config) ? RagAgentAuthMode.JWT : RagAgentAuthMode.SERVICE_KEY;
    }

    /**
     * Get the authentication mode being used
     */
    getAuthMode(): RagAgentAuthMode {
        return this.authMode;
    }

    /**
     * Initialize connection to rag-agent MCP server and fetch tools
     */
    async initialize(): Promise<void> {
        const modeDescription = this.authMode === RagAgentAuthMode.JWT 
            ? 'JWT mode (user-level access)' 
            : 'Service Key mode (admin access)';
        console.error(`Initializing RAG Agent MCP client in ${modeDescription}...`);
        
        try {
            // Create MCP client
            this.client = new Client(
                {
                    name: 'supabase-mcp-rag-agent-client',
                    version: '1.0.0',
                },
                {
                    capabilities: {},
                }
            );

            // Create transport to connect to rag-agent via uvx command
            // Note: rag-agent-mcp 0.1.2 requires Python 3.11+
            // Clear proxy environment variables to avoid connection issues
            const env: Record<string, string> = {};
            for (const [key, value] of Object.entries(process.env)) {
                if (value !== undefined &&
                    !['http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY', 'all_proxy', 'ALL_PROXY', 'no_proxy', 'NO_PROXY'].includes(key)) {
                    env[key] = value;
                }
            }
            // Explicitly set NO_PROXY to ensure direct connection
            env.NO_PROXY = '*';
            env.no_proxy = '*';

            // Build command arguments based on auth mode
            // Note: --host should be full URL including protocol and port (e.g., http://host:80)
            const args = [
                '--from',
                'rag-agent-mcp',
                'rag-agent',
                '--host',
                this.config.host,
                '--api-key',
                this.config.apiKey,
            ];

            console.error('[RAG Agent] Configuration:');
            console.error(`  Host: ${this.config.host}`);
            console.error('  API key: <configured>');

            // Add user credentials for JWT mode (reuses Supabase user credentials)
            if (this.authMode === RagAgentAuthMode.JWT && isUserConfig(this.config)) {
                args.push('--user', this.config.userEmail);
                args.push('--user-password', this.config.userPassword);
                console.error('  User credentials: <configured>');
            }
            
            // Log the full command (mask api-key and password)
            const maskedArgs = args.map((arg, i) => {
                if (args[i - 1] === '--api-key') return '<API_KEY>';
                if (args[i - 1] === '--user-password') return '<PASSWORD>';
                return arg;
            });
            console.error(`[RAG Agent] Command: uvx ${maskedArgs.join(' ')}`);
            console.error(`[RAG Agent] Auth mode: ${this.authMode}`);

            const transport = new StdioClientTransport({
                command: 'uvx',
                args,
                env,
            });

            // Connect to the server
            await this.client.connect(transport);
            console.error('Connected to RAG Agent MCP server');

            // Fetch available tools
            const response = await this.client.listTools();
            this.tools = response.tools.map(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema,
            }));

            console.error(`Loaded ${this.tools.length} tools from RAG Agent MCP server`);
            console.error(`RAG Agent tools: ${this.tools.map(t => t.name).join(', ')}`);
        } catch (error) {
            console.error('Failed to initialize RAG Agent MCP client:', error);
            throw error;
        }
    }

    /**
     * Get the list of available tools from rag-agent
     */
    getTools(): RagAgentTool[] {
        return this.tools;
    }

    /**
     * Call a tool on the rag-agent MCP server
     */
    async callTool(name: string, args: unknown): Promise<unknown> {
        if (!this.client) {
            throw new Error('RAG Agent client not initialized');
        }

        try {
            const response = await this.client.callTool({
                name,
                arguments: args as { [x: string]: unknown } | undefined,
            });

            // Extract text content from response
            if (response.content && Array.isArray(response.content)) {
                const textContent = response.content
                    .filter(item => item.type === 'text')
                    .map(item => ('text' in item ? item.text : ''))
                    .join('\n');
                
                // Try to parse as JSON if possible
                try {
                    return JSON.parse(textContent);
                } catch {
                    return textContent;
                }
            }

            return response;
        } catch (error) {
            console.error(`Error calling RAG Agent tool ${name}:`, error);
            throw error;
        }
    }

    /**
     * Close the connection to rag-agent MCP server
     */
    async close(): Promise<void> {
        if (this.client) {
            await this.client.close();
            this.client = null;
            console.error('RAG Agent MCP client closed');
        }
    }
}

/**
 * Factory function to create and initialize a RAG Agent client
 * 
 * @param config - Basic config for Service Key mode, or extended config for JWT mode
 */
export async function createRagAgentClient(config: RagAgentConfig | RagAgentUserConfig): Promise<RagAgentClient> {
    const client = new RagAgentClient(config);
    await client.initialize();
    return client;
}

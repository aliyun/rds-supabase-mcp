#!/usr/bin/env node

import { Command } from 'commander';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { SelfhostedSupabaseClient } from './client/index.js';
import { listTablesTool } from './tools/list_tables.js';
import { listExtensionsTool } from './tools/list_extensions.js';
import { listMigrationsTool } from './tools/list_migrations.js';
import { applyMigrationTool } from './tools/apply_migration.js';
import { executeSqlTool } from './tools/execute_sql.js';
import { getDatabaseConnectionsTool } from './tools/get_database_connections.js';
import { getDatabaseStatsTool } from './tools/get_database_stats.js';
import { getProjectUrlTool } from './tools/get_project_url.js';
import { getAnonKeyTool } from './tools/get_anon_key.js';
import { getServiceKeyTool } from './tools/get_service_key.js';
import { generateTypesTool } from './tools/generate_typescript_types.js';
import { rebuildHooksTool } from './tools/rebuild_hooks.js';
import { verifyJwtSecretTool } from './tools/verify_jwt_secret.js';
import { listAuthUsersTool } from './tools/list_auth_users.js';
import { getAuthUserTool } from './tools/get_auth_user.js';
import { deleteAuthUserTool } from './tools/delete_auth_user.js';
import { createAuthUserTool } from './tools/create_auth_user.js';
import { updateAuthUserTool } from './tools/update_auth_user.js';
import { z } from 'zod';
import type { ToolContext, UserInfo } from './tools/types.js';
import { isToolAllowed, getToolNotAllowedMessage } from './tools/types.js';
import listStorageBucketsTool from './tools/list_storage_buckets.js';
import listStorageObjectsTool from './tools/list_storage_objects.js';
import listRealtimePublicationsTool from './tools/list_realtime_publications.js';
import installExecuteSqlFunctionTool from './tools/install_execute_sql_function.js';
import { searchDocsTool } from './tools/search_docs.js';

// Node.js built-in modules
import * as fs from 'node:fs';
import * as path from 'node:path';

// RAG Agent integration
import { createRagAgentClient, type RagAgentClient } from './integrations/rag-agent-client.js';
import { wrapAllRagAgentTools } from './integrations/rag-agent-tools.js';

// Alibaba Cloud integration
import { createAliyunClient, type AliyunRdsAiClient } from './aliyun/client.js';
import listAliyunSupabaseInstancesTool from './tools/aliyun/list_instances.js';
import connectToSupabaseInstanceTool from './tools/aliyun/connect_instance.js';
import getCurrentSupabaseInstanceTool from './tools/aliyun/get_current_instance.js';
import disconnectSupabaseInstanceTool from './tools/aliyun/disconnect_instance.js';

// Configuration module
import {
    AuthMode,
    parseConfig,
    getAuthModeDescription,
    isAliyunConfig,
    isSingleInstanceAdminConfig,
    isSingleInstanceUserConfig,
    getPermissionLevel,
    ConfigValidationError,
    type AuthConfig,
    type RawCommandOptions,
} from './config/index.js';

// Define the structure expected by MCP for tool definitions
interface McpToolSchema {
    name: string;
    description?: string;
    // inputSchema is the JSON Schema object for MCP capabilities
    inputSchema: object; 
}

// Base structure for our tool objects - For Reference
interface AppTool {
    name: string;
    description: string;
    inputSchema: z.ZodTypeAny; // Zod schema for parsing
    mcpInputSchema: object;    // Static JSON schema for MCP (Required)
    outputSchema: z.ZodTypeAny; // Zod schema for output (optional)
    execute: (input: unknown, context: ToolContext) => Promise<unknown>;
}

// Main function
async function main() {
    const program = new Command();

    program
        .name('self-hosted-supabase-mcp')
        .description('MCP Server for self-hosted Supabase instances with three-tier authentication')
        // Legacy Supabase options (backward compatible)
        .option('--url <url>', 'Supabase project URL (alias for --supabase-url)', process.env.SUPABASE_URL)
        .option('--anon-key <key>', 'Supabase anonymous key (alias for --supabase-anon-key)', process.env.SUPABASE_ANON_KEY)
        .option('--service-key <key>', 'Supabase service role key (alias for --supabase-service-role-key)', process.env.SUPABASE_SERVICE_ROLE_KEY)
        // New Supabase options with consistent naming
        .option('--supabase-url <url>', 'Supabase project URL', process.env.SUPABASE_URL)
        .option('--supabase-anon-key <key>', 'Supabase anonymous key', process.env.SUPABASE_ANON_KEY)
        .option('--supabase-service-role-key <key>', 'Supabase service role key', process.env.SUPABASE_SERVICE_ROLE_KEY)
        // User authentication options (Tier 3)
        .option('--supabase-user-email <email>', 'User email for Supabase Auth login', process.env.SUPABASE_USER_EMAIL)
        .option('--supabase-user-password <password>', 'User password for Supabase Auth login', process.env.SUPABASE_USER_PASSWORD)
        // Database and JWT options
        .option('--db-url <url>', 'Direct database connection string (optional, for pg fallback)', process.env.DATABASE_URL)
        .option('--jwt-secret <secret>', 'Supabase JWT secret (optional)', process.env.SUPABASE_AUTH_JWT_SECRET)
        // Alibaba Cloud options
        .option('--aliyun-ak <key>', 'Alibaba Cloud Access Key ID', process.env.ALIYUN_ACCESS_KEY_ID)
        .option('--aliyun-sk <secret>', 'Alibaba Cloud Access Key Secret', process.env.ALIYUN_ACCESS_KEY_SECRET)
        .option('--aliyun-region <region>', 'Alibaba Cloud region (optional)', process.env.ALIYUN_REGION)
        // Common options
        .option('--workspace-path <path>', 'Workspace root path (for file operations)', process.cwd())
        .option('--tools-config <path>', 'Path to a JSON file specifying which tools to enable (e.g., { "enabledTools": ["tool1", "tool2"] }). If omitted, all tools are enabled.')
        .option('--enable-rag-agent', 'Enable RAG Agent MCP integration', process.env.ENABLE_RAG_AGENT === 'true')
        .parse(process.argv);

    const options = program.opts() as RawCommandOptions;

    // Parse and validate configuration
    let config: AuthConfig;
    try {
        config = parseConfig(options);
    } catch (error) {
        if (error instanceof ConfigValidationError) {
            console.error(error.message);
            process.exit(1);
        }
        throw error;
    }

    const authMode = config.mode;
    const permissionLevel = getPermissionLevel(authMode);
    
    console.error(`Initializing Self-Hosted Supabase MCP Server in ${getAuthModeDescription(authMode)} mode...`);

    try {
        // Initialize clients based on authentication mode
        let aliyunClient: AliyunRdsAiClient | null = null;
        let selfhostedClient: SelfhostedSupabaseClient | null = null;
        let userInfo: UserInfo | undefined;

        // State management for dynamic connection (Aliyun mode)
        let currentInstanceName: string | null = null;
        let currentSupabaseClient: SelfhostedSupabaseClient | null = null;

        if (isAliyunConfig(config)) {
            // Tier 1: Alibaba Cloud Multi-Instance Mode
            console.error('Alibaba Cloud mode enabled, initializing client...');
            aliyunClient = createAliyunClient({
                accessKeyId: config.accessKeyId,
                accessKeySecret: config.accessKeySecret,
                regionId: config.regionId,
            });
            console.error('Alibaba Cloud client initialized successfully.');
        } else if (isSingleInstanceUserConfig(config)) {
            // Tier 3: Single Instance User Mode (RLS restricted)
            console.error('Single Instance User mode enabled, authenticating...');
            selfhostedClient = await SelfhostedSupabaseClient.createWithUserAuth({
                supabaseUrl: config.supabaseUrl,
                supabaseAnonKey: config.supabaseAnonKey,
                userEmail: config.userEmail,
                userPassword: config.userPassword,
            });
            currentSupabaseClient = selfhostedClient;
            
            // Get user info for context
            const userId = selfhostedClient.getUserId();
            const email = selfhostedClient.getUserEmail();
            if (userId && email) {
                userInfo = { userId, email };
            }
            
            console.error(`Authenticated as user: ${email} (ID: ${userId})`);
            console.error('Note: Access is restricted by Row Level Security (RLS) policies.');
        } else if (isSingleInstanceAdminConfig(config)) {
            // Tier 2: Single Instance Admin Mode
            console.error('Single Instance Admin mode enabled, initializing client...');
            selfhostedClient = await SelfhostedSupabaseClient.create({
                supabaseUrl: config.supabaseUrl,
                supabaseAnonKey: config.supabaseAnonKey,
                supabaseServiceRoleKey: config.supabaseServiceRoleKey,
                databaseUrl: config.databaseUrl,
                jwtSecret: config.jwtSecret,
            }, AuthMode.SINGLE_INSTANCE_ADMIN);
            currentSupabaseClient = selfhostedClient;
            console.error('Supabase client initialized successfully (admin mode).');
        }

        // Helper functions for Aliyun mode state management
        const getCurrentInstanceName = () => currentInstanceName;
        const setCurrentInstance = (instanceName: string, client: SelfhostedSupabaseClient) => {
            currentInstanceName = instanceName;
            currentSupabaseClient = client;
        };
        const clearCurrentInstance = () => {
            currentInstanceName = null;
            currentSupabaseClient = null;
        };
        const createSupabaseClientDynamic = async (
            url: string,
            anonKey: string,
            serviceKey?: string,
            jwtSecret?: string
        ) => {
            return await SelfhostedSupabaseClient.create({
                supabaseUrl: url,
                supabaseAnonKey: anonKey,
                supabaseServiceRoleKey: serviceKey,
                databaseUrl: options.dbUrl,
                jwtSecret: jwtSecret,
            }, AuthMode.ALIYUN_MULTI_INSTANCE);
        };

        // Initialize RAG Agent client if enabled
        let ragAgentClient: RagAgentClient | null = null;

        // Function to initialize RAG Agent dynamically based on auth mode
        // - Tier 1 (Aliyun) & Tier 2 (Admin): Use service role key for admin access
        // - Tier 3 (User): Use anon key + user credentials for JWT-based user access
        const initializeRagAgent = async (supabaseClient: SelfhostedSupabaseClient) => {
            if (!config.enableRagAgent) {
                return null;
            }

            try {
                console.error('Initializing RAG Agent client...');

                // RAG Agent expects full URL with protocol (e.g., http://host:port)
                const supabaseUrl = supabaseClient.getSupabaseUrl();
                const urlObj = new URL(supabaseUrl);
                
                // Build host URL with protocol, hostname and port
                const port = urlObj.port ? parseInt(urlObj.port, 10) : (urlObj.protocol === 'https:' ? 443 : 80);
                const hostUrl = `${urlObj.protocol}//${urlObj.hostname}:${port}`;
                
                console.error(`RAG Agent host: ${hostUrl}`);

                let client: RagAgentClient;

                if (isSingleInstanceUserConfig(config)) {
                    // Tier 3: User mode - use anon key + user credentials for JWT auth
                    // RAG Agent will call /login to get JWT, then use it for requests
                    const anonKey = supabaseClient.getAnonKey();
                    console.error('[initializeRagAgent] Tier 3: User mode detected');
                    console.error(`[initializeRagAgent] Using anon key for JWT auth`);
                    console.error('[initializeRagAgent] User credentials configured for JWT auth');
                    client = await createRagAgentClient({
                        host: hostUrl,
                        apiKey: anonKey,
                        userEmail: config.userEmail,
                        userPassword: config.userPassword,
                    });
                } else {
                    // Tier 1 & 2: Use service role key for admin access (no JWT needed)
                    const serviceKey = supabaseClient.getServiceRoleKey();
                    const anonKey = supabaseClient.getAnonKey();
                    
                    console.error('[initializeRagAgent] Tier 1/2: Admin mode detected');
                    console.error(`[initializeRagAgent] Service key available: ${!!serviceKey}`);
                    
                    if (!serviceKey) {
                        console.error('[initializeRagAgent] WARNING: Service role key not available!');
                        console.error('[initializeRagAgent] This may cause 401 errors if RAG Agent requires admin access');
                    }
                    
                    const apiKey = serviceKey || anonKey;
                    console.error(`[initializeRagAgent] Using: ${serviceKey ? 'service_role key' : 'anon key (fallback)'}`);
                    
                    client = await createRagAgentClient({
                        host: hostUrl,
                        apiKey,
                    });
                }

                console.error('RAG Agent client initialized successfully.');
                return client;
            } catch (error) {
                console.error('Failed to initialize RAG Agent client:', error);
                console.error('Continuing without RAG Agent integration...');
                return null;
            }
        };

        // Initialize RAG Agent for non-Aliyun modes
        if (config.enableRagAgent && currentSupabaseClient) {
            ragAgentClient = await initializeRagAgent(currentSupabaseClient);
        } else if (config.enableRagAgent && isAliyunConfig(config)) {
            console.error('RAG Agent integration enabled.');
            console.error('RAG Agent tools will be available after connecting to a Supabase instance.');
        }

        // Wrap Alibaba Cloud tools with proper context
        const wrappedAliyunTools: Record<string, AppTool> = {};

        if (isAliyunConfig(config)) {
            // List instances tool
            wrappedAliyunTools[listAliyunSupabaseInstancesTool.name] = {
                ...listAliyunSupabaseInstancesTool,
                execute: async (input: unknown, context: ToolContext) => {
                    return await listAliyunSupabaseInstancesTool.execute(
                        input as any,
                        aliyunClient,
                        context.log
                    );
                },
            } as AppTool;

            // Connect to instance tool
            wrappedAliyunTools[connectToSupabaseInstanceTool.name] = {
                ...connectToSupabaseInstanceTool,
                execute: async (input: unknown, context: ToolContext) => {
                    const result = await connectToSupabaseInstanceTool.execute(
                        input as any,
                        aliyunClient,
                        createSupabaseClientDynamic,
                        setCurrentInstance,
                        context.log
                    );

                    // Initialize RAG Agent after successful connection
                    if (result.success && currentSupabaseClient && config.enableRagAgent && !ragAgentClient) {
                        ragAgentClient = await initializeRagAgent(currentSupabaseClient);
                    }

                    return result;
                },
            } as AppTool;

            // Get current instance tool
            wrappedAliyunTools[getCurrentSupabaseInstanceTool.name] = {
                ...getCurrentSupabaseInstanceTool,
                execute: async (input: unknown, context: ToolContext) => {
                    return await getCurrentSupabaseInstanceTool.execute(
                        input as any,
                        getCurrentInstanceName,
                        context.log
                    );
                },
            } as AppTool;

            // Disconnect instance tool
            wrappedAliyunTools[disconnectSupabaseInstanceTool.name] = {
                ...disconnectSupabaseInstanceTool,
                execute: async (input: unknown, context: ToolContext) => {
                    return await disconnectSupabaseInstanceTool.execute(
                        input as any,
                        getCurrentInstanceName,
                        clearCurrentInstance,
                        context.log
                    );
                },
            } as AppTool;
        }

        const availableTools: Record<string, AppTool> = {
            // Alibaba Cloud tools (if in Aliyun mode)
            ...wrappedAliyunTools,

            // Cast here assumes tools will implement AppTool structure
            [listTablesTool.name]: listTablesTool as AppTool,
            [listExtensionsTool.name]: listExtensionsTool as AppTool,
            [listMigrationsTool.name]: listMigrationsTool as AppTool,
            [applyMigrationTool.name]: applyMigrationTool as AppTool,
            [executeSqlTool.name]: executeSqlTool as AppTool,
            [getDatabaseConnectionsTool.name]: getDatabaseConnectionsTool as AppTool,
            [getDatabaseStatsTool.name]: getDatabaseStatsTool as AppTool,
            [getProjectUrlTool.name]: getProjectUrlTool as AppTool,
            [getAnonKeyTool.name]: getAnonKeyTool as AppTool,
            [getServiceKeyTool.name]: getServiceKeyTool as AppTool,
            [generateTypesTool.name]: generateTypesTool as AppTool,
            [rebuildHooksTool.name]: rebuildHooksTool as AppTool,
            [verifyJwtSecretTool.name]: verifyJwtSecretTool as AppTool,
            [listAuthUsersTool.name]: listAuthUsersTool as AppTool,
            [getAuthUserTool.name]: getAuthUserTool as AppTool,
            [deleteAuthUserTool.name]: deleteAuthUserTool as AppTool,
            [createAuthUserTool.name]: createAuthUserTool as AppTool,
            [updateAuthUserTool.name]: updateAuthUserTool as AppTool,
            [listStorageBucketsTool.name]: listStorageBucketsTool as AppTool,
            [listStorageObjectsTool.name]: listStorageObjectsTool as AppTool,
            [listRealtimePublicationsTool.name]: listRealtimePublicationsTool as AppTool,
            [installExecuteSqlFunctionTool.name]: installExecuteSqlFunctionTool as AppTool,
            [searchDocsTool.name]: searchDocsTool as AppTool,
        };

        // Add RAG Agent tools
        if (config.enableRagAgent) {
            if (ragAgentClient) {
                // Non-Aliyun mode: RAG Agent is already initialized
                const ragTools = wrapAllRagAgentTools(ragAgentClient);
                Object.assign(availableTools, ragTools);
                console.error(`Added ${Object.keys(ragTools).length} RAG Agent tools to available tools.`);
            } else if (isAliyunConfig(config)) {
                // Aliyun mode: Add placeholder RAG tools that will check connection status
                const dummyRagTools = await (async () => {
                    try {
                        const tempClient = await createRagAgentClient({
                            host: 'http://localhost:80',
                            apiKey: 'dummy',
                        });
                        const tools = wrapAllRagAgentTools(tempClient);
                        await tempClient.close();
                        return tools;
                    } catch (error) {
                        console.error('Warning: Could not create RAG Agent tool schemas:', error);
                        return {};
                    }
                })();

                // Wrap each RAG tool to check for connection before execution
                for (const [toolName, tool] of Object.entries(dummyRagTools)) {
                    availableTools[toolName] = {
                        ...tool,
                        execute: async (input: unknown, context: ToolContext) => {
                            if (!ragAgentClient) {
                                throw new Error('RAG Agent is not initialized. Please connect to a Supabase instance first using connect_to_supabase_instance tool.');
                            }
                            const ragTools = wrapAllRagAgentTools(ragAgentClient);
                            return await ragTools[toolName].execute(input, context);
                        },
                    } as AppTool;
                }

                console.error(`Added ${Object.keys(dummyRagTools).length} RAG Agent tools (will be initialized after connection).`);
            }
        }

        // --- Permission-Based Tool Filtering ---
        // Filter tools based on authentication mode permission level
        const permissionFilteredTools: Record<string, AppTool> = {};
        for (const [toolName, tool] of Object.entries(availableTools)) {
            if (isToolAllowed(toolName, permissionLevel)) {
                permissionFilteredTools[toolName] = tool;
            } else {
                console.error(`Tool ${toolName} disabled (not allowed for ${permissionLevel} permission level).`);
            }
        }

        // --- Tool Config File Filtering ---
        let registeredTools: Record<string, AppTool> = { ...permissionFilteredTools };
        const toolsConfigPath = config.toolsConfig;
        let enabledToolNames: Set<string> | null = null;

        if (toolsConfigPath) {
            try {
                const resolvedPath = path.resolve(toolsConfigPath);
                console.error(`Attempting to load tool configuration from: ${resolvedPath}`);
                if (!fs.existsSync(resolvedPath)) {
                    throw new Error(`Tool configuration file not found at ${resolvedPath}`);
                }
                const configFileContent = fs.readFileSync(resolvedPath, 'utf-8');
                const configJson = JSON.parse(configFileContent);

                if (!configJson || typeof configJson !== 'object' || !Array.isArray(configJson.enabledTools)) {
                     throw new Error('Invalid config file format. Expected { "enabledTools": ["tool1", ...] }.');
                }

                const toolNames = configJson.enabledTools as unknown[];
                if (!toolNames.every((name): name is string => typeof name === 'string')) {
                    throw new Error('Invalid config file content. "enabledTools" must be an array of strings.');
                }

                enabledToolNames = new Set(toolNames.map(name => name.trim()).filter(name => name.length > 0));

            } catch (error: unknown) {
                console.error(`Error loading or parsing tool config file '${toolsConfigPath}':`, error instanceof Error ? error.message : String(error));
                console.error('Falling back to enabling all permission-allowed tools due to config error.');
                enabledToolNames = null;
            }
        }

        if (enabledToolNames !== null) {
            console.error(`Whitelisting tools based on config: ${Array.from(enabledToolNames).join(', ')}`);

            registeredTools = {};
            for (const toolName in permissionFilteredTools) {
                if (enabledToolNames.has(toolName)) {
                    registeredTools[toolName] = permissionFilteredTools[toolName];
                } else {
                    console.error(`Tool ${toolName} disabled (not in config whitelist).`);
                }
            }

            for (const requestedName of enabledToolNames) {
                if (!permissionFilteredTools[requestedName]) {
                    if (availableTools[requestedName]) {
                        console.warn(`Warning: Tool "${requestedName}" is not available for the current permission level.`);
                    } else {
                        console.warn(`Warning: Tool "${requestedName}" specified in config file not found.`);
                    }
                }
            }
        } else {
            console.error("No valid --tools-config specified or error loading config, enabling all permission-allowed tools.");
        }
        // --- End Tool Filtering Logic ---

        // Prepare capabilities for the Server constructor
        const capabilitiesTools: Record<string, McpToolSchema> = {};
        for (const tool of Object.values(registeredTools)) {
            const staticInputSchema = tool.mcpInputSchema || { type: 'object', properties: {} };

            if (!tool.mcpInputSchema) {
                 console.error(`Tool ${tool.name} is missing mcpInputSchema. Using default empty schema.`);
            }

            capabilitiesTools[tool.name] = {
                name: tool.name,
                description: tool.description || 'Tool description missing',
                inputSchema: staticInputSchema,
            };
        }

        const capabilities = { tools: capabilitiesTools };

        console.error(`Registered ${Object.keys(registeredTools).length} tools.`);
        console.error('Initializing MCP Server...');
        const server = new Server(
            {
                name: 'self-hosted-supabase-mcp',
                version: '1.0.0',
            },
            {
                capabilities,
            },
        );

        // The ListTools handler should return the array matching McpToolSchema structure
        server.setRequestHandler(ListToolsRequestSchema, async () => ({
            tools: Object.values(capabilities.tools),
        }));

        server.setRequestHandler(CallToolRequestSchema, async (request) => {
            const toolName = request.params.name;
            const tool = registeredTools[toolName as keyof typeof registeredTools];

            if (!tool) {
                // Check if it was filtered out due to permissions
                if (availableTools[toolName as keyof typeof availableTools]) {
                    const message = getToolNotAllowedMessage(toolName, permissionLevel);
                    throw new McpError(ErrorCode.MethodNotFound, message);
                }
                // Check if it was filtered by config whitelist
                if (permissionFilteredTools[toolName as keyof typeof permissionFilteredTools]) {
                     throw new McpError(ErrorCode.MethodNotFound, `Tool "${toolName}" is available but not enabled by the current server configuration.`);
                }
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`);
            }

            try {
                if (typeof tool.execute !== 'function') {
                    throw new Error(`Tool ${toolName} does not have an execute method.`);
                }

                let parsedArgs = request.params.arguments;
                if (tool.inputSchema && typeof tool.inputSchema.parse === 'function') {
                    parsedArgs = (tool.inputSchema as z.ZodTypeAny).parse(request.params.arguments);
                }

                // Check if tool requires Supabase connection (not Aliyun management tools)
                const isAliyunManagementTool = [
                    'list_aliyun_supabase_instances',
                    'connect_to_supabase_instance',
                    'get_current_supabase_instance',
                    'disconnect_supabase_instance',
                ].includes(toolName);

                // In Aliyun mode, check if connected (except for Aliyun management tools)
                if (isAliyunConfig(config) && !isAliyunManagementTool && !currentSupabaseClient) {
                    throw new McpError(
                        ErrorCode.InvalidRequest,
                        'Not connected to any Supabase instance. Please use connect_to_supabase_instance tool first.'
                    );
                }

                // Create the context object with authentication information
                const context: ToolContext = {
                    selfhostedClient: currentSupabaseClient!,
                    workspacePath: config.workspacePath || process.cwd(),
                    authMode: authMode,
                    permissionLevel: permissionLevel,
                    userInfo: userInfo,
                    log: (message, level = 'info') => {
                        console.error(`[${level.toUpperCase()}] ${message}`);
                    }
                };

                // Call the tool's execute method
                // biome-ignore lint/suspicious/noExplicitAny: <explanation>
                const result = await tool.execute(parsedArgs as any, context);

                return {
                    content: [
                        {
                            type: 'text',
                            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
                        },
                    ],
                };
            } catch (error: unknown) {
                 console.error(`Error executing tool ${toolName}:`, error);
                 let errorMessage = `Error executing tool ${toolName}: `;
                 if (error instanceof z.ZodError) {
                     errorMessage += `Input validation failed: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`;
                 } else if (error instanceof Error) {
                     errorMessage += error.message;
                 } else {
                     errorMessage += String(error);
                 }
                 return {
                    content: [{ type: 'text', text: errorMessage }],
                    isError: true,
                 };
            }
        });

        console.error('Starting MCP Server in stdio mode...');
        const transport = new StdioServerTransport();
        await server.connect(transport);
        console.error('MCP Server connected to stdio.');

        // Handle graceful shutdown
        const cleanup = async () => {
            console.error('Shutting down...');
            if (ragAgentClient) {
                await ragAgentClient.close();
            }
            if (selfhostedClient) {
                await selfhostedClient.destroy();
            }
        };

        process.on('SIGINT', async () => {
            await cleanup();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            await cleanup();
            process.exit(0);
        });

    } catch (error) {
        console.error('Failed to initialize or start the MCP server:', error);
        throw error;
    }
}

main().catch((error) => {
    console.error('Unhandled error in main function:', error);
    process.exit(1);
});

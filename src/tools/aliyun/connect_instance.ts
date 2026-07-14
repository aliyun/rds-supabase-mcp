/**
 * Connect to Supabase Instance Tool
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AliyunRdsAiClient } from '../../aliyun/client.js';
import type { SelfhostedSupabaseClient } from '../../client/index.js';

// Input schema
const ConnectInstanceInputZodSchema = z.object({
    instance_name: z.string().describe('The instance name (e.g., ra-supabase-8moov5lxba****)'),
    use_vpc: z.boolean().optional().default(false).describe('Whether to use VPC connection instead of public connection'),
    region_id: z.string().optional().describe('Region ID of the instance (e.g., cn-hangzhou, cn-chengdu). Required when connecting to an instance in a different region than the default startup region.'),
});

type ConnectInstanceInput = z.infer<typeof ConnectInstanceInputZodSchema>;

// Output schema
const ConnectInstanceOutputZodSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    instance_name: z.string(),
    supabase_url: z.string(),
    connection_type: z.string(),
});

type ConnectInstanceOutput = z.infer<typeof ConnectInstanceOutputZodSchema>;

/**
 * Connect to a Supabase instance
 */
async function execute(
    input: ConnectInstanceInput,
    aliyunClient: AliyunRdsAiClient | null,
    createSupabaseClient: (url: string, anonKey: string, serviceKey?: string, jwtSecret?: string) => Promise<SelfhostedSupabaseClient>,
    setCurrentInstance: (instanceName: string, client: SelfhostedSupabaseClient) => void,
    log: (message: string, level?: 'info' | 'error') => void
): Promise<ConnectInstanceOutput> {
    if (!aliyunClient) {
        throw new Error('Alibaba Cloud client is not initialized. Please provide --aliyun-ak and --aliyun-sk parameters.');
    }

    log(`Connecting to Supabase instance: ${input.instance_name}...`, 'info');

    try {
        // Get credentials from Alibaba Cloud
        const credentials = await aliyunClient.getSupabaseCredentials(input.instance_name, input.use_vpc, input.region_id);

        log(`Retrieved credentials for instance ${input.instance_name}`, 'info');
        log(`Supabase URL: ${credentials.supabaseUrl}`, 'info');

        // Create Supabase client
        const supabaseClient = await createSupabaseClient(
            credentials.supabaseUrl,
            credentials.anonKey,
            credentials.serviceKey,
            credentials.jwtSecret
        );

        // Set as current instance
        setCurrentInstance(input.instance_name, supabaseClient);

        log(`Successfully connected to instance ${input.instance_name}`, 'info');

        return {
            success: true,
            message: `Successfully connected to Supabase instance ${input.instance_name}`,
            instance_name: input.instance_name,
            supabase_url: credentials.supabaseUrl,
            connection_type: input.use_vpc ? 'VPC' : 'Public',
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log(`Error connecting to instance: ${errorMessage}`, 'error');
        throw new Error(`Failed to connect to instance ${input.instance_name}: ${errorMessage}`);
    }
}

export const connectToSupabaseInstanceTool = {
    name: 'connect_to_supabase_instance',
    description: 'Connect to a specific Supabase instance by instance name. This tool fetches credentials from Alibaba Cloud and establishes a connection. After connecting, you can use all Supabase tools (list_tables, execute_sql, etc.).',
    inputSchema: ConnectInstanceInputZodSchema,
    mcpInputSchema: zodToJsonSchema(ConnectInstanceInputZodSchema),
    outputSchema: ConnectInstanceOutputZodSchema,
    execute,
};

export default connectToSupabaseInstanceTool;


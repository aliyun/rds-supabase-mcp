/**
 * List Alibaba Cloud Supabase Instances Tool
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { AliyunRdsAiClient } from '../../aliyun/client.js';

// Input schema
const ListInstancesInputZodSchema = z.object({
    region_id: z.string().optional().describe('Region ID to filter instances (e.g., cn-beijing)'),
    db_instance_name: z.string().optional().describe('RDS PostgreSQL database instance ID to filter'),
    page_size: z.number().int().min(1).max(50).optional().default(50).describe('Number of results per page (1-50)'),
    page_number: z.number().int().min(1).optional().default(1).describe('Page number'),
});

type ListInstancesInput = z.infer<typeof ListInstancesInputZodSchema>;

// Output schema
const InstanceInfoZodSchema = z.object({
    instance_name: z.string(),
    app_name: z.string(),
    status: z.string(),
    instance_class: z.string(),
    region_id: z.string(),
    public_url: z.string(),
    vpc_url: z.string(),
    db_instance_name: z.string(),
});

const ListInstancesOutputZodSchema = z.object({
    success: z.boolean(),
    total_count: z.number(),
    page_number: z.number(),
    page_size: z.number(),
    instances: z.array(InstanceInfoZodSchema),
});

type ListInstancesOutput = z.infer<typeof ListInstancesOutputZodSchema>;

/**
 * List all Supabase instances from Alibaba Cloud
 */
async function execute(
    input: ListInstancesInput,
    aliyunClient: AliyunRdsAiClient | null,
    log: (message: string, level?: 'info' | 'error') => void
): Promise<ListInstancesOutput> {
    if (!aliyunClient) {
        throw new Error('Alibaba Cloud client is not initialized. Please provide --aliyun-ak and --aliyun-sk parameters.');
    }

    log('Fetching Supabase instances from Alibaba Cloud...', 'info');

    try {
        const response = await aliyunClient.listSupabaseInstances({
            regionId: input.region_id,
            dbInstanceName: input.db_instance_name,
            pageSize: input.page_size,
            pageNumber: input.page_number,
        });

        const instances = response.instances.map(inst => ({
            instance_name: inst.instanceName,
            app_name: inst.appName,
            status: inst.status,
            instance_class: inst.instanceClass,
            region_id: inst.regionId,
            public_url: inst.publicConnectionString.startsWith('http') 
                ? inst.publicConnectionString 
                : `http://${inst.publicConnectionString}`,
            vpc_url: inst.vpcConnectionString.startsWith('http') 
                ? inst.vpcConnectionString 
                : `http://${inst.vpcConnectionString}`,
            db_instance_name: inst.dbInstanceName,
        }));

        log(`Found ${instances.length} Supabase instance(s)`, 'info');

        return {
            success: true,
            total_count: response.totalCount,
            page_number: response.pageNumber,
            page_size: response.pageSize,
            instances,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log(`Error listing instances: ${errorMessage}`, 'error');
        throw error;
    }
}

export const listAliyunSupabaseInstancesTool = {
    name: 'list_aliyun_supabase_instances',
    description: 'List all Supabase instances from Alibaba Cloud RDS AI. Returns instance names, status, connection URLs, and other metadata. Use this tool to discover available Supabase instances before connecting.',
    inputSchema: ListInstancesInputZodSchema,
    mcpInputSchema: zodToJsonSchema(ListInstancesInputZodSchema),
    outputSchema: ListInstancesOutputZodSchema,
    execute,
};

export default listAliyunSupabaseInstancesTool;


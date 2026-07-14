/**
 * Get Current Supabase Instance Tool
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Input schema (no input needed)
const GetCurrentInstanceInputZodSchema = z.object({});

type GetCurrentInstanceInput = z.infer<typeof GetCurrentInstanceInputZodSchema>;

// Output schema
const GetCurrentInstanceOutputZodSchema = z.object({
    connected: z.boolean(),
    instance_name: z.string().optional(),
    message: z.string(),
});

type GetCurrentInstanceOutput = z.infer<typeof GetCurrentInstanceOutputZodSchema>;

/**
 * Get information about the currently connected Supabase instance
 */
async function execute(
    input: GetCurrentInstanceInput,
    getCurrentInstanceName: () => string | null,
    log: (message: string, level?: 'info' | 'error') => void
): Promise<GetCurrentInstanceOutput> {
    const currentInstance = getCurrentInstanceName();

    if (currentInstance) {
        log(`Currently connected to instance: ${currentInstance}`, 'info');
        return {
            connected: true,
            instance_name: currentInstance,
            message: `Connected to Supabase instance: ${currentInstance}`,
        };
    } else {
        log('Not connected to any Supabase instance', 'info');
        return {
            connected: false,
            message: 'Not connected to any Supabase instance. Use connect_to_supabase_instance to connect.',
        };
    }
}

export const getCurrentSupabaseInstanceTool = {
    name: 'get_current_supabase_instance',
    description: 'Get information about the currently connected Supabase instance. Returns the instance name if connected, or a message indicating no connection.',
    inputSchema: GetCurrentInstanceInputZodSchema,
    mcpInputSchema: zodToJsonSchema(GetCurrentInstanceInputZodSchema),
    outputSchema: GetCurrentInstanceOutputZodSchema,
    execute,
};

export default getCurrentSupabaseInstanceTool;


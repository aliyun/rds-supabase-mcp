/**
 * Disconnect from Supabase Instance Tool
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Input schema (no input needed)
const DisconnectInstanceInputZodSchema = z.object({});

type DisconnectInstanceInput = z.infer<typeof DisconnectInstanceInputZodSchema>;

// Output schema
const DisconnectInstanceOutputZodSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    previous_instance: z.string().optional(),
});

type DisconnectInstanceOutput = z.infer<typeof DisconnectInstanceOutputZodSchema>;

/**
 * Disconnect from the currently connected Supabase instance
 */
async function execute(
    input: DisconnectInstanceInput,
    getCurrentInstanceName: () => string | null,
    clearCurrentInstance: () => void,
    log: (message: string, level?: 'info' | 'error') => void
): Promise<DisconnectInstanceOutput> {
    const currentInstance = getCurrentInstanceName();

    if (!currentInstance) {
        log('No active connection to disconnect', 'info');
        return {
            success: false,
            message: 'Not connected to any Supabase instance',
        };
    }

    log(`Disconnecting from instance: ${currentInstance}`, 'info');
    clearCurrentInstance();
    log('Disconnected successfully', 'info');

    return {
        success: true,
        message: `Successfully disconnected from instance ${currentInstance}`,
        previous_instance: currentInstance,
    };
}

export const disconnectSupabaseInstanceTool = {
    name: 'disconnect_supabase_instance',
    description: 'Disconnect from the currently connected Supabase instance. After disconnecting, you need to connect to an instance again before using Supabase tools.',
    inputSchema: DisconnectInstanceInputZodSchema,
    mcpInputSchema: zodToJsonSchema(DisconnectInstanceInputZodSchema),
    outputSchema: DisconnectInstanceOutputZodSchema,
    execute,
};

export default disconnectSupabaseInstanceTool;


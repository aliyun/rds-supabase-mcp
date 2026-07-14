import { z } from 'zod';
import type { ToolContext } from './types.js';

// Input schema: User ID
const DeleteAuthUserInputSchema = z.object({
    user_id: z.string().uuid().describe('The UUID of the user to delete.'),
});
type DeleteAuthUserInput = z.infer<typeof DeleteAuthUserInputSchema>;

// Output schema: Success status and message
const DeleteAuthUserOutputSchema = z.object({
    success: z.boolean(),
    message: z.string(),
});

// Static JSON Schema for MCP capabilities
const mcpInputSchema = {
    type: 'object',
    properties: {
        user_id: {
            type: 'string',
            format: 'uuid',
            description: 'The UUID of the user to delete.',
        },
    },
    required: ['user_id'],
};

// Tool definition
export const deleteAuthUserTool = {
    name: 'delete_auth_user',
    description: 'Deletes a user using Supabase Admin API. Requires service role key.',
    inputSchema: DeleteAuthUserInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: DeleteAuthUserOutputSchema,

    execute: async (input: DeleteAuthUserInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const { user_id } = input;

        if (!client) {
            throw new Error('Supabase client is not initialized.');
        }

        context.log(`Deleting user ${user_id} using Supabase Admin API...`, 'info');

        try {
            // Use Supabase Admin API to delete user
            const { error } = await client.supabase.auth.admin.deleteUser(user_id);

            if (error) {
                context.log(`Error deleting user: ${error.message}`, 'error');
                return {
                    success: false,
                    message: `Failed to delete user: ${error.message}`,
                };
            }

            context.log(`User ${user_id} deleted successfully`, 'info');
            return {
                success: true,
                message: `Successfully deleted user with ID: ${user_id}`,
            };

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            context.log(`Error deleting user ${user_id}: ${errorMessage}`, 'error');
            throw new Error(`Failed to delete user ${user_id}: ${errorMessage}`);
        }
    },
};
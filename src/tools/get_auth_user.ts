import { z } from 'zod';
import type { ToolContext } from './types.js';
import type { AuthUser } from '../types/index.js';

// Input schema
const GetAuthUserInputSchema = z.object({
    user_id: z.string().uuid().describe('The UUID of the user to retrieve.'),
});
type GetAuthUserInput = z.infer<typeof GetAuthUserInputSchema>;

// Output schema - Zod for validation (single user)
const AuthUserZodSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email().nullable(),
    role: z.string().nullable(),
    created_at: z.string().nullable(),
    last_sign_in_at: z.string().nullable(),
    raw_app_meta_data: z.record(z.unknown()).nullable(),
    raw_user_meta_data: z.record(z.unknown()).nullable(),
    // Add more fields as needed
});
// Use AuthUser for the output type hint
type GetAuthUserOutput = AuthUser;

// Static JSON Schema for MCP
const mcpInputSchema = {
    type: 'object',
    properties: {
        user_id: {
            type: 'string',
            description: 'The UUID of the user to retrieve.',
            format: 'uuid', // Hint format if possible
        },
    },
    required: ['user_id'],
};

// Tool definition
export const getAuthUserTool = {
    name: 'get_auth_user',
    description: 'Retrieves details for a specific user from auth.users by their ID.',
    inputSchema: GetAuthUserInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: AuthUserZodSchema, // Use the single user Zod schema

    execute: async (input: GetAuthUserInput, context: ToolContext): Promise<GetAuthUserOutput> => {
        const client = context.selfhostedClient;
        const { user_id } = input;

        console.error(`Getting auth user ${user_id} using Supabase Admin API...`);

        try {
            // Use Supabase Admin API to get user
            const { data, error } = await client.supabase.auth.admin.getUserById(user_id);

            if (error) {
                context.log(`Error getting user: ${error.message}`, 'error');
                throw new Error(`Failed to get user: ${error.message}`);
            }

            if (!data || !data.user) {
                throw new Error(`User with ID ${user_id} not found.`);
            }

            // Transform Admin API response to match our schema
            const user = {
                id: data.user.id,
                email: data.user.email || null,
                role: data.user.role || null,
                created_at: data.user.created_at || null,
                last_sign_in_at: data.user.last_sign_in_at || null,
                raw_app_meta_data: data.user.app_metadata || null,
                raw_user_meta_data: data.user.user_metadata || null,
            };

            console.error(`Found user ${user_id}.`);
            context.log(`Found user ${user_id}.`);

            // Validate and return
            return AuthUserZodSchema.parse(user);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            context.log(`Error getting user: ${errorMessage}`, 'error');
            throw error;
        }
    },
}; 
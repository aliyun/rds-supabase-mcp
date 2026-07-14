import { z } from 'zod';
import type { ToolContext } from './types.js';
import type { AuthUser } from '../types/index.js';

// Input schema
const UpdateAuthUserInputSchema = z.object({
    user_id: z.string().uuid().describe('The UUID of the user to update.'),
    email: z.string().email().optional().describe('New email address.'),
    password: z.string().min(6).optional().describe('New plain text password (min 6 chars). WARNING: Insecure.'),
    role: z.string().optional().describe('New role.'),
    app_metadata: z.record(z.unknown()).optional().describe('New app metadata (will overwrite existing).'),
    user_metadata: z.record(z.unknown()).optional().describe('New user metadata (will overwrite existing).'),
}).refine(data => 
    data.email || data.password || data.role || data.app_metadata || data.user_metadata,
    { message: "At least one field to update (email, password, role, app_metadata, user_metadata) must be provided." }
);
type UpdateAuthUserInput = z.infer<typeof UpdateAuthUserInputSchema>;

// Output schema - Zod validation for the updated user
const UpdatedAuthUserZodSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email().nullable(),
    role: z.string().nullable(),
    created_at: z.string().nullable(),
    updated_at: z.string().nullable(), // Expect this to be updated
    last_sign_in_at: z.string().nullable(),
    raw_app_meta_data: z.record(z.unknown()).nullable(),
    raw_user_meta_data: z.record(z.unknown()).nullable(),
});
// Use AuthUser for the output type hint
type UpdateAuthUserOutput = AuthUser;

// Static JSON Schema for MCP
const mcpInputSchema = {
    type: 'object',
    properties: {
        user_id: { type: 'string', format: 'uuid', description: 'The UUID of the user to update.' },
        email: { type: 'string', format: 'email', description: 'New email address.' },
        password: { type: 'string', minLength: 6, description: 'New plain text password (min 6 chars). WARNING: Insecure.' },
        role: { type: 'string', description: 'New role.' },
        user_metadata: { type: 'object', description: 'New user metadata (will overwrite existing).' },
        app_metadata: { type: 'object', description: 'New app metadata (will overwrite existing).' },
    },
    required: ['user_id'],
};

// Tool definition
export const updateAuthUserTool = {
    name: 'update_auth_user',
    description: 'Updates fields for a user using Supabase Admin API. Requires service role key.',
    inputSchema: UpdateAuthUserInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: UpdatedAuthUserZodSchema,

    execute: async (input: UpdateAuthUserInput, context: ToolContext): Promise<UpdateAuthUserOutput> => {
        const client = context.selfhostedClient;
        const { user_id, email, password, role, app_metadata, user_metadata } = input;

        if (!client) {
            throw new Error('Supabase client is not initialized.');
        }

        context.log(`Updating user ${user_id} using Supabase Admin API...`, 'info');

        try {
            // Build update attributes
            const updateAttributes: {
                email?: string;
                password?: string;
                user_metadata?: Record<string, unknown>;
                app_metadata?: Record<string, unknown>;
            } = {};

            if (email !== undefined) {
                updateAttributes.email = email;
            }
            if (password !== undefined) {
                updateAttributes.password = password;
            }
            if (user_metadata !== undefined) {
                updateAttributes.user_metadata = user_metadata;
            }
            if (app_metadata !== undefined) {
                updateAttributes.app_metadata = app_metadata;
            }

            // Use Supabase Admin API to update user
            const { data, error } = await client.supabase.auth.admin.updateUserById(
                user_id,
                updateAttributes
            );

            if (error) {
                context.log(`Error updating user: ${error.message}`, 'error');
                throw new Error(`Failed to update user: ${error.message}`);
            }

            if (!data.user) {
                throw new Error('User update succeeded but no user data returned');
            }

            context.log(`User ${user_id} updated successfully`, 'info');

            // Map Supabase user to AuthUser format
            return {
                id: data.user.id,
                email: data.user.email || null,
                role: data.user.role || role || null,
                created_at: data.user.created_at || null,
                updated_at: data.user.updated_at || null,
                last_sign_in_at: data.user.last_sign_in_at || null,
                raw_app_meta_data: data.user.app_metadata || null,
                raw_user_meta_data: data.user.user_metadata || null,
            } as AuthUser;

        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            context.log(`Error updating user ${user_id}: ${errorMessage}`, 'error');
            throw error;
        }
    },
};
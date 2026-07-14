import { z } from 'zod';
import type { ToolContext } from './types.js';
import type { AuthUser } from '../types/index.js';

// Input schema
const CreateAuthUserInputSchema = z.object({
    email: z.string().email().describe('The email address for the new user.'),
    password: z.string().min(6).describe('Plain text password (min 6 chars). WARNING: Insecure.'),
    role: z.string().optional().describe('User role.'),
    app_metadata: z.record(z.unknown()).optional().describe('Optional app metadata.'),
    user_metadata: z.record(z.unknown()).optional().describe('Optional user metadata.'),
});
type CreateAuthUserInput = z.infer<typeof CreateAuthUserInputSchema>;

// Output schema - Zod validation for the created user (should match AuthUser structure)
const CreatedAuthUserZodSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email().nullable(),
    role: z.string().nullable(),
    created_at: z.string().nullable(),
    last_sign_in_at: z.string().nullable(), // Will likely be null on creation
    raw_app_meta_data: z.record(z.unknown()).nullable(),
    raw_user_meta_data: z.record(z.unknown()).nullable(),
    // Add other fields returned by the INSERT if necessary
});
// Use AuthUser for the output type hint
type CreateAuthUserOutput = AuthUser;

// Static JSON Schema for MCP capabilities
const mcpInputSchema = {
    type: 'object',
    properties: {
        email: { type: 'string', format: 'email', description: 'The email address for the new user.' },
        password: { type: 'string', minLength: 6, description: 'Plain text password (min 6 chars). WARNING: Insecure.' },
        role: { type: 'string', default: 'authenticated', description: 'User role.' },
        user_metadata: { type: 'object', description: 'Optional user metadata.' },
        app_metadata: { type: 'object', description: 'Optional app metadata.' },
    },
    required: ['email', 'password'],
};

// Tool definition
export const createAuthUserTool = {
    name: 'create_auth_user',
    description: 'Creates a new user using Supabase Admin API. Requires service role key.',
    inputSchema: CreateAuthUserInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: CreatedAuthUserZodSchema,

    execute: async (input: CreateAuthUserInput, context: ToolContext): Promise<CreateAuthUserOutput> => {
        const client = context.selfhostedClient;
        const { email, password, role, app_metadata, user_metadata } = input;

        if (!client) {
            throw new Error('Supabase client is not initialized.');
        }

        context.log(`Creating user ${email} using Supabase Admin API...`, 'info');

        try {
            // Use Supabase Admin API to create user
            const { data, error } = await client.supabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true, // Auto-confirm email
                user_metadata: user_metadata || {},
                app_metadata: app_metadata || {},
            });

            if (error) {
                context.log(`Error creating user: ${error.message}`, 'error');
                throw new Error(`Failed to create user: ${error.message}`);
            }

            if (!data.user) {
                throw new Error('User creation succeeded but no user data returned');
            }

            context.log(`User ${email} created successfully with ID: ${data.user.id}`, 'info');

            // Map Supabase user to AuthUser format
            return {
                id: data.user.id,
                email: data.user.email || null,
                role: data.user.role || role || 'authenticated',
                created_at: data.user.created_at || null,
                last_sign_in_at: data.user.last_sign_in_at || null,
                raw_app_meta_data: data.user.app_metadata || null,
                raw_user_meta_data: data.user.user_metadata || null,
            } as AuthUser;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            context.log(`Error creating user: ${errorMessage}`, 'error');
            throw error;
        }
    },
};
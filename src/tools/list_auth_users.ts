import { z } from 'zod';
import type { ToolContext } from './types.js';
import type { AuthUser } from '../types/index.js';

// Input schema (initially no filters, add later)
const ListAuthUsersInputSchema = z.object({
    limit: z.number().int().positive().optional().default(50).describe('Max number of users to return'),
    offset: z.number().int().nonnegative().optional().default(0).describe('Number of users to skip'),
    // Add filters later (e.g., by email pattern, role)
});
type ListAuthUsersInput = z.infer<typeof ListAuthUsersInputSchema>;

// Output schema - Zod for validation
const AuthUserZodSchema = z.object({
    id: z.string().uuid(),
    email: z.string().email().nullable(),
    role: z.string().nullable(),
    // Timestamps returned as text from DB might not strictly be ISO 8601 / Zod datetime compliant
    created_at: z.string().nullable(),
    last_sign_in_at: z.string().nullable(),
    raw_app_meta_data: z.record(z.unknown()).nullable(),
    raw_user_meta_data: z.record(z.unknown()).nullable(),
    // Add more fields as needed (e.g., email_confirmed_at, phone)
});
const ListAuthUsersOutputSchema = z.array(AuthUserZodSchema);
// Use AuthUser[] for the output type hint
type ListAuthUsersOutput = AuthUser[];

// Static JSON Schema for MCP capabilities
const mcpInputSchema = {
    type: 'object',
    properties: {
        limit: {
            type: 'number',
            description: 'Max number of users to return',
            default: 50,
        },
        offset: {
            type: 'number',
            description: 'Number of users to skip',
            default: 0,
        },
    },
    required: [],
};

// Tool definition
export const listAuthUsersTool = {
    name: 'list_auth_users',
    description: 'Lists users from the auth.users table.',
    inputSchema: ListAuthUsersInputSchema,
    mcpInputSchema: mcpInputSchema,
    outputSchema: ListAuthUsersOutputSchema,

    execute: async (input: ListAuthUsersInput, context: ToolContext): Promise<ListAuthUsersOutput> => {
        const client = context.selfhostedClient;
        const { limit, offset } = input;

        console.error('Listing auth users using Supabase Admin API...');

        try {
            // Use Supabase Admin API to list users
            const { data, error } = await client.supabase.auth.admin.listUsers({
                page: Math.floor(offset / limit) + 1,
                perPage: limit,
            });

            if (error) {
                context.log(`Error listing users: ${error.message}`, 'error');
                throw new Error(`Failed to list users: ${error.message}`);
            }

            if (!data || !data.users) {
                context.log('No users found or invalid response', 'warn');
                return [];
            }

            // Transform Admin API response to match our schema
            const users = data.users.map(user => ({
                id: user.id,
                email: user.email || null,
                role: user.role || null,
                created_at: user.created_at || null,
                last_sign_in_at: user.last_sign_in_at || null,
                raw_app_meta_data: user.app_metadata || null,
                raw_user_meta_data: user.user_metadata || null,
            }));

            console.error(`Found ${users.length} users.`);
            context.log(`Found ${users.length} users.`);

            // Validate and return
            return ListAuthUsersOutputSchema.parse(users);
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            context.log(`Error listing users: ${errorMessage}`, 'error');
            throw error;
        }
    },
};

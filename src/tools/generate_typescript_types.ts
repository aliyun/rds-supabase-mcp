import { z } from 'zod';
import { writeFileSync } from 'fs';
import { resolve, dirname, relative, isAbsolute } from 'path';
import { mkdirSync } from 'fs';
import type { ToolContext } from './types.js';
import { runExternalCommand } from './utils.js';

/**
 * Normalizes and validates the output path for cross-platform compatibility
 */
function normalizeOutputPath(inputPath: string, workspaceRoot: string): string {
    const root = resolve(workspaceRoot);
    const normalizedInput = process.platform === 'win32' && inputPath.match(/^\/[a-zA-Z]:/)
        ? `${inputPath.charAt(1).toUpperCase()}${inputPath.slice(2)}`
        : inputPath;
    const outputPath = resolve(root, normalizedInput);
    const relativePath = relative(root, outputPath);

    if (relativePath === '' || relativePath.startsWith('..') || isAbsolute(relativePath)) {
        throw new Error('output_path must be inside the configured workspace path');
    }

    return outputPath;
}

// Input schema
const GenerateTypesInputSchema = z.object({
    included_schemas: z.array(z.string()).optional().default(['public']).describe('Database schemas to include in type generation.'),
    output_filename: z.string().optional().default('database.types.ts').describe('Filename to save the generated types to in the workspace root.'),
    output_path: z.string().optional().describe('Path inside the workspace where the generated types should be saved. If provided, output_filename will be ignored.'),
});
type GenerateTypesInput = z.infer<typeof GenerateTypesInputSchema>;

// Output schema
const GenerateTypesOutputSchema = z.object({
    success: z.boolean(),
    message: z.string().describe('Output message from the generation process.'),
    types: z.string().optional().describe('The generated TypeScript types, if successful.'),
    file_path: z.string().optional().describe('The absolute path to the saved types file, if successful.'),
    platform: z.string().describe('Operating system platform (win32, darwin, linux).'),
});

// Static JSON Schema for MCP capabilities
const mcpInputSchema = {
    type: 'object',
    properties: {
        included_schemas: {
            type: 'array',
            items: { type: 'string' },
            default: ['public'],
            description: 'Database schemas to include in type generation.',
        },
        output_filename: {
            type: 'string',
            default: 'database.types.ts',
            description: 'Filename to save the generated types to in the workspace root.',
        },
        output_path: {
            type: 'string',
            description: 'Path inside the workspace where the generated TypeScript file should be saved.',
        },
    },
    required: [],
};

// The tool definition - No explicit McpToolDefinition type needed
export const generateTypesTool = {
    name: 'generate_typescript_types',
    description: 'Generates TypeScript types from the database schema using the Supabase CLI (`supabase gen types`) and saves the file inside the configured workspace. Requires DATABASE_URL configuration and Supabase CLI installed.',
    inputSchema: GenerateTypesInputSchema,
    mcpInputSchema: mcpInputSchema, // Add static JSON schema
    outputSchema: GenerateTypesOutputSchema,
    execute: async (input: GenerateTypesInput, context: ToolContext) => {
        const client = context.selfhostedClient;
        const dbUrl = client.getDbUrl(); // Need this getter in the client

        if (!dbUrl) {
            return {
                success: false,
                message: 'Error: DATABASE_URL is not configured. Cannot generate types.',
                platform: process.platform,
            };
        }

        const schemas = input.included_schemas.join(','); // Comma-separated for the CLI flag
        const command = process.platform === 'win32' ? 'supabase.cmd' : 'supabase';
        const args = ['gen', 'types', 'typescript', '--db-url', dbUrl, '--schema', schemas];

        console.error('Running supabase gen types with the configured database URL.');

        try {
            const { stdout, stderr, error } = await runExternalCommand(command, args);

            if (error) {
                console.error(`Error executing supabase gen types: ${stderr || error.message}`);
                return {
                    success: false,
                    message: `Command failed: ${stderr || error.message}`,
                    platform: process.platform,
                };
            }

            if (stderr) {
                console.error(`supabase gen types produced stderr output: ${stderr}`);
                 // Treat stderr as non-fatal for now, maybe just warnings
            }

            // Normalize and save the generated types to the specified absolute path
            let outputPath: string;
            try {
                outputPath = normalizeOutputPath(input.output_path ?? input.output_filename, context.workspacePath ?? process.cwd());
                console.error(`Normalized output path: ${outputPath}`);
            } catch (pathError) {
                const pathErrorMessage = pathError instanceof Error ? pathError.message : String(pathError);
                console.error(`Invalid output path: ${pathErrorMessage}`);
                return {
                    success: false,
                    message: `Invalid output path "${input.output_path ?? input.output_filename}": ${pathErrorMessage}`,
                    platform: process.platform,
                };
            }

            try {
                // Ensure the directory exists
                const outputDir = dirname(outputPath);
                try {
                    mkdirSync(outputDir, { recursive: true });
                } catch (dirError) {
                    // Ignore error if directory already exists
                    if ((dirError as NodeJS.ErrnoException).code !== 'EEXIST') {
                        throw dirError;
                    }
                }

                writeFileSync(outputPath, stdout, 'utf8');
                console.error(`Types saved to: ${outputPath}`);
            } catch (writeError) {
                const writeErrorMessage = writeError instanceof Error ? writeError.message : String(writeError);
                console.error(`Failed to write types file: ${writeErrorMessage}`);
                return {
                    success: false,
                    message: `Type generation succeeded but failed to save file: ${writeErrorMessage}. Platform: ${process.platform}. Attempted path: ${outputPath}`,
                    types: stdout,
                    platform: process.platform,
                };
            }

            console.error('Type generation and file save successful.');
            return {
                success: true,
                message: `Types generated successfully and saved to ${outputPath}.${stderr ? `\nWarnings:\n${stderr}` : ''}`,
                types: stdout,
                file_path: outputPath,
                platform: process.platform,
            };

        } catch (err: unknown) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            console.error(`Exception during type generation: ${errorMessage}`);
            return {
                success: false,
                message: `Exception during type generation: ${errorMessage}. Platform: ${process.platform}`,
                platform: process.platform,
            };
        }
    },
};

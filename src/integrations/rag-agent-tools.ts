/**
 * RAG Agent Tools Wrapper
 * Converts rag-agent MCP tools to the AppTool format used in this project
 */

import { z } from 'zod';
import type { ToolContext } from '../tools/types.js';
import type { RagAgentClient, RagAgentTool } from './rag-agent-client.js';

/**
 * Converts a rag-agent tool to an AppTool
 */
export function wrapRagAgentTool(ragTool: RagAgentTool, ragClient: RagAgentClient) {
    // Create a dynamic Zod schema based on the JSON schema
    // For simplicity, we'll use z.any() and rely on the MCP server's validation
    const inputSchema = z.any();

    return {
        name: `rag_${ragTool.name}`,  // Prefix with 'rag_' to avoid naming conflicts
        description: ragTool.description || `RAG Agent tool: ${ragTool.name}`,
        inputSchema: inputSchema,
        mcpInputSchema: ragTool.inputSchema,
        outputSchema: z.any(),
        execute: async (input: unknown, context: ToolContext) => {
            context.log(`Calling RAG Agent tool: ${ragTool.name}`, 'info');
            
            try {
                const result = await ragClient.callTool(ragTool.name, input);
                return result;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                context.log(`Error calling RAG Agent tool ${ragTool.name}: ${errorMessage}`, 'error');
                throw new Error(`RAG Agent tool error: ${errorMessage}`);
            }
        },
    };
}

/**
 * Wraps all tools from a RAG Agent client
 */
export function wrapAllRagAgentTools(ragClient: RagAgentClient) {
    const tools = ragClient.getTools();
    const wrappedTools: Record<string, ReturnType<typeof wrapRagAgentTool>> = {};

    for (const tool of tools) {
        const wrapped = wrapRagAgentTool(tool, ragClient);
        wrappedTools[wrapped.name] = wrapped;
    }

    return wrappedTools;
}


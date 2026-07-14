import type { SelfhostedSupabaseClient } from '../client/index.js';
import { AuthMode, ToolPermissionLevel } from '../config/index.js';

// Define log function type
type LogFunction = (message: string, level?: 'info' | 'warn' | 'error') => void;

/**
 * User information for user-level authentication mode
 */
export interface UserInfo {
    /** User's unique identifier */
    userId: string;
    /** User's email address */
    email: string;
}

/**
 * Defines the expected shape of the context object passed to tool execute functions.
 */
export interface ToolContext {
    /** The Supabase client instance */
    selfhostedClient: SelfhostedSupabaseClient;
    /** Logging function for tool output */
    log: LogFunction;
    /** Path to the workspace root */
    workspacePath?: string;
    /** The current authentication mode */
    authMode: AuthMode;
    /** The permission level based on auth mode */
    permissionLevel: ToolPermissionLevel;
    /** User information (only set for AuthMode.SINGLE_INSTANCE_USER) */
    userInfo?: UserInfo;
    /** Allow other context properties */
    [key: string]: unknown;
}

/**
 * Tools that require admin-level permissions (not available in user mode)
 */
export const ADMIN_ONLY_TOOLS = new Set([
    // Auth management tools
    'create_auth_user',
    'delete_auth_user',
    'update_auth_user',
    'list_auth_users',
    'get_auth_user',
    // Admin configuration tools
    'get_service_key',
    'verify_jwt_secret',
    'install_execute_sql_function',
    'rebuild_hooks',
]);

/**
 * Tools that are only available in Aliyun multi-instance mode
 */
export const ALIYUN_ONLY_TOOLS = new Set([
    'list_aliyun_supabase_instances',
    'connect_to_supabase_instance',
    'get_current_supabase_instance',
    'disconnect_supabase_instance',
]);

/**
 * Check if a tool is allowed for the given permission level
 */
export function isToolAllowed(toolName: string, permissionLevel: ToolPermissionLevel): boolean {
    switch (permissionLevel) {
        case ToolPermissionLevel.FULL:
            // Full access - all tools allowed
            return true;
            
        case ToolPermissionLevel.ADMIN:
            // Admin access - no Aliyun management tools
            return !ALIYUN_ONLY_TOOLS.has(toolName);
            
        case ToolPermissionLevel.USER:
            // User access - no Aliyun tools and no admin tools
            return !ALIYUN_ONLY_TOOLS.has(toolName) && !ADMIN_ONLY_TOOLS.has(toolName);
            
        default:
            return false;
    }
}

/**
 * Get a user-friendly error message when a tool is not allowed
 */
export function getToolNotAllowedMessage(toolName: string, permissionLevel: ToolPermissionLevel): string {
    if (ALIYUN_ONLY_TOOLS.has(toolName)) {
        return `Tool "${toolName}" is only available in Alibaba Cloud multi-instance management mode. Please use --aliyun-ak and --aliyun-sk to enable this mode.`;
    }
    
    if (ADMIN_ONLY_TOOLS.has(toolName) && permissionLevel === ToolPermissionLevel.USER) {
        return `Tool "${toolName}" requires admin permissions and is not available in user-level access mode. Please use --supabase-service-role-key for admin access.`;
    }
    
    return `Tool "${toolName}" is not allowed for the current permission level (${permissionLevel}).`;
}

/**
 * Authentication Configuration Types
 * 
 * Defines the three-tier authentication architecture:
 * - Tier 1: Alibaba Cloud Multi-Instance Management (AKSK)
 * - Tier 2: Single Instance Admin Access (Service Role Key)
 * - Tier 3: Single Instance User Access (Supabase Auth + RLS)
 */

/**
 * Authentication mode enumeration
 */
export enum AuthMode {
    /** Tier 1: Alibaba Cloud multi-instance management via AKSK */
    ALIYUN_MULTI_INSTANCE = 'aliyun',
    /** Tier 2: Single instance admin access with service role key */
    SINGLE_INSTANCE_ADMIN = 'admin',
    /** Tier 3: Single instance user access with Supabase Auth (RLS restricted) */
    SINGLE_INSTANCE_USER = 'user'
}

/**
 * Common configuration options shared across all modes
 */
export interface CommonConfig {
    /** Enable RAG Agent MCP integration */
    enableRagAgent?: boolean;
    /** Workspace root path for file operations */
    workspacePath?: string;
    /** Path to tools configuration JSON file */
    toolsConfig?: string;
}

/**
 * Tier 1: Alibaba Cloud Multi-Instance Management Configuration
 * 
 * Used by administrators who need to manage multiple Supabase instances
 * through Alibaba Cloud RDS AI service.
 */
export interface AliyunConfig extends CommonConfig {
    mode: AuthMode.ALIYUN_MULTI_INSTANCE;
    /** Alibaba Cloud Access Key ID */
    accessKeyId: string;
    /** Alibaba Cloud Access Key Secret */
    accessKeySecret: string;
    /** Alibaba Cloud region (e.g., cn-hangzhou) */
    regionId?: string;
}

/**
 * Tier 2: Single Instance Admin Configuration
 * 
 * Used by developers who need full admin access to a single Supabase instance.
 * Provides service_role level permissions.
 */
export interface SingleInstanceAdminConfig extends CommonConfig {
    mode: AuthMode.SINGLE_INSTANCE_ADMIN;
    /** Supabase instance URL */
    supabaseUrl: string;
    /** Supabase anonymous key */
    supabaseAnonKey: string;
    /** Supabase service role key (required for admin operations) */
    supabaseServiceRoleKey: string;
    /** Direct database connection string (optional, for pg fallback) */
    databaseUrl?: string;
    /** JWT secret for token verification (optional) */
    jwtSecret?: string;
}

/**
 * Tier 3: Single Instance User Configuration
 * 
 * Used by end users who access Supabase with their own credentials.
 * Access is restricted by Row Level Security (RLS) policies.
 */
export interface SingleInstanceUserConfig extends CommonConfig {
    mode: AuthMode.SINGLE_INSTANCE_USER;
    /** Supabase instance URL */
    supabaseUrl: string;
    /** Supabase anonymous key (used for initial client setup) */
    supabaseAnonKey: string;
    /** User email for Supabase Auth login */
    userEmail: string;
    /** User password for Supabase Auth login */
    userPassword: string;
}

/**
 * Union type for all authentication configurations
 */
export type AuthConfig = AliyunConfig | SingleInstanceAdminConfig | SingleInstanceUserConfig;

/**
 * Raw command line options parsed by commander
 */
export interface RawCommandOptions {
    // Alibaba Cloud options
    aliyunAk?: string;
    aliyunSk?: string;
    aliyunRegion?: string;
    
    // Supabase instance options (legacy names for backward compatibility)
    url?: string;
    anonKey?: string;
    serviceKey?: string;
    dbUrl?: string;
    jwtSecret?: string;
    
    // New Supabase options with consistent naming
    supabaseUrl?: string;
    supabaseAnonKey?: string;
    supabaseServiceRoleKey?: string;
    
    // User authentication options
    supabaseUserEmail?: string;
    supabaseUserPassword?: string;
    
    // Common options
    enableRagAgent?: boolean;
    workspacePath?: string;
    toolsConfig?: string;
}

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
    constructor(
        message: string,
        public readonly missingParams?: string[],
        public readonly conflictingModes?: AuthMode[]
    ) {
        super(message);
        this.name = 'ConfigValidationError';
    }
}

/**
 * Type guard for Aliyun configuration
 */
export function isAliyunConfig(config: AuthConfig): config is AliyunConfig {
    return config.mode === AuthMode.ALIYUN_MULTI_INSTANCE;
}

/**
 * Type guard for Single Instance Admin configuration
 */
export function isSingleInstanceAdminConfig(config: AuthConfig): config is SingleInstanceAdminConfig {
    return config.mode === AuthMode.SINGLE_INSTANCE_ADMIN;
}

/**
 * Type guard for Single Instance User configuration
 */
export function isSingleInstanceUserConfig(config: AuthConfig): config is SingleInstanceUserConfig {
    return config.mode === AuthMode.SINGLE_INSTANCE_USER;
}

/**
 * Tool permission level based on authentication mode
 */
export enum ToolPermissionLevel {
    /** Full access - all tools available */
    FULL = 'full',
    /** Admin access - no Aliyun management tools */
    ADMIN = 'admin',
    /** User access - RLS restricted, no admin tools */
    USER = 'user'
}

/**
 * Get the permission level for a given authentication mode
 */
export function getPermissionLevel(mode: AuthMode): ToolPermissionLevel {
    switch (mode) {
        case AuthMode.ALIYUN_MULTI_INSTANCE:
            return ToolPermissionLevel.FULL;
        case AuthMode.SINGLE_INSTANCE_ADMIN:
            return ToolPermissionLevel.ADMIN;
        case AuthMode.SINGLE_INSTANCE_USER:
            return ToolPermissionLevel.USER;
    }
}





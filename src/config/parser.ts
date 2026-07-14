/**
 * Configuration Parser and Validator
 * 
 * Handles parsing of command line options into typed configuration objects,
 * validates configuration completeness, and detects conflicts between modes.
 */

import {
    AuthMode,
    AuthConfig,
    AliyunConfig,
    SingleInstanceAdminConfig,
    SingleInstanceUserConfig,
    RawCommandOptions,
    ConfigValidationError,
} from './types.js';

/**
 * Detects which authentication modes have partial or complete configuration
 */
interface DetectedModes {
    aliyun: { hasRequired: boolean; hasAny: boolean };
    admin: { hasRequired: boolean; hasAny: boolean };
    user: { hasRequired: boolean; hasAny: boolean };
}

/**
 * Detect which authentication modes are configured
 */
function detectModes(options: RawCommandOptions): DetectedModes {
    // Normalize options - support both legacy and new naming
    const supabaseUrl = options.supabaseUrl || options.url;
    const supabaseAnonKey = options.supabaseAnonKey || options.anonKey;
    const supabaseServiceRoleKey = options.supabaseServiceRoleKey || options.serviceKey;

    return {
        aliyun: {
            hasRequired: !!(options.aliyunAk && options.aliyunSk),
            hasAny: !!(options.aliyunAk || options.aliyunSk || options.aliyunRegion),
        },
        admin: {
            hasRequired: !!(supabaseUrl && supabaseAnonKey && supabaseServiceRoleKey),
            hasAny: !!(supabaseUrl || supabaseAnonKey || supabaseServiceRoleKey),
        },
        user: {
            hasRequired: !!(supabaseUrl && supabaseAnonKey && options.supabaseUserEmail && options.supabaseUserPassword),
            hasAny: !!(options.supabaseUserEmail || options.supabaseUserPassword),
        },
    };
}

/**
 * Generate a helpful error message when configuration is missing or invalid
 */
function generateHelpMessage(modes: DetectedModes, options: RawCommandOptions): string {
    const lines: string[] = [
        'Error: No valid authentication configuration found.',
        '',
        'Please provide ONE of the following configurations:',
        '',
    ];

    // Mode 1 help
    lines.push('Mode 1 - Alibaba Cloud Multi-Instance Management:');
    lines.push('  --aliyun-ak <key> --aliyun-sk <secret> [--aliyun-region <region>]');
    lines.push('  Or: ALIYUN_ACCESS_KEY_ID, ALIYUN_ACCESS_KEY_SECRET');
    if (modes.aliyun.hasAny && !modes.aliyun.hasRequired) {
        const missing: string[] = [];
        if (!options.aliyunAk) missing.push('--aliyun-ak');
        if (!options.aliyunSk) missing.push('--aliyun-sk');
        lines.push(`  ⚠️  Missing: ${missing.join(', ')}`);
    }
    lines.push('');

    // Mode 2 help
    const supabaseUrl = options.supabaseUrl || options.url;
    const supabaseAnonKey = options.supabaseAnonKey || options.anonKey;
    const supabaseServiceRoleKey = options.supabaseServiceRoleKey || options.serviceKey;

    lines.push('Mode 2 - Single Instance Admin Access:');
    lines.push('  --supabase-url <url> --supabase-anon-key <key> --supabase-service-role-key <key>');
    lines.push('  Or: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY');
    if (modes.admin.hasAny && !modes.admin.hasRequired) {
        const missing: string[] = [];
        if (!supabaseUrl) missing.push('--supabase-url');
        if (!supabaseAnonKey) missing.push('--supabase-anon-key');
        if (!supabaseServiceRoleKey) missing.push('--supabase-service-role-key');
        lines.push(`  ⚠️  Missing: ${missing.join(', ')}`);
    }
    lines.push('');

    // Mode 3 help
    lines.push('Mode 3 - Single Instance User Access (RLS restricted):');
    lines.push('  --supabase-url <url> --supabase-anon-key <key> --supabase-user-email <email> --supabase-user-password <password>');
    lines.push('  Or: SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_USER_EMAIL, SUPABASE_USER_PASSWORD');
    if (modes.user.hasAny && !modes.user.hasRequired) {
        const missing: string[] = [];
        if (!supabaseUrl) missing.push('--supabase-url');
        if (!supabaseAnonKey) missing.push('--supabase-anon-key');
        if (!options.supabaseUserEmail) missing.push('--supabase-user-email');
        if (!options.supabaseUserPassword) missing.push('--supabase-user-password');
        lines.push(`  ⚠️  Missing: ${missing.join(', ')}`);
    }

    return lines.join('\n');
}

/**
 * Parse and validate command line options into a typed configuration
 * 
 * Priority order: Tier 1 (Aliyun) > Tier 2 (Admin) > Tier 3 (User)
 * 
 * @throws ConfigValidationError if configuration is invalid or missing
 */
export function parseConfig(options: RawCommandOptions): AuthConfig {
    const modes = detectModes(options);

    // Normalize Supabase options - support both legacy and new naming
    const supabaseUrl = options.supabaseUrl || options.url;
    const supabaseAnonKey = options.supabaseAnonKey || options.anonKey;
    const supabaseServiceRoleKey = options.supabaseServiceRoleKey || options.serviceKey;

    // Check for configuration conflicts and warn
    const completeModes: AuthMode[] = [];
    if (modes.aliyun.hasRequired) completeModes.push(AuthMode.ALIYUN_MULTI_INSTANCE);
    if (modes.admin.hasRequired) completeModes.push(AuthMode.SINGLE_INSTANCE_ADMIN);
    if (modes.user.hasRequired) completeModes.push(AuthMode.SINGLE_INSTANCE_USER);

    if (completeModes.length > 1) {
        console.error(`Warning: Multiple authentication modes detected: ${completeModes.join(', ')}`);
        console.error('Using highest priority mode based on: Aliyun > Admin > User');
    }

    // Priority 1: Alibaba Cloud mode
    if (modes.aliyun.hasRequired) {
        const config: AliyunConfig = {
            mode: AuthMode.ALIYUN_MULTI_INSTANCE,
            accessKeyId: options.aliyunAk!,
            accessKeySecret: options.aliyunSk!,
            regionId: options.aliyunRegion,
            enableRagAgent: options.enableRagAgent,
            workspacePath: options.workspacePath,
            toolsConfig: options.toolsConfig,
        };
        return config;
    }

    // Priority 2: Check if user mode is configured (before admin mode)
    // This is because user mode requires additional params beyond admin mode
    if (modes.user.hasRequired) {
        const config: SingleInstanceUserConfig = {
            mode: AuthMode.SINGLE_INSTANCE_USER,
            supabaseUrl: supabaseUrl!,
            supabaseAnonKey: supabaseAnonKey!,
            userEmail: options.supabaseUserEmail!,
            userPassword: options.supabaseUserPassword!,
            enableRagAgent: options.enableRagAgent,
            workspacePath: options.workspacePath,
            toolsConfig: options.toolsConfig,
        };
        return config;
    }

    // Priority 3: Admin mode
    if (modes.admin.hasRequired) {
        const config: SingleInstanceAdminConfig = {
            mode: AuthMode.SINGLE_INSTANCE_ADMIN,
            supabaseUrl: supabaseUrl!,
            supabaseAnonKey: supabaseAnonKey!,
            supabaseServiceRoleKey: supabaseServiceRoleKey!,
            databaseUrl: options.dbUrl,
            jwtSecret: options.jwtSecret,
            enableRagAgent: options.enableRagAgent,
            workspacePath: options.workspacePath,
            toolsConfig: options.toolsConfig,
        };
        return config;
    }

    // No valid configuration found
    const helpMessage = generateHelpMessage(modes, options);
    throw new ConfigValidationError(helpMessage);
}

/**
 * Validate that a configuration is complete and internally consistent
 */
export function validateConfig(config: AuthConfig): void {
    switch (config.mode) {
        case AuthMode.ALIYUN_MULTI_INSTANCE: {
            const aliyunConfig = config as AliyunConfig;
            if (!aliyunConfig.accessKeyId || !aliyunConfig.accessKeySecret) {
                throw new ConfigValidationError(
                    'Alibaba Cloud mode requires both accessKeyId and accessKeySecret',
                    ['accessKeyId', 'accessKeySecret']
                );
            }
            break;
        }
        case AuthMode.SINGLE_INSTANCE_ADMIN: {
            const adminConfig = config as SingleInstanceAdminConfig;
            const missing: string[] = [];
            if (!adminConfig.supabaseUrl) missing.push('supabaseUrl');
            if (!adminConfig.supabaseAnonKey) missing.push('supabaseAnonKey');
            if (!adminConfig.supabaseServiceRoleKey) missing.push('supabaseServiceRoleKey');
            if (missing.length > 0) {
                throw new ConfigValidationError(
                    `Single Instance Admin mode requires: ${missing.join(', ')}`,
                    missing
                );
            }
            break;
        }
        case AuthMode.SINGLE_INSTANCE_USER: {
            const userConfig = config as SingleInstanceUserConfig;
            const missing: string[] = [];
            if (!userConfig.supabaseUrl) missing.push('supabaseUrl');
            if (!userConfig.supabaseAnonKey) missing.push('supabaseAnonKey');
            if (!userConfig.userEmail) missing.push('userEmail');
            if (!userConfig.userPassword) missing.push('userPassword');
            if (missing.length > 0) {
                throw new ConfigValidationError(
                    `Single Instance User mode requires: ${missing.join(', ')}`,
                    missing
                );
            }
            break;
        }
    }
}

/**
 * Get a human-readable description of the authentication mode
 */
export function getAuthModeDescription(mode: AuthMode): string {
    switch (mode) {
        case AuthMode.ALIYUN_MULTI_INSTANCE:
            return 'Alibaba Cloud Multi-Instance Management';
        case AuthMode.SINGLE_INSTANCE_ADMIN:
            return 'Single Instance Admin Access';
        case AuthMode.SINGLE_INSTANCE_USER:
            return 'Single Instance User Access (RLS restricted)';
    }
}





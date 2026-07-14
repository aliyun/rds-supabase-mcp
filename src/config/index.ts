/**
 * Configuration Module
 * 
 * Exports all configuration types, parsing, and validation utilities.
 */

export {
    // Enums
    AuthMode,
    ToolPermissionLevel,
    
    // Interfaces
    type CommonConfig,
    type AliyunConfig,
    type SingleInstanceAdminConfig,
    type SingleInstanceUserConfig,
    type AuthConfig,
    type RawCommandOptions,
    
    // Error class
    ConfigValidationError,
    
    // Type guards
    isAliyunConfig,
    isSingleInstanceAdminConfig,
    isSingleInstanceUserConfig,
    
    // Utility functions
    getPermissionLevel,
} from './types.js';

export {
    parseConfig,
    validateConfig,
    getAuthModeDescription,
} from './parser.js';





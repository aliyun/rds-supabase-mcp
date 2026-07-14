/**
 * Alibaba Cloud RDS AI API Type Definitions
 */

/**
 * Configuration for Alibaba Cloud API client
 */
export interface AliyunConfig {
    accessKeyId: string;
    accessKeySecret: string;
    endpoint?: string;
    regionId?: string;
}

/**
 * Supabase instance information from DescribeAppInstances
 */
export interface SupabaseInstance {
    /** AI application instance ID */
    instanceName: string;
    /** Application type (always 'supabase') */
    appType: string;
    /** Instance minor version */
    instanceMinorVersion: number;
    /** VSwitch ID */
    vSwitchId: string;
    /** Instance class/specification */
    instanceClass: string;
    /** Instance status */
    status: string;
    /** RDS PostgreSQL database instance ID */
    dbInstanceName: string;
    /** Region ID */
    regionId: string;
    /** Application name */
    appName: string;
    /** Public connection string */
    publicConnectionString: string;
    /** VPC connection string */
    vpcConnectionString: string;
}

/**
 * Response from DescribeAppInstances API
 */
export interface DescribeAppInstancesResponse {
    requestId: string;
    totalCount: number;
    maxResults: number;
    pageNumber: number;
    pageSize: number;
    instances: SupabaseInstance[];
}

/**
 * Instance endpoint information
 */
export interface InstanceEndpoint {
    /** IP type: 'public' or 'vpc' */
    ipType: string;
    /** IP address */
    ip: string;
    /** Port number */
    port: number;
    /** Connection string (IP:Port) */
    connectionString: string;
}

/**
 * Response from DescribeInstanceEndpoints API
 */
export interface DescribeInstanceEndpointsResponse {
    requestId: string;
    instanceName: string;
    instanceEndpoints: InstanceEndpoint[];
}

/**
 * API keys from DescribeInstanceAuthInfo
 */
export interface ApiKeys {
    /** Anonymous key (JWT) */
    anonKey: string;
    /** Service role key (JWT) */
    serviceKey: string;
}

/**
 * Configuration item
 */
export interface ConfigItem {
    /** Configuration name */
    name: string;
    /** Configuration value */
    value: string;
}

/**
 * Response from DescribeInstanceAuthInfo API
 */
export interface DescribeInstanceAuthInfoResponse {
    requestId: string;
    instanceName: string;
    /** JWT secret for signing tokens */
    jwtSecret: string;
    /** API keys (anon and service) */
    apiKeys: ApiKeys;
    /** Additional configuration items */
    configList: ConfigItem[];
}

/**
 * Complete credentials for a Supabase instance
 */
export interface SupabaseCredentials {
    /** Instance name */
    instanceName: string;
    /** Supabase URL (http://IP:Port) */
    supabaseUrl: string;
    /** Anonymous key */
    anonKey: string;
    /** Service role key */
    serviceKey: string;
    /** JWT secret */
    jwtSecret: string;
    /** Whether using VPC connection */
    useVpc: boolean;
}


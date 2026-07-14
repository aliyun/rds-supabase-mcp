/**
 * Alibaba Cloud RDS AI API Client
 * Provides methods to interact with Alibaba Cloud RDS AI OpenAPI
 */

import RdsAiPkg from '@alicloud/rdsai20250507/dist/client.js';
import * as $RdsAi from '@alicloud/rdsai20250507';
import type {
    AliyunConfig,
    SupabaseInstance,
    DescribeAppInstancesResponse,
    DescribeInstanceAuthInfoResponse,
    SupabaseCredentials,
} from './types.js';

// Extract the Client class from CommonJS default export
const RdsAiClient = (RdsAiPkg as any).default || RdsAiPkg;

const RDSAI_DEFAULT_ENDPOINT = 'rdsai.aliyuncs.com';

const RDSAI_CENTER_UNIT_REGIONS = new Set([
    'cn-beijing',
    'cn-wulanchabu',
    'cn-hangzhou',
    'cn-shanghai',
    'cn-shenzhen',
    'cn-guangzhou',
]);

function resolveRdsAiEndpoint(regionId?: string, explicitEndpoint?: string): string {
    if (explicitEndpoint) {
        return explicitEndpoint;
    }

    if (!regionId || RDSAI_CENTER_UNIT_REGIONS.has(regionId)) {
        return RDSAI_DEFAULT_ENDPOINT;
    }

    return `rdsai.${regionId}.aliyuncs.com`;
}

/**
 * Alibaba Cloud RDS AI API Client
 */
export class AliyunRdsAiClient {
    private clientCache: Map<string, any>;
    private config: AliyunConfig;

    constructor(config: AliyunConfig) {
        this.config = config;
        this.clientCache = new Map<string, any>();

        const defaultEndpoint = resolveRdsAiEndpoint(config.regionId, config.endpoint);
        this.clientCache.set(defaultEndpoint, this.createClient(defaultEndpoint, config.regionId));
    }

    private createClient(endpoint: string, regionId?: string): any {
        const openApiConfig = {
            accessKeyId: this.config.accessKeyId,
            accessKeySecret: this.config.accessKeySecret,
            endpoint,
            regionId,
        };

        return new RdsAiClient(openApiConfig);
    }

    private getClientForRegion(regionId?: string): any {
        const effectiveRegionId = regionId || this.config.regionId;
        const endpoint = resolveRdsAiEndpoint(effectiveRegionId, this.config.endpoint);
        const cached = this.clientCache.get(endpoint);
        if (cached) {
            return cached;
        }

        const client = this.createClient(endpoint, effectiveRegionId);
        this.clientCache.set(endpoint, client);
        return client;
    }

    /**
     * List all Supabase instances
     */
    async listSupabaseInstances(options?: {
        regionId?: string;
        dbInstanceName?: string;
        pageSize?: number;
        pageNumber?: number;
    }): Promise<DescribeAppInstancesResponse> {
        const regionId = options?.regionId || this.config.regionId;
        const request = new $RdsAi.DescribeAppInstancesRequest({
            appType: 'supabase',
            regionId,
            DBInstanceName: options?.dbInstanceName,
            pageSize: options?.pageSize || 50,
            pageNumber: options?.pageNumber || 1,
        });

        try {
            const response = await this.getClientForRegion(regionId).describeAppInstances(request);

            if (!response.body) {
                throw new Error('Empty response from DescribeAppInstances API');
            }

            // Convert response to our type
            // Note: API returns snake_case fields, we need to handle both formats
            const instances: SupabaseInstance[] = (response.body.instances || []).map((inst: any) => ({
                instanceName: inst.instanceName || inst.instance_name || '',
                appType: inst.appType || inst.app_type || 'supabase',
                instanceMinorVersion: inst.instanceMinorVersion || inst.instance_minor_version || 0,
                vSwitchId: inst.VSwitchId || inst.v_switch_id || '',
                instanceClass: inst.instanceClass || inst.instance_class || '',
                status: inst.status || '',
                dbInstanceName: inst.DBInstanceName || inst.db_instance_name || '',
                regionId: inst.regionId || inst.region_id || '',
                appName: inst.appName || inst.app_name || '',
                publicConnectionString: inst.publicConnectionString || inst.public_connection_string || inst.publicUrl || inst.public_url || '',
                vpcConnectionString: inst.vpcConnectionString || inst.vpc_connection_string || inst.vpcUrl || inst.vpc_url || '',
            }));

            return {
                requestId: response.body.requestId || '',
                totalCount: response.body.totalCount || 0,
                maxResults: response.body.maxResults || 0,
                pageNumber: response.body.pageNumber || 1,
                pageSize: response.body.pageSize || 0,
                instances,
            };
        } catch (error: any) {
            console.error('Error calling DescribeAppInstances:', JSON.stringify(error, null, 2));
            console.error('Error code:', error?.code);
            console.error('Error data:', error?.data);
            throw new Error(`Failed to list Supabase instances: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get authentication information for a specific instance
     */
    async getInstanceAuthInfo(instanceName: string, regionId?: string): Promise<DescribeInstanceAuthInfoResponse> {
        const request = new $RdsAi.DescribeInstanceAuthInfoRequest({
            instanceName,
        });

        try {
            const response = await this.getClientForRegion(regionId || this.config.regionId).describeInstanceAuthInfo(request);

            if (!response.body) {
                throw new Error('Empty response from DescribeInstanceAuthInfo API');
            }

            return {
                requestId: response.body.requestId || '',
                instanceName: response.body.instanceName || '',
                jwtSecret: response.body.jwtSecret || '',
                apiKeys: {
                    anonKey: response.body.apiKeys?.anonKey || '',
                    serviceKey: response.body.apiKeys?.serviceKey || '',
                },
                configList: (response.body.configList || []).map((item: any) => ({
                    name: item.name || '',
                    value: item.value || '',
                })),
            };
        } catch (error) {
            console.error('Error calling DescribeInstanceAuthInfo:', error);
            throw new Error(`Failed to get instance auth info: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Get complete credentials for a Supabase instance
     */
    async getSupabaseCredentials(instanceName: string, useVpc: boolean = false, regionId?: string): Promise<SupabaseCredentials> {
        // First, get the instance info to get the connection string
        // Use the provided regionId or fall back to the client's default regionId
        const queryRegion = regionId || this.config.regionId;

        const instancesResponse = await this.listSupabaseInstances({
            regionId: queryRegion,
        });

        const instance = instancesResponse.instances.find(inst => inst.instanceName === instanceName);

        if (!instance) {
            throw new Error(`Instance ${instanceName} not found. Available instances: ${instancesResponse.instances.map(i => i.instanceName).join(', ')}`);
        }

        // Get authentication info
        const authInfo = await this.getInstanceAuthInfo(instanceName, instance.regionId || queryRegion);

        // Construct Supabase URL
        const connectionString = useVpc ? instance.vpcConnectionString : instance.publicConnectionString;
        const supabaseUrl = connectionString.startsWith('http') 
            ? connectionString 
            : `http://${connectionString}`;

        return {
            instanceName,
            supabaseUrl,
            anonKey: authInfo.apiKeys.anonKey,
            serviceKey: authInfo.apiKeys.serviceKey,
            jwtSecret: authInfo.jwtSecret,
            useVpc,
        };
    }
}

/**
 * Factory function to create an Alibaba Cloud RDS AI client
 */
export function createAliyunClient(config: AliyunConfig): AliyunRdsAiClient {
    return new AliyunRdsAiClient(config);
}


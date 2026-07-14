/**
 * User Authentication Client
 * 
 * Handles user-level authentication with Supabase Auth for Tier 3 access mode.
 * Manages session lifecycle including login, token refresh, and logout.
 */

import { createClient, SupabaseClient, Session, AuthChangeEvent } from '@supabase/supabase-js';

/**
 * Configuration for UserAuthClient
 */
export interface UserAuthClientConfig {
    supabaseUrl: string;
    supabaseAnonKey: string;
    userEmail: string;
    userPassword: string;
    /** Refresh token before expiry (in milliseconds). Default: 60000 (1 minute) */
    refreshBeforeExpiry?: number;
}

/**
 * Callback type for auth state changes
 */
export type AuthStateChangeCallback = (event: AuthChangeEvent, session: Session | null) => void;

/**
 * User Authentication Client
 * 
 * Provides authenticated access to Supabase with automatic token refresh.
 * Access is restricted by Row Level Security (RLS) policies based on the user's identity.
 */
export class UserAuthClient {
    private supabase: SupabaseClient;
    private session: Session | null = null;
    private refreshTimer: NodeJS.Timeout | null = null;
    private config: UserAuthClientConfig;
    private authStateCallbacks: AuthStateChangeCallback[] = [];
    private isDestroyed = false;

    /**
     * Private constructor - use create() factory method instead
     */
    private constructor(config: UserAuthClientConfig) {
        this.config = config;
        
        // Create Supabase client with anon key for initial authentication
        this.supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
            auth: {
                autoRefreshToken: true,
                persistSession: false, // Don't persist to localStorage in server environment
                detectSessionInUrl: false,
            },
        });

        // Listen for auth state changes from the Supabase client
        this.supabase.auth.onAuthStateChange((event, session) => {
            this.session = session;
            this.notifyAuthStateChange(event, session);
            
            // Handle token refresh
            if (event === 'TOKEN_REFRESHED' && session) {
                console.error('[UserAuthClient] Token refreshed successfully');
                this.scheduleTokenRefresh(session);
            }
        });
    }

    /**
     * Factory method to create and initialize UserAuthClient
     * 
     * @throws Error if authentication fails
     */
    public static async create(config: UserAuthClientConfig): Promise<UserAuthClient> {
        const client = new UserAuthClient(config);
        await client.signIn();
        return client;
    }

    /**
     * Sign in with email and password
     * 
     * @throws Error if authentication fails
     */
    public async signIn(): Promise<void> {
        if (this.isDestroyed) {
            throw new Error('UserAuthClient has been destroyed');
        }

        console.error(`[UserAuthClient] Signing in as ${this.config.userEmail}...`);

        const { data, error } = await this.supabase.auth.signInWithPassword({
            email: this.config.userEmail,
            password: this.config.userPassword,
        });

        if (error) {
            console.error(`[UserAuthClient] Sign in failed: ${error.message}`);
            throw new Error(`Authentication failed: ${error.message}`);
        }

        if (!data.session) {
            throw new Error('Authentication succeeded but no session returned');
        }

        this.session = data.session;
        console.error(`[UserAuthClient] Successfully signed in as ${data.user?.email} (ID: ${data.user?.id})`);

        // Schedule token refresh
        this.scheduleTokenRefresh(data.session);
    }

    /**
     * Manually refresh the current session
     * 
     * @throws Error if refresh fails
     */
    public async refreshToken(): Promise<void> {
        if (this.isDestroyed) {
            throw new Error('UserAuthClient has been destroyed');
        }

        if (!this.session?.refresh_token) {
            // No refresh token, try to sign in again
            console.error('[UserAuthClient] No refresh token available, re-authenticating...');
            await this.signIn();
            return;
        }

        console.error('[UserAuthClient] Refreshing token...');

        const { data, error } = await this.supabase.auth.refreshSession({
            refresh_token: this.session.refresh_token,
        });

        if (error) {
            console.error(`[UserAuthClient] Token refresh failed: ${error.message}`);
            // Try to sign in again
            console.error('[UserAuthClient] Attempting to re-authenticate...');
            await this.signIn();
            return;
        }

        if (data.session) {
            this.session = data.session;
            this.scheduleTokenRefresh(data.session);
        }
    }

    /**
     * Schedule automatic token refresh before expiry
     */
    private scheduleTokenRefresh(session: Session): void {
        // Clear any existing timer
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }

        if (!session.expires_at) {
            console.error('[UserAuthClient] Session has no expiry time, skipping auto-refresh scheduling');
            return;
        }

        const expiresAt = session.expires_at * 1000; // Convert to milliseconds
        const now = Date.now();
        const refreshBeforeExpiry = this.config.refreshBeforeExpiry || 60000; // Default 1 minute
        const refreshIn = expiresAt - now - refreshBeforeExpiry;

        if (refreshIn <= 0) {
            // Token is about to expire or already expired, refresh immediately
            console.error('[UserAuthClient] Token near expiry, refreshing immediately...');
            this.refreshToken().catch(err => {
                console.error('[UserAuthClient] Auto-refresh failed:', err);
            });
            return;
        }

        console.error(`[UserAuthClient] Token refresh scheduled in ${Math.round(refreshIn / 1000)} seconds`);

        this.refreshTimer = setTimeout(() => {
            if (!this.isDestroyed) {
                this.refreshToken().catch(err => {
                    console.error('[UserAuthClient] Scheduled token refresh failed:', err);
                });
            }
        }, refreshIn);
    }

    /**
     * Get the current access token
     */
    public getAccessToken(): string | null {
        return this.session?.access_token || null;
    }

    /**
     * Get the current user ID
     */
    public getUserId(): string | null {
        return this.session?.user?.id || null;
    }

    /**
     * Get the current user email
     */
    public getUserEmail(): string | null {
        return this.session?.user?.email || null;
    }

    /**
     * Check if the client is currently authenticated
     */
    public isAuthenticated(): boolean {
        if (!this.session) return false;
        
        // Check if token is expired
        if (this.session.expires_at) {
            const expiresAt = this.session.expires_at * 1000;
            if (Date.now() >= expiresAt) {
                return false;
            }
        }
        
        return true;
    }

    /**
     * Get the current session
     */
    public getSession(): Session | null {
        return this.session;
    }

    /**
     * Get the underlying Supabase client
     * 
     * Note: This client uses the authenticated user's session,
     * so all operations are subject to RLS policies.
     */
    public getSupabaseClient(): SupabaseClient {
        return this.supabase;
    }

    /**
     * Register a callback for auth state changes
     */
    public onAuthStateChange(callback: AuthStateChangeCallback): () => void {
        this.authStateCallbacks.push(callback);
        
        // Return unsubscribe function
        return () => {
            const index = this.authStateCallbacks.indexOf(callback);
            if (index > -1) {
                this.authStateCallbacks.splice(index, 1);
            }
        };
    }

    /**
     * Notify all registered callbacks of auth state change
     */
    private notifyAuthStateChange(event: AuthChangeEvent, session: Session | null): void {
        for (const callback of this.authStateCallbacks) {
            try {
                callback(event, session);
            } catch (err) {
                console.error('[UserAuthClient] Auth state callback error:', err);
            }
        }
    }

    /**
     * Sign out and clean up resources
     */
    public async signOut(): Promise<void> {
        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }

        if (this.session) {
            try {
                await this.supabase.auth.signOut();
            } catch (err) {
                console.error('[UserAuthClient] Sign out error:', err);
            }
        }

        this.session = null;
    }

    /**
     * Destroy the client and clean up all resources
     */
    public async destroy(): Promise<void> {
        this.isDestroyed = true;
        await this.signOut();
        this.authStateCallbacks = [];
    }
}





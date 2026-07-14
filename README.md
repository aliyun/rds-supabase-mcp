# Aliyun RDS Supabase MCP Server

MCP (Model Context Protocol) server for Supabase instances running on Aliyun RDS. Enables AI assistants like Claude to interact with your Supabase instance hosted on Aliyun cloud infrastructure.

This project was adapted from the original work by [HenkDz](https://github.com/HenkDz) and is now maintained by Alibaba Cloud RDS.

## Alibaba Cloud Operation

This server is purpose-built for Supabase instances that run on Aliyun RDS AI. Key capabilities:

- Automatically fetches Supabase credentials from Alibaba Cloud OpenAPI
- Only requires Alibaba Cloud AccessKey (AK) and SecretKey (SK)
- Supports multiple Supabase instances with interactive selection
- No need to manually configure `anon-key`, `service-key`, or `jwt-secret`

## Features

This server exposes a rich set of tools for interacting with your Supabase instances running on Aliyun RDS:

*   **Alibaba Cloud Management** (Alibaba Cloud Mode only)
    *   `list_aliyun_supabase_instances`: Lists all Supabase instances from Alibaba Cloud RDS AI.
    *   `connect_to_supabase_instance`: Connects to a specific Supabase instance by name.
    *   `get_current_supabase_instance`: Shows the currently connected instance.
    *   `disconnect_supabase_instance`: Disconnects from the current instance.
*   **Database Schema**
    *   `list_tables`: Lists all tables in the `public` schema.
    *   `list_extensions`: Lists installed PostgreSQL extensions.
    *   `get_database_connections`: Retrieves current database connection information.
    *   `get_database_stats`: Gets database statistics (e.g., table sizes).
*   **Migrations & SQL**
    *   `list_migrations`: Lists applied migrations from the `supabase_migrations` schema.
    *   `apply_migration`: Applies a new SQL migration via RPC.
    *   `execute_sql`: Executes arbitrary SQL (Requires helper function in DB or direct DB access).
    *   `install_execute_sql_function`: Installs the `execute_sql` RPC function into the database.
    *   `generate_typescript_types`: Generates TypeScript types from the database schema.
*   **Project Configuration**
    *   `get_project_url`: Returns the configured Supabase project URL.
    *   `get_anon_key`: Returns the configured Supabase Anon Key.
    *   `get_service_key`: Returns the configured Supabase Service Role Key (if provided).
    *   `verify_jwt_secret`: Verifies the provided JWT secret against the database (Requires direct DB access).
*   **Infrastructure**
    *   `rebuild_hooks`: Attempts to restart the `pg_net` worker (if used).
*   **Auth User Management**
    *   `list_auth_users`: Lists users from `auth.users`.
    *   `get_auth_user`: Retrieves details for a specific user.
    *   `create_auth_user`: Creates a new user using Supabase Admin API.
    *   `delete_auth_user`: Deletes a user using Supabase Admin API.
    *   `update_auth_user`: Updates user details using Supabase Admin API.
*   **Storage Insights**
    *   `list_storage_buckets`: Lists all storage buckets.
    *   `list_storage_objects`: Lists objects within a specific bucket.
*   **Realtime Inspection**
    *   `list_realtime_publications`: Lists PostgreSQL publications (often `supabase_realtime`).
*   **Documentation**
    *   `search_docs`: Searches Supabase official documentation using GraphQL queries.
*   **RAG Agent Tools** (when `--enable-rag-agent` is set)
    *   All RAG Agent tools are dynamically loaded and prefixed with `rag_` (e.g., `rag_check_health`, `rag_list_datasets`, `rag_get_dataset`, `rag_query_dataset`, `rag_query_multi_datasets`).
    *   These tools provide Retrieval-Augmented Generation capabilities for semantic search and document management.
    *   Available after connecting to a Supabase instance in Alibaba Cloud Mode.

*(Note: `get_logs` was initially planned but skipped due to implementation complexities observed in the upstream self-hosted environment).*

## How It Works

This MCP server works with AI assistant tools like Claude Desktop, Cursor, and other MCP-compatible applications. Once configured, these AI assistants can automatically use the tools provided by this server to interact with your Aliyun RDS-hosted Supabase instance.

For example, when you ask an AI assistant "List all tables in my database", it will:
1. Recognize it needs to use a database tool
2. Call the `list_tables` tool from this server
3. Execute the tool against your Supabase instance
4. Present the results in a human-readable format

## Authentication Modes & Permission Levels

The server supports three authentication modes with automatic tool filtering:

- **Mode 1 – Alibaba Cloud Multi-Instance (AuthMode `aliyun`, permission `full`)**  
  Use `--aliyun-ak`, `--aliyun-sk`, and `--aliyun-region` to discover and manage multiple Aliyun RDS Supabase instances. Grants access to all tools, including Aliyun management tools.
- **Mode 2 – Single Instance Admin (AuthMode `admin`, permission `admin`)**  
  Use `--supabase-url`, `--supabase-anon-key`, and `--supabase-service-role-key` for a single project. Admin-only tools stay available; Aliyun management tools are hidden.
- **Mode 3 – Single Instance User (AuthMode `user`, permission `user`)**  
  Use `--supabase-url`, `--supabase-anon-key`, plus `--supabase-user-email` and `--supabase-user-password`. Runs under the user’s RLS scope; admin tools and Aliyun management tools are disabled.

Tool visibility is enforced automatically:
- **Aliyun-only tools** (e.g., `list_aliyun_supabase_instances`, `connect_to_supabase_instance`, `get_current_supabase_instance`, `disconnect_supabase_instance`) require `full` permissions.
- **Admin-only tools** (auth management, `get_service_key`, `verify_jwt_secret`, `install_execute_sql_function`, `rebuild_hooks`) require `full` or `admin` permissions.

Mode selection priority: if multiple configurations are provided, the server picks Aliyun first; if Aliyun is absent and user credentials are complete, user mode is selected; otherwise admin mode is used. A warning is logged when multiple modes are detected.

## Security Model

This MCP server is designed for trusted local or controlled MCP clients. Depending on the authentication mode, it can access high-privilege database credentials and run SQL against your Supabase instance.

- Prefer **Single Instance User** mode when RLS-scoped access is enough.
- Use **Single Instance Admin** and **Alibaba Cloud Multi-Instance** modes only with trusted operators and trusted MCP clients.
- Do not commit MCP client configuration files containing Alibaba Cloud AK/SK, Supabase service role keys, database URLs, JWT secrets, or user passwords.
- `execute_sql`, migration, Auth management, and helper-function installation tools can change data or database objects.
- Credential inspection tools are admin-scoped and can return configured keys to authorized MCP callers.
- Use `--tools-config` to whitelist the minimum set of tools needed for a deployment.

## Setup and Installation

### Alibaba Cloud Mode Setup

#### Quick Start with npx

```bash
npx @aliyun-rds/supabase-mcp-server \
  --aliyun-ak <your-access-key-id> \
  --aliyun-sk <your-access-key-secret> \
  --aliyun-region cn-hangzhou
```

**Important**: The `--aliyun-region` parameter is **required**. Without it, the API will return empty instance lists even though no error is reported. Common regions include:
- `cn-hangzhou` (China East 1)
- `cn-beijing` (China North 2)
- `cn-shanghai` (China East 2)
- `cn-shenzhen` (China South 1)

The CLI flag defines the default region for automatic discovery. When you need to inspect instances in other regions, call the `list_aliyun_supabase_instances` tool and provide its optional `region_id` argument (e.g., `cn-beijing`) to override the default for that request.

#### Configuration for Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "aliyun-supabase": {
      "command": "npx",
      "args": [
        "@aliyun-rds/supabase-mcp-server",
        "--aliyun-ak", "<your-access-key-id>",
        "--aliyun-sk", "<your-access-key-secret>",
        "--aliyun-region", "cn-hangzhou"
      ]
    }
  }
}
```

**With RAG Agent integration:**

```json
{
  "mcpServers": {
    "aliyun-supabase": {
      "command": "npx",
      "args": [
        "@aliyun-rds/supabase-mcp-server",
        "--aliyun-ak", "<your-access-key-id>",
        "--aliyun-sk", "<your-access-key-secret>",
        "--aliyun-region", "cn-hangzhou",
        "--enable-rag-agent"
      ]
    }
  }
}
```

Or use environment variables:

```json
{
  "mcpServers": {
    "aliyun-supabase": {
      "command": "npx",
      "args": [
        "@aliyun-rds/supabase-mcp-server",
        "--enable-rag-agent"
      ],
      "env": {
        "ALIYUN_ACCESS_KEY_ID": "<your-access-key-id>",
        "ALIYUN_ACCESS_KEY_SECRET": "<your-access-key-secret>",
        "ALIYUN_REGION": "cn-hangzhou"
      }
    }
  }
}
```

#### Usage Workflow

1. **List instances**: Use `list_aliyun_supabase_instances` to see all your Supabase instances
2. **Connect**: Use `connect_to_supabase_instance` with the instance name
3. **Use tools**: Now you can use all Supabase tools (list_tables, execute_sql, etc.)
4. **Disconnect** (optional): Use `disconnect_supabase_instance` to switch instances

### Single Instance Admin Mode Setup

```bash
npx @aliyun-rds/supabase-mcp-server \
  --supabase-url https://<your-project>.supabase.co \
  --supabase-anon-key <anon-key> \
  --supabase-service-role-key <service-role-key> \
  [--db-url <postgres-connection-string>] \
  [--jwt-secret <jwt-secret>] \
  [--enable-rag-agent]
```

Environment variable alternative:

```bash
SUPABASE_URL=https://<your-project>.supabase.co \
SUPABASE_ANON_KEY=<anon-key> \
SUPABASE_SERVICE_ROLE_KEY=<service-role-key> \
supabase-mcp
```

Claude Desktop / Cursor JSON 示例：

```json
{
  "mcpServers": {
    "supabase-admin": {
      "command": "npx",
      "args": [
        "@aliyun-rds/supabase-mcp-server",
        "--supabase-url", "https://<your-project>.supabase.co",
        "--supabase-anon-key", "<anon-key>",
        "--supabase-service-role-key", "<service-role-key>"
      ]
    }
  }
}
```

### Single Instance User Mode Setup (RLS Restricted)

```bash
npx @aliyun-rds/supabase-mcp-server \
  --supabase-url https://<your-project>.supabase.co \
  --supabase-anon-key <anon-key> \
  --supabase-user-email <user-email> \
  --supabase-user-password <user-password> \
  [--enable-rag-agent]
```

Environment variable alternative:

```bash
SUPABASE_URL=https://<your-project>.supabase.co \
SUPABASE_ANON_KEY=<anon-key> \
SUPABASE_USER_EMAIL=<user-email> \
SUPABASE_USER_PASSWORD=<user-password> \
supabase-mcp
```

Claude Desktop / Cursor JSON 示例：

```json
{
  "mcpServers": {
    "supabase-user": {
      "command": "npx",
      "args": [
        "@aliyun-rds/supabase-mcp-server",
        "--supabase-url", "https://<your-project>.supabase.co",
        "--supabase-anon-key", "<anon-key>",
        "--supabase-user-email", "<user-email>",
        "--supabase-user-password", "<user-password>"
      ]
    }
  }
}
```

### Additional Installation Options

#### Global Installation

```bash
npm install -g @aliyun-rds/supabase-mcp-server
supabase-mcp \
  --aliyun-ak <your-access-key-id> \
  --aliyun-sk <your-access-key-secret> \
  --aliyun-region cn-hangzhou
```

## Configuration

Choose one configuration path. CLI flags override environment variables.

### Mode 1 — Alibaba Cloud Multi-Instance (permission: full)

Required:
- `--aliyun-ak <key>` or `ALIYUN_ACCESS_KEY_ID=<key>`
- `--aliyun-sk <secret>` or `ALIYUN_ACCESS_KEY_SECRET=<secret>`
- `--aliyun-region <region>` or `ALIYUN_REGION=<region>` (e.g., `cn-hangzhou`, `cn-beijing`; required for discovery)

Behavior: pulls Supabase URL/keys/DB URL/JWT secret from Aliyun for the selected instance.

### Mode 2 — Single Instance Admin (permission: admin)

Required:
- `--supabase-url <url>` or `SUPABASE_URL`
- `--supabase-anon-key <key>` or `SUPABASE_ANON_KEY`
- `--supabase-service-role-key <key>` or `SUPABASE_SERVICE_ROLE_KEY`

Optional:
- `--db-url <postgres-connection-string>` or `DB_URL`
- `--jwt-secret <secret>` or `JWT_SECRET`

Legacy flag aliases are still accepted: `--url`, `--anon-key`, `--service-key`, `--db-url`, `--jwt-secret`.

### Mode 3 — Single Instance User (permission: user, RLS enforced)

Required:
- `--supabase-url <url>` or `SUPABASE_URL`
- `--supabase-anon-key <key>` or `SUPABASE_ANON_KEY`
- `--supabase-user-email <email>` or `SUPABASE_USER_EMAIL`
- `--supabase-user-password <password>` or `SUPABASE_USER_PASSWORD`

Behavior: operates under the provided user's RLS policies; admin-only and Aliyun management tools are filtered out.

### Common Options

- `--tools-config <path>`: JSON file specifying which tools to enable (whitelist). Format: `{"enabledTools": ["tool_name_1", "tool_name_2"]}`.
- `--enable-rag-agent` or `ENABLE_RAG_AGENT=true`: Enable RAG Agent MCP integration. When enabled, the server resolves the Supabase host/port from the selected instance and uses the retrieved anon key as the API key for rag-agent.
- `--workspace-path <path>`: Workspace root for file operations (optional).

### RAG Agent Integration

This server can integrate with [rag-agent-mcp](https://pypi.org/project/rag-agent-mcp/) to provide RAG (Retrieval-Augmented Generation) capabilities alongside your Supabase database tools.

**How it works:**
- When `--enable-rag-agent` is set, the server automatically connects to a rag-agent MCP server after you select an Aliyun RDS Supabase instance.
- The Supabase host/port is derived from the instance metadata returned by Aliyun OpenAPI.
- The anon key retrieved for the connected instance is reused as the API key for rag-agent (no manual secret sharing required).
- All rag-agent tools are prefixed with `rag_` to avoid naming conflicts (e.g., `rag_create_collection`, `rag_add_documents`, `rag_query`).

**Example configuration:**
```bash
npx @aliyun-rds/supabase-mcp-server \
  --aliyun-ak <your-access-key-id> \
  --aliyun-sk <your-access-key-secret> \
  --aliyun-region cn-hangzhou \
  --enable-rag-agent
```

**Requirements:**
- `uvx` must be installed on your system
- `rag-agent-mcp` package must be available via `uvx`
- The rag-agent service must be reachable at the host/port reported by your Supabase instance

**Behavior Notes:**
- RAG Agent tools are advertised at startup but become fully functional only after running `connect_to_supabase_instance`.
- Because the host/port comes from Supabase metadata, ensure your Aliyun credentials can fetch instance connection details.

### Important Notes:

*   **`execute_sql` Helper Function:** Many tools rely on a `public.execute_sql` function for SQL execution via RPC. After you connect to an Aliyun RDS instance, the server checks for this function and, if your AK/SK grants the required privileges, automatically creates it and assigns least-privilege permissions when missing. Treat this as an admin capability.
*   **Direct Database Access:** Tools that touch privileged schemas (`auth`, `storage`) or `pg_catalog` still require direct database connectivity. The connection string is pulled from Aliyun; ensure your credentials can retrieve it or those tools will be unavailable.
*   **Database URL Special Characters:** When Aliyun returns database URLs containing characters like `#` or `$`, the server automatically URL-encodes them (`#` → `%23`, `$` → `%24`). The `@` symbol remains unescaped because it separates credentials from the hostname.

## Using with AI Assistant Tools

### Cursor

1.  Create or open the file `.cursor/mcp.json` in your project root.
2.  Add one of the following configurations based on your authentication mode:

    **Mode 1 (Aliyun multi-instance, permission: full)**  
    Grants all tools, including Aliyun management.

    ```json
    {
      "mcpServers": {
        "aliyun-supabase": {
          "command": "npx",
          "args": [
            "@aliyun-rds/supabase-mcp-server",
            "--aliyun-ak", "<your-access-key-id>",
            "--aliyun-sk", "<your-access-key-secret>",
            "--aliyun-region", "cn-hangzhou",
            "--enable-rag-agent"
          ],
          "env": {
            // Optional: whitelist tools or toggle features
            "TOOLS_CONFIG": "<path-to-tools-config.json>",
            "ENABLE_RAG_AGENT": "true"
          }
        }
      }
    }
    ```

    **Mode 2 (Single instance admin, permission: admin)**  
    Admin tools available; Aliyun management tools hidden.

    ```json
    {
      "mcpServers": {
        "supabase-admin": {
          "command": "npx",
          "args": [
            "@aliyun-rds/supabase-mcp-server",
            "--supabase-url", "https://<your-project>.supabase.co",
            "--supabase-anon-key", "<anon-key>",
            "--supabase-service-role-key", "<service-role-key>",
            "--enable-rag-agent"
          ]
        }
      }
    }
    ```

    **Mode 3 (Single instance user, permission: user, RLS enforced)**  
    Runs under user RLS; admin/Aliyun tools disabled.

    ```json
    {
      "mcpServers": {
        "supabase-user": {
          "command": "npx",
          "args": [
            "@aliyun-rds/supabase-mcp-server",
            "--supabase-url", "https://<your-project>.supabase.co",
            "--supabase-anon-key", "<anon-key>",
            "--supabase-user-email", "<user-email>",
            "--supabase-user-password", "<user-password>",
            "--enable-rag-agent"
          ]
        }
      }
    }
    ```

**Important Notes for RAG Agent:**
- RAG Agent tools stay inactive until you call `connect_to_supabase_instance` and select an Aliyun RDS Supabase project.
- Switching instances automatically re-initializes the rag-agent connection with the new host/port.
- All RAG Agent tools are prefixed with `rag_` (e.g., `rag_create_collection`, `rag_add_documents`, `rag_query`).

### Claude for Desktop

For Claude Desktop, open Settings → Developer → enable "Custom MCP Servers", then add one configuration matching your mode:

**Mode 1 (Aliyun, permission: full)**

```json
{
  "name": "Aliyun Supabase",
  "command": "npx",
  "args": [
    "@aliyun-rds/supabase-mcp-server",
    "--aliyun-ak", "<your-access-key-id>",
    "--aliyun-sk", "<your-access-key-secret>",
    "--aliyun-region", "cn-hangzhou",
    "--enable-rag-agent"
  ]
}
```

**Mode 2 (Single instance admin, permission: admin)**

```json
{
  "name": "Supabase Admin",
  "command": "npx",
  "args": [
    "@aliyun-rds/supabase-mcp-server",
    "--supabase-url", "https://<your-project>.supabase.co",
    "--supabase-anon-key", "<anon-key>",
    "--supabase-service-role-key", "<service-role-key>",
    "--enable-rag-agent"
  ]
}
```

**Mode 3 (Single instance user, permission: user, RLS enforced)**

```json
{
  "name": "Supabase User",
  "command": "npx",
  "args": [
    "@aliyun-rds/supabase-mcp-server",
    "--supabase-url", "https://<your-project>.supabase.co",
    "--supabase-anon-key", "<anon-key>",
    "--supabase-user-email", "<user-email>",
    "--supabase-user-password", "<user-password>",
    "--enable-rag-agent"
  ]
}
```

### Other MCP-Compatible Tools

Most MCP-compatible tools follow similar configuration patterns. The general format is:
- Command: `npx`
- Arguments: `[@aliyun-rds/supabase-mcp-server, --aliyun-ak, <your-access-key-id>, --aliyun-sk, <your-access-key-secret>, --aliyun-region, <your-region>, ...]`

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Originally developed by [HenkDz](https://github.com/HenkDz), now maintained by Alibaba Cloud RDS.

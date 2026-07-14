# Security Policy

## Supported Versions

Security fixes are released for the latest published version.

## Reporting a Vulnerability

Please report security issues privately to the project maintainers before opening a public issue. Include:

- Affected version
- Reproduction steps
- Expected impact
- Suggested mitigation, if known

Do not include real access keys, service role keys, database URLs, JWT secrets, or user passwords in reports.

## Operational Security

This server can run with high-privilege credentials and exposes tools that may execute SQL or manage Auth users. Run it only in trusted MCP clients, scope credentials narrowly, and prefer user mode when admin access is not required.

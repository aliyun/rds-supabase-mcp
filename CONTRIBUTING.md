# Contributing

Thanks for contributing.

## Development

```bash
npm ci
npm run typecheck
npm run build
```

## Pull Request Checklist

- No credentials, internal URLs, private hostnames, or customer data are committed.
- `npm run typecheck` passes.
- `npm run build` passes.
- User-facing behavior is documented in `README.md` when needed.
- Security-sensitive changes describe the risk and mitigation.

## Code Style

This project uses strict TypeScript. Keep external input validation at the boundary with Zod, avoid `any` in new code, and do not log secrets or full SQL statements.

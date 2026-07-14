# Publishing

This package is published as `@aliyun-rds/supabase-mcp-server`.

## Prerequisites

1. Confirm you have publish access to the `@aliyun-rds` npm scope.
2. Confirm the working tree is clean.
3. Run the release checks:

```bash
npm ci
npm test
```

## Dry Run

Inspect the files that will be included in the package:

```bash
npm pack --dry-run
```

The package should include only:

- `dist/`
- `README.md`
- `LICENSE`

## Publish

```bash
npm publish --access public
```

## Verify

```bash
npx @aliyun-rds/supabase-mcp-server --help
```

Package page:

https://www.npmjs.com/package/@aliyun-rds/supabase-mcp-server

# Claude Scalping Bot

Autonomous AI Scalping Bot for OANDA using TypeScript, PostgreSQL, Drizzle ORM and Claude AI.

## Architecture

This is a monorepo using pnpm workspaces with the following structure:

- **apps/api-server** - Express API server
- **lib/db** - Database layer with Drizzle ORM
- **lib/api-spec** - API type definitions
- **lib/api-zod** - Zod validation schemas
- **lib/api-client-react** - React API client
- **lib/integrations-anthropic-ai** - Claude AI integration
- **scripts** - Build and utility scripts

## Prerequisites

- Node.js 18+
- pnpm 9.0+
- PostgreSQL 14+

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Create `.env` file (copy from `.env.example`):
   ```bash
   cp .env.example .env
   ```

4. Update environment variables with your settings

## Development

```bash
# Type checking
pnpm typecheck

# Build all packages
pnpm build

# Run API server in development
pnpm dev

# Clean build artifacts
pnpm clean
```

## Database

```bash
# Initialize database schema
pnpm db:migrate

# Open Drizzle Studio
pnpm db:studio
```

## License

MIT

# Expense Tracker - AI Coding Guidelines

## Project Architecture

This is a **Next.js 15 + tRPC + Drizzle ORM** expense tracking application with PostgreSQL backend. The app uses a **multi-tenant architecture** where all data is scoped by `userId`.

### Core Stack
- **Frontend**: Next.js 15 (App Router), React 19, TailwindCSS, shadcn/ui
- **Backend**: tRPC v11, better-auth for authentication
- **Database**: PostgreSQL with Drizzle ORM
- **State**: TanStack Query (React Query) with tRPC integration
- **Forms**: React Hook Form + Zod validation
- **UI**: Radix UI primitives, Lucide icons, next-themes

## Key Architecture Patterns

### 1. Route Structure
```
src/app/
├── (auth)/          # Authentication routes (login/register)
├── (main)/          # Protected app routes with sidebar layout
│   ├── aggregated/  # Summary/analytics views
│   ├── sessions/    # Expense tracking sessions
│   └── statements/  # Transaction management
```

### 2. Data Model Relationships
The schema (`src/db/schema.ts`) centers around:
- **statements**: Main transaction table with `statementKind` enum
- **bankAccount**: User's financial accounts  
- **friendsProfiles**: People involved in shared expenses
- **selfTransferStatements**: Transfers between user's accounts
- **splits**: How expenses are divided among friends

**Critical Constraint**: All main entities require `userId` for multi-tenancy. Use `protectedProcedure` in tRPC routers.

### 3. tRPC Structure
```
src/server/routers/
├── index.ts         # Router composition
├── accounts.ts      # Bank account management
├── friends.ts       # Friend profile operations
├── statements.ts    # Transaction CRUD
└── summary.ts       # Analytics and aggregations
```

**Pattern**: All routers use `protectedProcedure` and automatically include `userId` from session context.

### 4. Data Tables Pattern
Uses TanStack Table with custom wrappers in `src/components/data-table/`. Key files:
- `data-table.tsx`: Main table component
- `data-table-toolbar.tsx`: Filters and search
- `use-data-table.ts`: Hook for table state management

**Usage**: Always pair with `nuqs` for URL state persistence and server-side filtering.

## Development Workflows

### Database Operations
```bash
# Generate migrations after schema changes
pnpm db:generate

# Apply migrations  
pnpm db:migrate
```

### Key Scripts
```bash
pnpm dev              # Next.js dev with turbopack
pnpm lint             # ESLint with security rules
pnpm typecheck        # TypeScript validation
pnpm format           # Prettier formatting
```

## Critical Conventions

### 1. Authentication Flow
- Uses `better-auth` with email/password
- Session validation via `protectedProcedure` in tRPC
- Auth state managed through `better-auth` client hooks

### 2. Form Handling
- React Hook Form + Zod validation
- Custom `dynamic-form` components for consistent UX
- Error handling through `toast` notifications (sonner)

### 3. Statement Types (`statementKind`)
- `expense`: Regular expense (requires `accountId` OR `friendId`)
- `friend_transaction`: Shared expense (requires BOTH `accountId` AND `friendId`)
- `outside_transaction`: External transaction (`friendId` must be null)
- `self_transfer`: Between user's accounts (separate table)

**Database Constraints**: Schema enforces these rules via CHECK constraints.

### 4. Data Aggregation Patterns
See `src/server/helpers/summary.ts` for complex aggregation queries:
- Uses `unionAll` for combining different statement types
- Time-based grouping with `date_trunc`
- Account and friend balance calculations

### 5. UI Patterns
- Consistent use of shadcn/ui components
- Dark/light theme support via `next-themes`
- Responsive design with mobile-first approach
- Loading states and error boundaries

### 6. Custom UI Components
Key reusable components in `src/components/`:

- **AppSidebar**: Main navigation with predefined routes (`/`, `/statements`, `/aggregated`)
- **DeleteConfirmationDialog**: Generic deletion modal with tRPC mutation integration
- **MutationModal**: Reusable modal for create/edit operations using DynamicForm + tRPC
- **DynamicForm**: Form builder with Zod validation, supports various field types (text, select, date, string arrays)
- **LineChart**: Recharts wrapper with standardized data format and theming
- **ThemeToggle**: Light/dark/system theme switcher using next-themes
- **DataTable components**: Complete table system with filtering, pagination, sorting, and URL state persistence

**Usage Pattern**: All mutation components integrate with tRPC, include loading states, and show toast notifications for success/error handling.

## File Naming Conventions
- tRPC routers: lowercase with `.ts` extension
- React components: PascalCase with `.tsx`
- Utilities/hooks: camelCase with descriptive names
- Database: snake_case for tables/columns

## Environment Setup
- Required: `DATABASE_URL` (PostgreSQL connection string)
- Optional: `NEXT_PUBLIC_BASE_URL` for absolute URLs
- Use `src/lib/env.ts` for type-safe environment variables

## Security Considerations
- All database queries are scoped by `userId`
- ESLint security plugin enforces secure patterns
- Input validation through Zod schemas
- SQL injection prevention via Drizzle parameterized queries

## Common Gotchas
1. **Multi-tenancy**: Always filter by `userId` in database queries
2. **Statement constraints**: Respect `statementKind` validation rules
3. **Date handling**: Use `date-fns` for consistent date operations
4. **Type safety**: Leverage tRPC's end-to-end type inference
5. **State persistence**: Use `nuqs` for URL state, TanStack Query for server state
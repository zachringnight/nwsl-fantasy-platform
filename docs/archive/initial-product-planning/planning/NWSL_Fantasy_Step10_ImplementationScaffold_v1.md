# Step 10: Implementation Scaffold

Reference the master context document for tech stack.
Reference Step 3 for the route map.
Reference Step 5 for the design token specification.
Reference Step 7 for the database schema and architecture.
Reference Step 9 for the Phase 0 deliverables.

---

## Your task

Produce the actual code scaffold for Phase 0. This is the starting point for implementation. Everything should compile and run.

---

## Deliver exactly these artifacts

### 1. Repository structure
Show the complete folder/file tree. Follow Next.js App Router conventions. Include:
- `/app` route structure matching Step 3
- `/components` organized by domain (draft, lineup, matchup, player, league, common)
- `/lib` for utilities, API clients, scoring engine
- `/prisma` for schema
- `/providers` for data source abstraction
- `/hooks` for shared React hooks
- `/types` for TypeScript types
- `/config` for constants and feature flags
- `/jobs` for background job definitions

### 2. Package.json
Complete with all dependencies from the locked tech stack plus any libraries recommended in Steps 5 and 7.

### 3. Prisma schema
The full schema from Step 7, ready to run `prisma migrate`.

### 4. Design tokens file
The complete token file from Step 5 as a TypeScript or JSON module.

### 5. Tailwind config
Configured to use the design tokens.

### 6. Base layout and navigation
The shell layout component with navigation structure from Step 3.

### 7. Auth setup
Starter auth configuration (recommend a specific provider and implement the integration shell).

### 8. Data provider abstraction
The provider interface from Step 7 with the API-Football adapter stub.

### 9. Component stubs
Empty but typed component files for the top 10 most-used components from Step 5's inventory. Each should export a named component with correct TypeScript props interface.

### 10. README
Project setup instructions, environment variables needed, and development workflow.

---

## Code standards

- TypeScript strict mode
- All components are typed with explicit props interfaces
- Use named exports
- File naming: kebab-case for files, PascalCase for components
- No placeholder comments like "TODO: implement." Either implement the shell or leave the file as a typed stub.

---

## Format

Use code blocks with language tags. Show complete files, not fragments. If a file is too long, split it into clearly labeled sections.

---

## Do not include
- Full feature implementation (that starts in Phase 1)
- Test files (those come with each phase)
- Deployment configuration (that's part of Phase 0 but separate from scaffold)

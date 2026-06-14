# Finish HCT Build

Backend, auth, AI server function, and shell are already in place. Remaining work:

## 1. Dashboard (`/_authenticated/dashboard`)
- Sticky top bar with HCT wordmark + "A. Chatziliadis" tag
- `VenueSelector` block (large heading + dropdown + "+ Add New Venue" dialog, persisted in `?venue=`)
- Three KPI cards:
  - Total Bottlenecks Logged (count)
  - Total Audited Loss (€, de-DE formatted)
  - Structure vs Emotion ratio bar
- "Recent Critical Bottlenecks" list (top 5 by estimated loss)
- Footer CTAs: `New Audit` + `Export Executive Report`
- Empty state when no venue selected / no audits yet (no mock data)
- Loaders use TanStack Query + `createServerFn` (`listVenues`, `listAudits`)

## 2. New Audit (`/_authenticated/audits/new`)
- Form fields: audit_date, shift (Morgen-Schicht / Abend-Schicht), bottleneck (textarea), problem_category, diagnosis_type, estimated_loss_eur, bsps_solution, actionable_steps
- "AI Audit" button inside bottleneck textarea toolbar → calls `analyzeBottleneck` server fn → auto-fills `problem_category`, `diagnosis_type`, `bsps_solution`, `actionable_steps` for review/edit
- Submit → `createAudit` server fn → redirect to dashboard

## 3. Audit Detail (`/_authenticated/audits/$id`)
- Read-only structured view of one entry with BSPS recommendation and loss

## 4. Executive PDF Export
- `src/lib/hct/pdf.tsx` using `@react-pdf/renderer` (client-side, Worker-safe)
- Header band: "HCT — Executive Audit Report" | Consultant: Alexandros Chatziliadis | Venue | Date range
- Executive Summary block: total observations, total audited loss (€), top categories, structure/emotion ratio
- Audit Details table: date, shift, bottleneck (truncated), category, loss €, BSPS module
- Footer: page numbers + confidentiality line
- Triggered by dashboard "Export Executive Report" button, filtered by current venue

## 5. Server functions (`src/lib/hct/*.functions.ts`)
- `listVenues`, `createVenue`
- `listAudits({ venueId })`, `getAudit({ id })`, `createAudit(input)`
- All use `requireSupabaseAuth`, scoped by `auth.uid()` via RLS
- `analyzeBottleneck` already exists

## 6. Polish
- Semantic tokens only (no hardcoded hex in components)
- Inter + JetBrains Mono via `<link>` in `__root.tsx`
- de-DE number/date formatting via `src/lib/hct/constants.ts`
- Landing `/` → CTA to `/auth` or `/dashboard`

Ready to switch to build mode and implement.
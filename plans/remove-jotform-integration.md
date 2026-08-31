# Remove JotForm Integration

## Goal

Remove every active JotForm dependency while keeping existing sales, historical
submission records, native registration, partner callbacks, and scheduled
notifications operational.

## Scope

1. Remove the JotForm gateway, webhook, polling service, routes, validation, and
   test hooks.
2. Generate every new registration link directly for the native registration
   page.
3. Convert legacy JotForm links stored on sales to native links during database
   bootstrap so pending 48-hour notifications remain valid.
4. Remove JotForm environment requirements, public-route exceptions, and its
   dedicated rate limiter.
5. Preserve the `Submission` table and migrations as historical data used by
   reports and privacy workflows; no customer data is deleted.

## Compatibility

- Existing sale IDs and notification timestamps are unchanged.
- Legacy friendly and signed links resolve to the native registration page.
- `PUBLIC_FORM_LINK_SECRET` remains the only signing secret for signed links.
- The removed integration endpoints are no longer mounted by the application.

## Verification

- Scan active source code for JotForm references; only the one-time legacy-link
  migration may retain the old provider hostname.
- Run syntax checks, Agenda migration tests, and 48-hour boundary tests.
- Generate Prisma Client and start the application against the configured local
  services.

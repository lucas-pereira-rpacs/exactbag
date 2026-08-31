# Agenda recurring jobs migration

## Goal

Replace the in-memory `node-schedule` timers with the PostgreSQL-backed Agenda instance already used by the NOW integration.

## Jobs

- `outbound-notifications`: hourly polling for digital activation and physical-tag receipts due around 48 hours before departure.
- `return-flight-reminders`: daily polling at the configured UTC time.
- `weekly-sales-report`: weekly report using the configured weekday and time.
- `monthly-sales-report`: monthly report using the configured day and time.

## Design

1. Keep business logic in testable services and expose thin Agenda handler files from `src/jobs`.
2. Define every job in `src/jobs/scheduler.js`, alongside `now-integration`.
3. Register recurring jobs after Agenda starts. Agenda recurring jobs use single-job behavior to avoid duplicate schedules across restarts.
4. Keep database `sentAt` fields as business-level idempotency controls.
5. Cancel and recreate report schedules at startup so report configuration changes take effect.
6. Remove `node-schedule` after all references are gone.

## Verification

- Run handler and syntax checks.
- Run the deterministic 48-hour boundary test, including physical-tag receipt deduplication.
- Verify no `node-schedule` imports remain.
- Verify server startup owns one Agenda lifecycle and one graceful shutdown path.

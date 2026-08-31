# Agenda custom job queue migration

## Implementation status

Completed. The in-memory queue has been removed and both business job types now use persisted Agenda handlers. Job inspection, health reporting, retries, deduplication, retention, partner isolation, and restart-safe sale processing were migrated with the queue.

Optional runtime setting: `AGENDA_JOB_RETENTION_HOURS` controls how long completed and exhausted business jobs remain queryable. The default is 720 hours (30 days).

## Objective

Replace the in-memory `jobQueueService` with the PostgreSQL-backed Agenda instance while preserving current API contracts, retries, deduplication, observability, and graceful shutdown behavior.

## Current scope

The custom queue currently processes two job types:

1. `processPartnerSale`
   - Produced by partner-sale webhooks.
   - Produced by manual digital-assistance sales.
   - Executes `saleProcessingService.processPartnerSale`.
2. `PARTNER_CALLBACK`
   - Produced after partner-related events.
   - Executes `partnerCallbackService.executeCallback`.

The custom queue is also consumed by:

- Job detail and job-list endpoints.
- The application health endpoint.
- Debug logging in the server.
- Graceful shutdown logic.

## Target structure

```text
src/jobs/
├── scheduler.js
├── processPartnerSaleHandler.js
├── partnerCallbackHandler.js
├── nowIntegrationHandler.js
├── outboundNotificationHandler.js
├── returnFlightReminderHandler.js
└── scheduledReportHandler.js
```

Each handler should contain execution logic only. Job definition, retry policy, concurrency, and registration remain centralized in `scheduler.js`.

## Migration phases

### Phase 1: Establish compatibility requirements

- Record the existing response payloads from webhook and manual-sale endpoints.
- Record the existing job detail/list response formats.
- Identify every consumer of job IDs and job statuses.
- Define the mapping between custom statuses and Agenda states:
  - `pending`
  - `running`
  - `retrying`
  - `completed`
  - `failed`
- Confirm retention requirements for completed and failed jobs.

### Phase 2: Create Agenda handlers

- Add `processPartnerSaleHandler.js`.
- Add `partnerCallbackHandler.js`.
- Move registration logic out of controllers and `server.js`.
- Keep business logic in the existing services.
- Make handlers directly callable by deterministic tests.
- Preserve structured error logging without exposing secrets or full authorization headers.

### Phase 3: Register job definitions

Define both jobs in `src/jobs/scheduler.js`:

- Configure concurrency and lock limits.
- Configure lock lifetimes appropriate to each external integration.
- Configure exponential or constant retry backoff.
- Set maximum retry attempts.
- Decide whether completed one-time jobs should be retained or removed.
- Ensure Agenda starts only once and owns its PostgreSQL pool lifecycle.

### Phase 4: Replace job producers

Replace `jobQueueService.addJob()` calls with Agenda jobs in:

- `webhooksController.js`
- `manualSaleController.js`
- `partnerCallbackService.js`

Producer requirements:

- Return the persisted Agenda job ID using the existing API field name.
- Persist jobs before returning successful acceptance responses.
- Use stable deduplication identifiers.
- Avoid enqueueing duplicate active jobs for the same business event.

Suggested unique identifiers:

- Partner sale: `processPartnerSale:<partnerId>:<saleId>`
- Partner callback: `partnerCallback:<partnerId>:<eventId>`

### Phase 5: Preserve deduplication and idempotency

Agenda uniqueness prevents duplicate active jobs but is not sufficient as the only business guarantee.

- Retain database-level sale uniqueness and existing sale lookup behavior.
- Ensure `processPartnerSale` can safely run again after a crash between external effects and job completion.
- Ensure partner callbacks include an idempotency identifier when the partner API supports one.
- Do not rely on temporary in-memory maps or TTLs.
- Test simultaneous duplicate webhook requests.

### Phase 6: Migrate job inspection APIs

Replace `jobQueueService` reads in `jobController.js`:

- Fetch jobs from Agenda/PostgreSQL.
- Preserve current endpoint response shapes where practical.
- Map Agenda timestamps and failure metadata to the existing public format.
- Add pagination at the database query level.
- Ensure job payloads returned to operators redact credentials and sensitive customer data when appropriate.

### Phase 7: Update health and observability

Replace in-memory counts in `/health` and debug logs:

- Report whether Agenda storage is reachable.
- Report counts for pending, running, failed, and recently completed jobs when inexpensive.
- Do not make the public health endpoint fail solely because a historical job failed.
- Add job name and persisted job ID to start, completion, retry, and failure logs.
- Keep Agenda failure logging centralized in `scheduler.js`.

### Phase 8: Remove the custom queue

After all producers and consumers are migrated:

- Remove custom handler registration from `server.js` and controllers.
- Remove custom queue shutdown calls.
- Delete `src/services/jobQueueService.js`.
- Remove stale comments describing the in-memory queue.
- Verify no `jobQueueService`, `registerHandler`, or custom `addJob` references remain.

## Retry policy

### Partner sale processing

- Use exponential backoff.
- Retry transient database, email, WhatsApp, form-provider, and network failures only when the service surfaces them as failures.
- Do not retry validation errors or permanently invalid partner data.
- Retain enough failure metadata for support investigation.

### Partner callbacks

- Use exponential backoff with a bounded maximum attempt count.
- Treat HTTP `408`, `429`, and `5xx` responses as retryable.
- Treat most other `4xx` responses as permanent failures.
- Preserve the current callback attempt/max-attempt contract passed to the service.

## Deployment and rollout

1. Deploy Agenda handlers and producers together to avoid orphaned job types.
2. Start Agenda after database migrations and before accepting new queued work where practical.
3. Verify the Agenda PostgreSQL tables are reachable.
4. Verify a test manual sale persists and completes after a process restart.
5. Verify duplicate webhook requests produce one active business operation.
6. Verify a failing callback retries and exposes its failure through the job endpoint.
7. Remove the custom queue only after every reference has moved.

Existing in-memory jobs cannot be migrated because they are not persisted. During deployment, drain the old process or accept that pending in-memory jobs may be lost when the old instance stops.

## Test plan

### Unit tests

- `processPartnerSaleHandler` forwards job data correctly.
- `partnerCallbackHandler` forwards attempt metadata correctly.
- Retryable errors are rethrown to Agenda.
- Permanent errors are recorded and not retried indefinitely.
- Agenda-to-API status mapping is correct.
- Sensitive fields are redacted from job inspection responses.

### Integration tests

- Webhook submission creates a persisted Agenda job.
- Manual sale creates a persisted Agenda job.
- Repeated dedupe keys do not create duplicate active jobs.
- Jobs survive worker restart.
- Failed jobs retry with the configured backoff.
- Job detail and listing endpoints read persisted state.
- Health reporting works with Agenda connected and unavailable.

### Regression tests

- Existing sale-processing behavior remains unchanged.
- Partner callback payloads remain unchanged.
- Existing recurring Agenda jobs continue to run.
- Graceful shutdown unlocks active jobs and closes the Agenda pool once.
- No `jobQueueService` references remain after removal.

## Completion criteria

- Both custom job types run through handlers in `src/jobs`.
- All producers create persisted Agenda jobs.
- API job inspection reads Agenda state.
- Health checks no longer depend on in-memory job maps.
- Dedupe and retries are covered by tests.
- Restart durability is demonstrated.
- `jobQueueService.js` is removed.
- The working tree contains no stale custom-queue imports or registrations.

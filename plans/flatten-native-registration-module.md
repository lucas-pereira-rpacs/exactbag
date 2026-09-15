# Flatten `src/modules/nativeRegistration`

## Implementation status

Completed on 2026-08-31. The final layout follows the mapping below, the
`src/modules` directory has been removed, and the verification checklist passed.

## Objective

Remove the `src/modules` hierarchy and place the native-registration code in the
existing responsibility-based folders under `src`, without changing public URLs,
database models, job behavior, authentication rules, notification timing, or the
CPV output.

This is a structural refactor. It must not include business-rule changes.

## Target layout

| Current path                                                              | Target path                                    |
| ------------------------------------------------------------------------- | ---------------------------------------------- |
| `modules/nativeRegistration/controllers/nativeRegistrationController.js`  | `controllers/nativeRegistrationController.js`  |
| `modules/nativeRegistration/routes/nativeRegistrationRoutes.js`           | `routes/nativeRegistrationRoutes.js`           |
| `modules/nativeRegistration/routes/nowIntegrationRoutes.js`               | `routes/nowIntegrationRoutes.js`               |
| `modules/nativeRegistration/repositories/nativeRegistrationRepository.js` | `repositories/nativeRegistrationRepository.js` |
| `modules/nativeRegistration/services/nativeRegistrationService.js`        | `services/nativeRegistrationService.js`        |
| `modules/nativeRegistration/services/nativeNotificationService.js`        | `services/nativeNotificationService.js`        |
| `modules/nativeRegistration/services/dashboardAuthService.js`             | `services/dashboardAuthService.js`             |
| `modules/nativeRegistration/services/cpvPdfService.js`                    | `services/cpvPdfService.js`                    |
| `modules/nativeRegistration/validators/nativeRegistrationValidator.js`    | `utils/nativeRegistrationValidator.js`         |
| `modules/nativeRegistration/templates/email_cpv.html`                     | `views/email_cpv.html`                         |
| `modules/nativeRegistration/public/dashboard.html`                        | `views/dashboard/dashboard.html`               |
| `modules/nativeRegistration/public/index.html`                            | `views/dashboard/index.html`                   |
| `modules/nativeRegistration/public/logo-exactbag.png`                     | `views/dashboard/logo-exactbag.png`            |
| `modules/nativeRegistration/public/icon-eb.png`                           | `views/dashboard/icon-eb.png`                  |
| `modules/nativeRegistration/public/assets/*`                              | `views/dashboard/assets/*`                     |

After these moves, `src/modules` must be empty and removed.

## Execution plan

### 1. Establish a baseline

- Record the current `/health` response.
- Run Prisma generation, Agenda job tests, native-link tests, and the 48-hour
  notification tests.
- Smoke-test the public registration pages, dashboard page, native API routes,
  static images, and one CPV preview/PDF path.
- Record the current Git status so unrelated user changes are not included.

### 2. Move leaf dependencies first

- Move the repository and validator to `repositories` and `utils`.
- Move the CPV, notification, authentication, and registration services to
  `services`.
- Rewrite their relative imports to the shorter top-level paths.
- Update `cpvPdfService` to load the logo from `views/dashboard`.
- Update `nativeNotificationService` to load `views/email_cpv.html`.
- Keep service exports and function signatures unchanged.

### 3. Move controllers and routes

- Move the native controller into `controllers` and update its repository,
  validator, Agenda, MinIO, SUN, authentication, and CPV imports.
- Move both routers into `routes` and update all controller, service,
  repository, configuration, MinIO, manual-sale, physical-tag, and NOW imports.
- Preserve router ordering because public registration, dashboard auth, static
  assets, manual sales, physical-tag sales, and NOW integration have different
  access rules.

### 4. Move static files and templates

- Move the dashboard HTML, legacy index, icons, logo, and product assets beneath
  `views/dashboard`.
- Keep their existing filenames and browser-relative paths wherever possible.
- Change the static root in `app.js` from the module public directory to
  `views/dashboard`.
- Verify that `/native/dashboard`, `/native/assets/*`, `/native/icon-eb.png`,
  `/native/logo-exactbag.png`, and any legacy `/native/index.html` link still
  resolve as before.

### 5. Rewire application entry points

- Change `app.js` to import `routes/nativeRegistrationRoutes.js`.
- Change `server.js` graceful shutdown to import `services/cpvPdfService.js`.
- Change `returnFlightScheduler.js` to import
  `services/nativeNotificationService.js`.
- Search the full repository for `modules/nativeRegistration`,
  `../modules/nativeRegistration`, and old three-level relative imports.
- Remove the now-empty `src/modules/nativeRegistration` and `src/modules`
  directories.

### 6. Verify behavior and assets

- Run `node --check` for every moved JavaScript file and every changed consumer.
- Run:
  - `npm run prisma:generate`
  - `npm run test:agenda-jobs`
  - `npm run test:native-links`
  - `npm run test:time-boundary`
- Start the server and confirm database and Agenda health.
- Request the public registration pages and dashboard/static asset URLs.
- Exercise CPV HTML generation and PDF generation to catch broken filesystem
  paths that syntax checks cannot detect.
- Confirm graceful shutdown still closes the shared browser instance.
- Run `git diff --check` and scan changed files for Unicode replacement
  characters to prevent mojibake.

## Invariants

- Public URLs remain unchanged; only filesystem and import paths change.
- The `NATIVE_REGISTRATION_ENABLED` feature flag keeps the same default and
  behavior.
- Dashboard JWT roles and middleware ordering remain unchanged.
- Native registrations, baggage items, physical-tag sales, NOW requests, and
  existing database data remain untouched.
- Agenda handlers, notification templates, Meta template variables, and the
  48-hour outbound-date rules remain untouched.
- No Prisma migration is required for this refactor.

## Main risks and controls

- **Broken relative imports:** move leaf files first and syntax-check after each
  group.
- **Broken static assets:** preserve the `/native` URL namespace and explicitly
  smoke-test every asset family.
- **Broken CPV logo/template loading:** centralize the new absolute paths with
  `path.resolve` and test both email HTML and PDF creation.
- **Route precedence regression:** keep the existing mount order in `app.js` and
  the route declaration order inside `nativeRegistrationRoutes.js`.
- **Mojibake during large moves:** perform moves without rewriting file contents,
  patch imports separately, and scan for the Unicode replacement character.

## Suggested implementation commits

1. `refactor: move native registration services to src folders`
2. `refactor: move native registration routes and controller`
3. `refactor: relocate native registration assets and remove modules folder`

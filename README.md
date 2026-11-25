# HOMA — Hotel Distribution Workspace

A focused hotel operations prototype: the availability matrix comes first, not a decorative marketing homepage.

**Status:** browser demo and an authenticated, single-property Vercel workspace. Channex credentials and room/rate-plan mappings enable provider operations.

## What staff can actually do

- **Availability & rates:** see sellable Classic, Deluxe and Suite rooms by date. Edit one date or bulk update nightly rate, minimum stay, stop sell, closed to arrival and closed to departure.
- **Room calendar:** see occupied, vacant and blocked rooms, click vacant days to create bookings, open existing stays.
- **Reservations:** create, edit, cancel, check in/out, search and filter; checkout dates are exclusive and overlaps are prevented.
- **CSV imports:** paste reservations, inspect accepted/rejected rows and explicitly commit the valid subset. Duplicates and occupancy conflicts are detected.
- **Channel mapping:** map every local room category to a Channex room and rate plan. The original channel-specific estimates and offline CSV exports remain available.
- **Sync queue:** queue inventory, rate and restriction changes, submit a batch to Channex, retry failures, and review acknowledgements and provider task IDs.
- **Booking revisions:** import creations, modifications and cancellations from the Channex feed. Revisions are acknowledged after saving and duplicates are safe to retry.
- **iCalendar exchange:** manually import a .ics availability calendar as date-only inventory blocks, without creating fictional guests or revenue; export occupied dates without guest names. This is NOT live syncing.
- **Operations:** edit the physical room directory and base rates, move rooms into/out of maintenance with booking safeguards, block room dates for repairs, review a local activity log, and export/restore workspace data.

## Channex setup on Vercel

1. Open **Channels → Channex plans & billing** to review the official plan. Channex also offers staging credentials for integration testing.
2. In the Vercel project, configure `CHANNEX_MODE=staging`, `CHANNEX_API_KEY` and `CHANNEX_PROPERTY_ID`. Use a DZD test property and a property-scoped API key. Redeploy after setting the variables.
3. Open **Channels → Open shared workspace** with the server's `HOMA_WORKSPACE_KEY`. The shared workspace starts with a sample room directory and no bookings. Restore the property's HOMA backup or verify and edit the room directory before setting up a real property.
4. Use **Check connection**, then map each room with its Channex room UUID and rate-plan UUID. Channel connections and their individual OTA mappings are managed in Channex.
5. **Queue full sync** stages 120 days. **Send next batch** submits the current availability, rates and restrictions and records Channex task IDs. Check the result in Channex's staging extranet.
6. Use **Pull bookings** or register a Channex booking webhook at `/api/channel-webhook` with event mask `booking`, `send_data` enabled and the `x-homa-webhook-secret` header set to `CHANNEX_WEBHOOK_SECRET`. The webhook reads revisions from the authenticated feed and does not trust booking content sent to the callback.

Vercel Blob supplies private state storage, with conditional writes to prevent simultaneous changes from overwriting each other. The browser demo stores data locally and labels processed queue items as simulated. Netlify static hosting serves the browser demo. The Vercel API is required for shared storage and Channex operations.

Test a complete round trip in staging before changing `CHANNEX_MODE=production`. Channex's onboarding and certification process governs access to production. HOMA currently supports one DZD property and one rate plan per room type.

## Run locally

Node 22 or later.

    npm ci
    npm start

Visit http://localhost:4173/ or http://localhost:4173/app .

## Validate

    npm run check
    npm test
    npm run build:netlify

The automated suite checks inventory, stay restrictions, reservation lifecycle, CSV/iCalendar imports, offline mapping, dashboard render and release bundling. These tests do not replace a full browser/accessibility/security audit.

## Netlify publishing

Connect GitHub repository aminemons/channelmanager to Netlify through Add new project > Import existing project. Netlify reads netlify.toml. It executes the tests and publishes the dist directory, with /app rewritten to the main document. If continuous deployment is enabled, new commits to main rebuild automatically.

    Build command: npm run check && npm test && npm run build:netlify
    Publish directory: dist

## Code

- workspace.js: operational interface, screen and forms
- workspace.css: responsive UI
- workspace-core.mjs: daily ARI model, bookings, mapping and CSV
- calendar-exchange.mjs: manual .ics imports/exports
- hotel.mjs: sample seed and legacy booking primitives
- scripts/build-netlify.mjs: static release
- scripts/serve.mjs: dependency-free local server with /app fallback
- tests/: automated validation

Old app.js and styles.css remain for archival tests but are not served by the new Netlify build.

This prototype is original code, not a copy of any proprietary Channel Manager.

The control desk calculates its work queue from reservation lifecycle, sellable inventory and missing local mappings. The performance view computes actual booked room-nights, ADR, RevPAR, and revenue by channel from the currently stored booking records; it does not invent forecast demand or live OTA data.

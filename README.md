# HOMA — Hotel Distribution Workspace

A focused hotel operations prototype: the availability matrix comes first, not a decorative marketing homepage.

**Status:** working single-browser prototype. No OTA account is connected. Do not use this as a source of truth for a working hotel.

## What staff can actually do

- **Availability & rates:** see sellable Classic, Deluxe and Suite rooms by date. Edit one date or bulk update nightly rate, minimum stay, stop sell, closed to arrival and closed to departure.
- **Room calendar:** see occupied, vacant and blocked rooms, click vacant days to create bookings, open existing stays.
- **Reservations:** create, edit, cancel, check in/out, search and filter; checkout dates are exclusive and overlaps are prevented.
- **CSV imports:** paste reservations, inspect accepted/rejected rows and explicitly commit the valid subset. Duplicates and occupancy conflicts are detected.
- **Channel mapping:** locally map internal room types to external plan IDs for Booking.com, Expedia and Airbnb; configure a rate adjustment and export offline ARI CSV.
- **iCalendar exchange:** manually import a .ics availability calendar into one room or export its occupied dates without guest names. This is NOT live syncing.
- **Operations:** edit the physical room directory and base rates, move rooms into/out of maintenance with booking safeguards, block room dates for repairs, review a local activity log, and export/restore workspace data.

## Important limitations

This version stores data only in the current browser's localStorage. There is no multi-user access, server database, payment gateway, approved OTA API connection, automated calendar polling or verified production security. Sample hotel and guests are fictional. **Do not enter real guest or hotel data in this prototype.** An actual Channel Manager needs OTA partner approval, mapping, queue/retry mechanisms, transactional inventory control, staff authorization and monitoring.

## Run locally

Node 22 or later; no third-party packages needed.

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

## Production roadmap

Transactional database, hotel tenancy and roles, atomic overbooking prevention, certified OTA API adapters, idempotent webhook processing, reconciliation jobs, security/a11y/browser QA, and monitored backups.

This prototype is original code, not a copy of any proprietary Channel Manager.

The control desk calculates its work queue from reservation lifecycle, sellable inventory and missing local mappings. The performance view computes actual booked room-nights, ADR, RevPAR, and revenue by channel from the currently stored booking records; it does not invent forecast demand or live OTA data. This remains a local demo.

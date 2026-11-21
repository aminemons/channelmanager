# HOMA — Hotel Operations Workspace

A considered, responsive **hotel operations prototype** with a public marketing experience and a functioning, local-first staff workspace. Built from scratch for `aminemons/channelmanager`.

**Live application:** `https://channelmanager-homa.vercel.app` (once deployed)

## What works now

- **Overview:** occupancy today, front-desk activity, next-seven-day booking value, upcoming stays.
- **Reservations:** create, edit, cancel, search, filter, and export CSV. Bookings have guests, room, dates, guest count, source, status, and a fixed nightly booked rate.
- **Calendar:** 14-day horizontal inventory plan, room occupancy overlays, date navigation, click-to-book open days.
- **Rooms & rates:** add a room, update rate/type/floor, mark as maintenance with future booking safety checks.
- **Guests:** derive a guest list from reservation records.
- **Reports:** occupancy outlook, booked room nights, and breakdown by source.
- **Workspace settings:** rename property, export/import a JSON backup, restore sample data.
- **Responsive UI:** desktop, tablet, mobile, and reduced-motion accommodations.
- **Conflict prevention:** room/date overlap validation, exclusive checkout dates, unavailable maintenance rooms.

## Scope: demo, not a production Channel Manager

This prototype stores records in **the current browser's localStorage**. Data is not shared between devices, there is no user login, no secure backend, no transactional database, and no payment processing. Sample guests are entirely fictional. **Never enter actual hotel or guest data into this demo.**

The Booking.com, Airbnb, and Expedia screens explicitly say **Not connected**. They do not perform OTA synchronization. Actual connectivity requires provider partnership/API approval, rate and inventory mapping, webhook/polling processing, transactional persistence, retries/idempotency, security reviews, and monitoring. Do not market this prototype as having real channel integrations.

### Production roadmap

1. Transactional PostgreSQL database for properties, staff, rooms, rate plans, bookings, inventory blocks, and reconciliation events. Enforce overlapping-stay exclusion transactionally.
2. Authentication, property tenancy, role-based authorization, audit history, encryption and GDPR / applicable local privacy compliance.
3. Server booking APIs with idempotency keys, optimistic concurrency, request validation and durable queues.
4. Approved OTA partner integrations: mapping, credential vault, sandbox certification, webhook deduplication, retries, and daily inventory reconciliation.
5. End-to-end browser tests, observability, backups, security scans, and controlled production releases.

## Run locally

No package installation is required. Any static server works:

```bash
python3 -m http.server 4173
# Open http://localhost:4173 then http://localhost:4173/app
```

## Test

Requires Node.js 20+; no dependencies:

```bash
npm run check
npm test
```

The pure booking engine is in `hotel.mjs`, and its unit tests are in `tests/hotel.test.mjs`.

## Technology

Zero-framework vanilla JavaScript modules, semantic HTML, custom responsive CSS, and SVG iconography. Deliberately no CDN component kit, heavy UI framework, or dependency-lock maintenance burden. Fonts have system fallbacks.

## Open-source reference evaluation

- **QloApps** ([repository](https://github.com/Qloapps/QloApps)): a mature PHP + MySQL hotel PMS and booking engine, but a different hosting stack; check the terms and availability of any channel modules.
- **Kamra PMS** ([repository](https://github.com/Kamra-PMS/kamra-pms)): feature-rich Frappe-based hotel PMS (AGPL). Heavy self-hosted architecture and licensing considerations; not suitable to silently copy into a small Vercel frontend.

HOMA's implementation is new and does not copy their source code. Use these for workflow and feature research rather than assuming OTA integrations are freely reusable.

## Privacy & licensing

MIT-licensed original prototype. No real guest details and no embedded service credentials. Demo data can be cleared from Settings or browser storage. All customer-facing integration claims must remain truthful.

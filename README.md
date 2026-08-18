# MDM Dummy Consumer

Dummy consumer application for POC Scenario 2: **MDM &rarr; AEM &rarr; CPI &rarr; Consumer**.

SAP CPI's AEM Adapter iflow forwards the MDM object-change event it consumed from Advanced
Event Mesh to this app's `POST /api/events` endpoint. The React UI shows received events live.

## Structure

- `server/` &mdash; Express API. Receives events from CPI, persists them, and streams new events to
  the browser over Server-Sent Events.
- `client/` &mdash; React (Vite) UI that lists received events in a table and lets you view each one's details.
- `db/` &mdash; Plain (non-CAP) HDI deployer. Defines the `EVENTS` table deployed to a shared SAP HANA
  HDI container (`hdi-shared` plan &mdash; see `mta.yaml`).

## Storage

`server/db.js` persists events to HANA (via the `hdb` driver) whenever a HANA service is bound —
this is the case for the deployed app. When no HANA service is bound (local `npm run dev`), it
falls back to an in-memory array automatically, so local dev needs no database setup. Check
`GET /api/health` to see which one is active (`"storage": "hana"` or `"in-memory"`).

## Run locally

```bash
npm run install:all
npm run dev
```

- Server: http://localhost:4000
- Client: http://localhost:5173 (proxies `/api` to the server)

## Deploying to SAP BTP Cloud Foundry

`mta.yaml` deploys the frontend and backend as two separate Cloud Foundry apps:

- `mdm-consumer-srv` &mdash; the Express API (fixed route host `mdm-consumer-srv`)
- `mdm-consumer-ui` &mdash; the built React app served via `staticfile_buildpack` (fixed route host `mdm-consumer-ui`)

Both get the same default domain, so the UI derives the backend's URL from its own hostname
at runtime (see `client/src/apiBase.js`) &mdash; no build-time configuration needed.

```bash
mbt build
cf deploy mta_archives/mdm-dummy-consumer_1.0.0.mtar
```

Give SAP CPI the resulting `mdm-consumer-srv` route (e.g. `https://mdm-consumer-srv.<domain>/api/events`)
to POST events to.

## Endpoints

| Method | Path                 | Purpose                                          |
| ------ | -------------------- | ------------------------------------------------- |
| POST   | `/api/events`        | CPI calls this with the forwarded event payload  |
| GET    | `/api/events`        | Returns event history                            |
| DELETE | `/api/events`        | Clears event history                             |
| GET    | `/api/events/stream` | SSE stream of newly received events              |

### Sample payload CPI should POST

```json
{
  "eventId": "22a61824-bcb2-461c-8c27-0d67396c456b",
  "eventType": "MDM_OBJECT_CREATED",
  "objectId": "MDM-BUSINESSPARTNER-C11D888C",
  "objectType": "BusinessPartner",
  "version": 1,
  "leadSystem": "CRM",
  "siteId": "SITE-001",
  "changedFields": [],
  "timestamp": "2026-04-10T06:52:25.698751454Z",
  "correlationId": "34f3f68b-a5c5-4ab4-a4ef-52ddc4f606c3"
}
```


import crypto from 'node:crypto';
import xsenv from '@sap/xsenv';
import hdb from 'hdb';

let client = null;
let connected = false;
let eventsTable = 'EVENTS';

export function connect() {
  return new Promise((resolve) => {
    let credentials;
    try {
      xsenv.loadEnv();
      ({ hana: credentials } = xsenv.getServices({ hana: { tag: 'hana' } }));
    } catch (err) {
      console.log('No bound HANA service found — using in-memory storage for local dev.');
      return resolve(false);
    }

    client = hdb.createClient({
      host: credentials.host,
      port: credentials.port,
      user: credentials.user,
      password: credentials.password,
      ca: credentials.certificate,
    });

    client.on('error', (err) => console.error('HANA connection error:', err.message));

    client.connect((err) => {
      if (err) {
        console.error('Failed to connect to HANA, falling back to in-memory storage:', err.message);
        client = null;
        return resolve(false);
      }
      // hdb has no "schema" connect option — without this, HANA defaults the
      // session's current schema to the runtime user's own (empty) name
      // instead of the HDI container schema, so every query is fully qualified.
      eventsTable = `"${credentials.schema}"."EVENTS"`;
      console.log('Connected to HANA.');
      connected = true;
      resolve(true);
    });
  });
}

export function isConnected() {
  return connected;
}

function query(sql, params = []) {
  return new Promise((resolve, reject) => {
    client.prepare(sql, (err, statement) => {
      if (err) return reject(err);
      statement.exec(params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  });
}

// hdb needs TIMESTAMP params as 'YYYY-MM-DD HH:MM:SS.sss' strings, not Date objects.
function toHanaTimestamp(date) {
  return date.toISOString().replace('T', ' ').replace('Z', '');
}

export async function insertEvent(event) {
  const id = crypto.randomUUID();
  await query(
    `INSERT INTO ${eventsTable} (ID, EVENT_ID, EVENT_TYPE, OBJECT_ID, OBJECT_TYPE, VERSION, LEAD_SYSTEM, SITE_ID, CORRELATION_ID, EVENT_TIMESTAMP, RECEIVED_AT, CHANGED_FIELDS, PAYLOAD)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      event.eventId ?? null,
      event.eventType ?? null,
      event.objectId ?? null,
      event.objectType ?? null,
      typeof event.version === 'number' ? event.version : null,
      event.leadSystem ?? null,
      event.siteId ?? null,
      event.correlationId ?? null,
      event.timestamp ? toHanaTimestamp(new Date(event.timestamp)) : null,
      toHanaTimestamp(new Date(event.receivedAt)),
      JSON.stringify(event.changedFields ?? []),
      JSON.stringify(event.payload ?? {}),
    ]
  );
}

export async function fetchEvents() {
  const rows = await query(
    `SELECT EVENT_ID, EVENT_TYPE, OBJECT_ID, OBJECT_TYPE, VERSION, LEAD_SYSTEM, SITE_ID, CORRELATION_ID, EVENT_TIMESTAMP, RECEIVED_AT, CHANGED_FIELDS, PAYLOAD
     FROM ${eventsTable} ORDER BY RECEIVED_AT DESC`
  );
  return rows.map((row) => ({
    eventId: row.EVENT_ID,
    eventType: row.EVENT_TYPE,
    objectId: row.OBJECT_ID,
    objectType: row.OBJECT_TYPE,
    version: row.VERSION,
    leadSystem: row.LEAD_SYSTEM,
    siteId: row.SITE_ID,
    correlationId: row.CORRELATION_ID,
    timestamp: row.EVENT_TIMESTAMP ? new Date(row.EVENT_TIMESTAMP).toISOString() : null,
    receivedAt: new Date(row.RECEIVED_AT).toISOString(),
    changedFields: row.CHANGED_FIELDS ? JSON.parse(row.CHANGED_FIELDS) : [],
    payload: row.PAYLOAD ? JSON.parse(row.PAYLOAD) : {},
  }));
}

export async function clearEvents() {
  await query(`DELETE FROM ${eventsTable}`);
}

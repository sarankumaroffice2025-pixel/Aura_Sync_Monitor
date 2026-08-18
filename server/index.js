import express from 'express';
import cors from 'cors';
import * as db from './db.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
// Parse the body as JSON regardless of the Content-Type header — CPI's HTTP
// receiver adapter has been observed sending an empty Content-Type, which
// would otherwise leave the (valid) JSON body unparsed.
// `verify` stashes the raw bytes on the request before JSON.parse runs, so a
// parse failure can still be logged with the exact payload that caused it.
app.use(express.json({
  type: () => true,
  verify: (req, _res, buf) => {
    req.rawBody = buf.toString('utf8');
  },
}));

// In-memory fallback so local dev works without a bound HANA service —
// db.isConnected() is only true when a real HDI container was reachable.
const memoryEvents = [];
const sseClients = new Set();

function broadcast(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    client.write(payload);
  }
}

// Real integration point: SAP CPI's AEM Adapter iflow calls this endpoint
// to forward the event it consumed from Advanced Event Mesh.
app.post('/api/events', async (req, res) => {
  console.log('--- POST /api/events ---');
  console.log('Headers:', JSON.stringify(req.headers, null, 2));
  console.log('Body:', JSON.stringify(req.body, null, 2));

  const event = { receivedAt: new Date().toISOString(), ...req.body };

  if (db.isConnected()) {
    try {
      await db.insertEvent(event);
    } catch (err) {
      console.error('Failed to persist event to HANA:', err.message);
    }
  } else {
    memoryEvents.unshift(event);
  }

  broadcast(event);
  res.status(201).json({ status: 'received', event });
});

app.get('/api/events', async (_req, res) => {
  if (db.isConnected()) {
    try {
      return res.json(await db.fetchEvents());
    } catch (err) {
      console.error('Failed to read events from HANA:', err.message);
      return res.status(500).json({ status: 'error', message: 'Failed to read event history' });
    }
  }
  res.json(memoryEvents);
});

app.delete('/api/events', async (_req, res) => {
  if (db.isConnected()) {
    try {
      await db.clearEvents();
    } catch (err) {
      console.error('Failed to clear HANA events:', err.message);
    }
  } else {
    memoryEvents.length = 0;
  }
  res.status(204).end();
});

app.get('/api/events/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.flushHeaders();

  sseClients.add(res);
  req.on('close', () => sseClients.delete(res));
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', storage: db.isConnected() ? 'hana' : 'in-memory' });
});

app.use((err, req, res, _next) => {
  console.error('Failed to parse request body:', err.message);
  console.error('Raw body received:', req.rawBody);
  res.status(400).json({ status: 'error', message: 'Invalid JSON body' });
});

db.connect().finally(() => {
  app.listen(PORT, () => {
    console.log(`MDM dummy consumer listening on http://localhost:${PORT}`);
  });
});

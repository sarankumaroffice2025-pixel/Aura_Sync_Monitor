import { useEffect, useMemo, useRef, useState } from 'react';
import { API_BASE_URL } from './apiBase';

const STATUS_COLORS = { good: '#0ca30c', warning: '#fab219', serious: '#ec835a', critical: '#d03b3b' };
const STATUS_TRACK = { good: '#d9f2d9', warning: '#fdecc4', serious: '#fadecf', critical: '#f6d3d3' };
const STATUS_TEXT = { good: 'Good', warning: 'Fair', serious: 'Low', critical: 'Critical' };

function scoreStatus(ratio) {
  if (ratio >= 0.8) return 'good';
  if (ratio >= 0.5) return 'warning';
  if (ratio >= 0.25) return 'serious';
  return 'critical';
}

// A single ratio (e.g. a data-quality/completeness score) reads better as a
// meter than a legend-requiring pie — same idea the user asked for ("pie chart"),
// built as a ring so severity carries the fill color, not the shape.
function ScoreMeter({ label, value }) {
  const ratio = Number(value);
  const pct = Math.round(ratio * 100);
  const status = scoreStatus(ratio);
  const circumference = 2 * Math.PI * 40;
  const offset = circumference * (1 - ratio);

  return (
    <div className="score-meter">
      <svg viewBox="0 0 100 100" className="score-ring" role="img" aria-label={`${label}: ${pct}%`}>
        <circle cx="50" cy="50" r="40" fill="none" stroke={STATUS_TRACK[status]} strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r="40"
          fill="none"
          stroke={STATUS_COLORS[status]}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
        />
        <text x="50" y="46" textAnchor="middle" className="score-ring-value">
          {pct}%
        </text>
        <text x="50" y="63" textAnchor="middle" className="score-ring-caption">
          {label}
        </text>
      </svg>
      <span className="score-status-label">{STATUS_TEXT[status]}</span>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div className="detail-field">
      <span className="detail-label">{label}</span>
      <span className="detail-value">{value ?? '-'}</span>
    </div>
  );
}

function ChipList({ items }) {
  if (!items || items.length === 0) return <p className="detail-empty">No fields specified</p>;
  return (
    <div className="changed-fields">
      {items.map((item, i) => (
        <span key={i} className="field-chip">
          {typeof item === 'object' ? JSON.stringify(item) : String(item)}
        </span>
      ))}
    </div>
  );
}

function humanizeKey(key) {
  return key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_.]/g, ' ')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// coreAttributes/extensions have no fixed schema across object types (per MDM),
// so their fields are rendered generically rather than by hardcoded field name.
function DynamicFields({ data }) {
  const entries = Object.entries(data ?? {});
  if (entries.length === 0) return <p className="detail-empty">No data</p>;

  const isRatioScore = (key, value) => {
    if (!/score/i.test(key)) return false;
    if (typeof value !== 'number' && typeof value !== 'string') return false;
    const num = Number(value);
    return Number.isFinite(num) && num >= 0 && num <= 1;
  };
  const scores = entries.filter(([k, v]) => isRatioScore(k, v));
  const simple = entries.filter(([k, v]) => !isRatioScore(k, v) && (v === null || typeof v !== 'object' || Array.isArray(v)));
  const nested = entries.filter(([, v]) => v !== null && typeof v === 'object' && !Array.isArray(v));

  return (
    <>
      {scores.map(([key, value]) => (
        <ScoreMeter key={key} label={humanizeKey(key)} value={value} />
      ))}
      {simple.length > 0 && (
        <div className="detail-grid">
          {simple.map(([key, value]) => (
            <div className="detail-field" key={key}>
              <span className="detail-label">{humanizeKey(key)}</span>
              {Array.isArray(value) ? (
                <ChipList items={value} />
              ) : (
                <span className="detail-value">
                  {value === null || value === undefined || value === '' ? '-' : String(value)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {nested.map(([key, value]) => (
        <div className="nested-group" key={key}>
          <h5>{humanizeKey(key)}</h5>
          <DynamicFields data={value} />
        </div>
      ))}
    </>
  );
}

function EventDetails({ event }) {
  const payload = event.payload ?? {};

  return (
    <div className="detail-panel">
      <div className="detail-section">
        <h4>Object</h4>
        <div className="detail-grid">
          <Field label="Object ID" value={event.objectId} />
          <Field label="Object Type" value={event.objectType} />
          <Field label="Version" value={event.version} />
          <Field label="Lead System" value={event.leadSystem} />
          <Field label="Site ID" value={event.siteId} />
          <Field label="Status" value={payload.status} />
        </div>
      </div>
      <div className="detail-section">
        <h4>Event</h4>
        <div className="detail-grid">
          <Field label="Event ID" value={event.eventId} />
          <Field label="Event Type" value={event.eventType} />
          <Field label="Correlation ID" value={event.correlationId} />
          <Field label="Timestamp" value={event.timestamp && new Date(event.timestamp).toLocaleString()} />
          <Field label="Received At" value={event.receivedAt && new Date(event.receivedAt).toLocaleString()} />
        </div>
      </div>
      <div className="detail-section">
        <h4>Changed Fields</h4>
        <ChipList items={event.changedFields} />
      </div>
      {payload.coreAttributes && (
        <div className="detail-section detail-section-wide">
          <h4>Core Attributes</h4>
          <DynamicFields data={payload.coreAttributes} />
        </div>
      )}
      {payload.extensions && Object.keys(payload.extensions).length > 0 && (
        <div className="detail-section detail-section-wide">
          <h4>Extensions</h4>
          <DynamicFields data={payload.extensions} />
        </div>
      )}
      {payload.metadata && (
        <div className="detail-section detail-section-wide">
          <h4>Metadata</h4>
          <DynamicFields data={payload.metadata} />
        </div>
      )}
    </div>
  );
}

// Best-effort preview of the record for the table row — coreAttributes has no
// fixed schema, so this just surfaces the first couple of simple values found.
function summarizeCoreAttributes(coreAttributes) {
  if (!coreAttributes) return '-';
  const values = Object.values(coreAttributes).filter(
    (v) => typeof v === 'string' || typeof v === 'number'
  );
  return values.length > 0 ? values.slice(0, 2).join(' · ') : '-';
}

function EventRow({ event, selected, onSelect }) {
  const rowId = event.eventId ?? event.receivedAt;

  return (
    <tr className={`event-row${selected ? ' event-row-selected' : ''}`} onClick={() => onSelect(rowId)}>
      <td>{event.objectId ?? '-'}</td>
      <td className="col-compact">{event.objectType ?? '-'}</td>
      <td>{summarizeCoreAttributes(event.payload?.coreAttributes)}</td>
      <td className="col-compact">
        <span className={`status-badge status-badge-${event.status ?? 'other'}`}>
          {STATUS_BADGE_LABEL[event.status] ?? 'Other'}
        </span>
      </td>
      <td className="col-compact">
        <span className="event-type">{event.eventType ?? 'Unknown'}</span>
      </td>
      <td className="col-compact">{event.leadSystem ?? '-'}</td>
      <td className="col-compact">{event.siteId ?? '-'}</td>
      <td className="col-compact">{event.version ?? '-'}</td>
      <td className="col-compact">{new Date(event.receivedAt ?? event.timestamp).toLocaleString()}</td>
      <td className="expand-col">
        <button className="view-btn" onClick={(e) => { e.stopPropagation(); onSelect(rowId); }}>
          {selected ? 'Hide' : 'View'}
        </button>
      </td>
    </tr>
  );
}

const STATUS_LABEL = {
  connecting: 'Connecting',
  live: 'Live',
  disconnected: 'Disconnected',
};

const COLUMNS = [
  { key: 'objectId', label: 'Object ID' },
  { key: 'objectType', label: 'Object Type', compact: true },
  { key: 'summary', label: 'Summary', sortable: false },
  { key: 'status', label: 'Status', compact: true },
  { key: 'eventType', label: 'Event Type', compact: true },
  { key: 'leadSystem', label: 'Lead System', compact: true },
  { key: 'siteId', label: 'Site ID', compact: true },
  { key: 'version', label: 'Version', compact: true },
  { key: 'receivedAt', label: 'Received At', compact: true },
];

function getSortValue(event, key) {
  if (key === 'receivedAt') return new Date(event.receivedAt ?? event.timestamp ?? 0).getTime();
  if (key === 'version') return typeof event.version === 'number' ? event.version : -Infinity;
  return (event[key] ?? '').toString().toLowerCase();
}

function compareEvents(a, b, key, dir) {
  const av = getSortValue(a, key);
  const bv = getSortValue(b, key);
  const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
  return dir === 'asc' ? cmp : -cmp;
}

function matchesSearch(event, term) {
  if (!term) return true;
  const haystack = [
    event.objectId,
    event.objectType,
    event.eventType,
    event.leadSystem,
    event.siteId,
    event.correlationId,
    event.eventId,
    JSON.stringify(event.payload?.coreAttributes ?? {}),
  ]
    .join(' ')
    .toLowerCase();
  return haystack.includes(term.toLowerCase());
}

const EVENT_CATEGORIES = [
  { key: 'created', label: 'Created', match: /CREATE/ },
  { key: 'updated', label: 'Updated', match: /UPDATE|CHANGE/ },
  { key: 'deleted', label: 'Deleted', match: /DELETE/ },
];

function classifyEventType(eventType) {
  const t = (eventType ?? '').toUpperCase();
  const category = EVENT_CATEGORIES.find((c) => c.match.test(t));
  return category?.key ?? 'other';
}

const STATUS_BADGE_LABEL = {
  created: 'Created',
  updated: 'Updated',
  deleted: 'Deleted',
  other: 'Other',
};

const OBJECT_TABS = [{ key: 'all', label: 'All' }, ...EVENT_CATEGORIES];

// Only version/receivedAt are compared — an object's identity in the feed is
// its objectId, and "current" always means the highest version (falling back
// to recency when version is missing/tied) regardless of arrival order.
function isNewerEvent(a, b) {
  const av = typeof a.version === 'number' ? a.version : null;
  const bv = typeof b.version === 'number' ? b.version : null;
  if (av !== null && bv !== null && av !== bv) return av > bv;
  const at = new Date(a.receivedAt ?? a.timestamp ?? 0).getTime();
  const bt = new Date(b.receivedAt ?? b.timestamp ?? 0).getTime();
  return at > bt;
}

// Collapses the raw event log (one row per event) into one row per object,
// keeping only its most recent event. A DELETE is never a physical removal —
// it's just the newest event for that objectId — so an object "soft deletes"
// simply by having a delete event become its latest state.
function buildObjectStates(events) {
  const latestById = new Map();
  for (const event of events) {
    const id = event.objectId ?? `__no-object-id-${event.eventId ?? event.receivedAt}`;
    const current = latestById.get(id);
    if (!current || isNewerEvent(event, current)) latestById.set(id, event);
  }
  return Array.from(latestById.values()).map((event) => {
    const status = classifyEventType(event.eventType);
    return { ...event, status, isDeleted: status === 'deleted' };
  });
}

const SPLIT_PCT_KEY = 'aura-mdm-split-pct';
const SPLIT_LAYOUT_KEY = 'aura-mdm-split-layout';
const NARROW_BREAKPOINT = 860;

const LAYOUT_META = {
  auto: { icon: '⇆', label: 'Auto' },
  row: { icon: '⬌', label: 'Side-by-side' },
  column: { icon: '⬍', label: 'Stacked' },
};

function loadStoredSplitPct() {
  const stored = Number(localStorage.getItem(SPLIT_PCT_KEY));
  return Number.isFinite(stored) && stored >= 30 && stored <= 75 ? stored : 58;
}

function loadStoredLayoutPref() {
  const stored = localStorage.getItem(SPLIT_LAYOUT_KEY);
  return stored === 'row' || stored === 'column' ? stored : 'auto';
}

function SortableHeader({ column, sortKey, sortDir, onSort }) {
  const className = column.compact ? 'col-compact' : undefined;
  if (column.sortable === false) return <th className={className}>{column.label}</th>;
  const active = sortKey === column.key;
  return (
    <th className={className}>
      <button className="sort-th" onClick={() => onSort(column.key)}>
        {column.label}
        <span className="sort-arrow">{active ? (sortDir === 'asc' ? '▲' : '▼') : ''}</span>
      </button>
    </th>
  );
}

export default function App() {
  const [events, setEvents] = useState([]);
  const [status, setStatus] = useState('connecting');
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [sortKey, setSortKey] = useState('receivedAt');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedId, setSelectedId] = useState(null);
  const [splitPct, setSplitPct] = useState(loadStoredSplitPct);
  const [layoutPref, setLayoutPref] = useState(loadStoredLayoutPref);
  const [viewportNarrow, setViewportNarrow] = useState(
    () => window.matchMedia(`(max-width: ${NARROW_BREAKPOINT}px)`).matches
  );
  const workspaceRef = useRef(null);

  const effectiveLayout = layoutPref === 'auto' ? (viewportNarrow ? 'column' : 'row') : layoutPref;

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${NARROW_BREAKPOINT}px)`);
    const handler = (e) => setViewportNarrow(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    localStorage.setItem(SPLIT_PCT_KEY, String(splitPct));
  }, [splitPct]);

  useEffect(() => {
    localStorage.setItem(SPLIT_LAYOUT_KEY, layoutPref);
  }, [layoutPref]);

  function cycleLayout() {
    setLayoutPref((prev) => (prev === 'auto' ? 'row' : prev === 'row' ? 'column' : 'auto'));
  }

  function handleSplitterMouseDown(e) {
    e.preventDefault();
    const workspaceEl = workspaceRef.current;
    if (!workspaceEl) return;
    const isColumn = effectiveLayout === 'column';

    function handleMouseMove(moveEvent) {
      const rect = workspaceEl.getBoundingClientRect();
      const pct = isColumn
        ? ((moveEvent.clientY - rect.top) / rect.height) * 100
        : ((moveEvent.clientX - rect.left) / rect.width) * 100;
      setSplitPct(Math.min(75, Math.max(30, pct)));
    }
    function handleMouseUp() {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    }
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/events`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !Array.isArray(data)) {
          throw new Error(data?.message || `Unexpected response (${res.status})`);
        }
        return data;
      })
      .then((data) => {
        console.log('[MDM Consumer] Initial event history:', data);
        setEvents(data);
      })
      .catch((err) => {
        console.error('[MDM Consumer] Failed to load event history:', err.message);
        setEvents([]);
        setStatus('disconnected');
      });

    const source = new EventSource(`${API_BASE_URL}/api/events/stream`);

    source.onopen = () => setStatus('live');
    source.onerror = () => setStatus('disconnected');
    source.onmessage = (message) => {
      const event = JSON.parse(message.data);
      console.log('[MDM Consumer] Event received live:', event);
      setEvents((prev) => [event, ...prev]);
    };

    return () => source.close();
  }, []);

  async function handleClear() {
    await fetch(`${API_BASE_URL}/api/events`, { method: 'DELETE' });
    setEvents([]);
  }

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const objectStates = useMemo(() => buildObjectStates(events), [events]);

  const tabObjects = useMemo(
    () => (activeTab === 'all' ? objectStates : objectStates.filter((o) => o.status === activeTab)),
    [objectStates, activeTab]
  );

  const visibleEvents = useMemo(() => {
    return tabObjects.filter((e) => matchesSearch(e, search)).sort((a, b) => compareEvents(a, b, sortKey, sortDir));
  }, [tabObjects, search, sortKey, sortDir]);

  const eventTypeCounts = useMemo(() => {
    const counts = { created: 0, updated: 0, deleted: 0, other: 0 };
    for (const obj of objectStates) counts[obj.status] += 1;
    return counts;
  }, [objectStates]);

  const selectedEvent = useMemo(
    () => events.find((e) => (e.eventId ?? e.receivedAt) === selectedId) ?? null,
    [events, selectedId]
  );

  function handleSelect(rowId) {
    setSelectedId((prev) => (prev === rowId ? null : rowId));
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <div className="brand-mark">AMS</div>
          <div>
            <div className="brand-title">Aura MDM Sync Monitor</div>
            <div className="brand-subtitle">MDM &rarr; AEM &rarr; CPI &rarr; Consumer &middot; Scenario 2</div>
          </div>
        </div>
        <span className={`status-pill status-${status}`}>
          <span className="status-dot" />
          {STATUS_LABEL[status] ?? status}
        </span>
      </header>

      <main className="page">
        <section className="panel">
          <div className="panel-toolbar">
            <div className="panel-toolbar-top">
              <div className="panel-stats">
                <span className="stat-count">{visibleEvents.length}</span>
                <span className="stat-label">
                  {search
                    ? `of ${tabObjects.length} ${tabObjects.length === 1 ? 'object' : 'objects'}`
                    : `${visibleEvents.length === 1 ? 'object' : 'objects'} · ${events.length} events received`}
                </span>
              </div>
              <button className="secondary" onClick={handleClear} disabled={events.length === 0}>
                Clear
              </button>
            </div>

            {events.length > 0 && (
              <div className="stat-breakdown" role="tablist" aria-label="Filter objects by status">
                {OBJECT_TABS.map(({ key, label }) => (
                  <button
                    key={key}
                    role="tab"
                    aria-selected={activeTab === key}
                    className={`stat-chip stat-chip-${key}${activeTab === key ? ' stat-chip-active' : ''}`}
                    onClick={() => setActiveTab(key)}
                  >
                    <span className="stat-chip-dot" />
                    {key === 'all' ? objectStates.length : eventTypeCounts[key]} {label}
                  </button>
                ))}
                {eventTypeCounts.other > 0 && (
                  <button
                    role="tab"
                    aria-selected={activeTab === 'other'}
                    className={`stat-chip stat-chip-other${activeTab === 'other' ? ' stat-chip-active' : ''}`}
                    onClick={() => setActiveTab('other')}
                  >
                    <span className="stat-chip-dot" />
                    {eventTypeCounts.other} Other
                  </button>
                )}
              </div>
            )}
          </div>

          {events.length > 0 && (
            <div className="panel-filters">
              <input
                type="text"
                className="search-input"
                placeholder="Search by object ID, type, event type, lead system, site ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          )}

          {events.length === 0 ? (
            <div className="empty-state">
              <svg className="empty-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="24" cy="24" r="22" stroke="currentColor" strokeWidth="2" opacity="0.25" />
                <path d="M24 14v12l8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="empty-title">No events yet</p>
              <p className="empty-desc">
                Waiting for SAP CPI to forward an MDM object event to this consumer.
              </p>
            </div>
          ) : visibleEvents.length === 0 ? (
            <p className="empty-state-inline">
              {search
                ? `No objects match "${search}".`
                : `No ${activeTab === 'all' ? '' : `${STATUS_BADGE_LABEL[activeTab]?.toLowerCase() ?? ''} `}objects yet.`}
            </p>
          ) : (
            <div
              className={`workspace${selectedEvent ? ' workspace-split' : ''}${
                selectedEvent && effectiveLayout === 'column' ? ' workspace-split-column' : ''
              }`}
              ref={workspaceRef}
            >
              <div
                className="table-col"
                style={selectedEvent ? { flex: `0 0 ${splitPct}%` } : undefined}
              >
                <div className="table-wrapper">
                  <table className="event-table">
                    <thead>
                      <tr>
                        {COLUMNS.map((column) => (
                          <SortableHeader
                            key={column.key}
                            column={column}
                            sortKey={sortKey}
                            sortDir={sortDir}
                            onSort={toggleSort}
                          />
                        ))}
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleEvents.map((event) => {
                        const rowId = event.eventId ?? event.receivedAt;
                        return (
                          <EventRow
                            key={rowId}
                            event={event}
                            selected={rowId === selectedId}
                            onSelect={handleSelect}
                          />
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {selectedEvent && (
                <div
                  className="workspace-splitter"
                  onMouseDown={handleSplitterMouseDown}
                  role="separator"
                  aria-orientation={effectiveLayout === 'column' ? 'horizontal' : 'vertical'}
                  aria-label="Resize panels"
                />
              )}

              {selectedEvent && (
                <div className="detail-col" style={{ flex: `1 1 ${100 - splitPct}%` }}>
                  <div className="detail-col-header">
                    <div>
                      <div className="detail-col-title">{selectedEvent.objectId ?? 'Event details'}</div>
                      <div className="detail-col-subtitle">{selectedEvent.objectType}</div>
                    </div>
                    <div className="detail-col-header-actions">
                      <button
                        className="layout-toggle-btn"
                        onClick={cycleLayout}
                        title={`Layout: ${LAYOUT_META[layoutPref].label}. Click to change.`}
                        aria-label={`Layout: ${LAYOUT_META[layoutPref].label}. Click to change.`}
                      >
                        <span aria-hidden="true">{LAYOUT_META[layoutPref].icon}</span>
                        {LAYOUT_META[layoutPref].label}
                      </button>
                      <button className="icon-btn" onClick={() => setSelectedId(null)} aria-label="Close details">
                        &times;
                      </button>
                    </div>
                  </div>
                  <div className="detail-col-body">
                    <EventDetails event={selectedEvent} />
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

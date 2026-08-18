const isLocalDev = ['localhost', '127.0.0.1'].includes(window.location.hostname);

// In production the UI and backend deploy as separate Cloud Foundry apps
// (see mta.yaml: hosts "mdm-consumer-ui" and "mdm-consumer-srv" on the same
// domain), so the backend's URL is derived from the UI's own hostname.
export const API_BASE_URL = isLocalDev
  ? ''
  : `${window.location.protocol}//${window.location.hostname.replace('mdm-consumer-ui', 'mdm-consumer-srv')}`;

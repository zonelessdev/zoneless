const DIDIT_WEBHOOK_PATH = '/v1/identity/webhooks/didit';

/** Zoneless cloud dashboard hosts → public Didit webhook URL */
const ZONELESS_DASHBOARD_DIDIT_WEBHOOK_URLS: Record<string, string> = {
  'dashboard.zoneless.com': `https://api.zoneless.com${DIDIT_WEBHOOK_PATH}`,
  'dashboard-test.zoneless.com': `https://api-test.zoneless.com${DIDIT_WEBHOOK_PATH}`,
};

/**
 * Didit webhook destination for identity settings help copy.
 * Zoneless cloud dashboards get the matching managed API URL; other hosts
 * get an example absolute URL to adapt for their own API domain.
 */
export function GetDiditWebhookUrl(
  hostname: string = typeof window !== 'undefined'
    ? window.location.hostname
    : ''
): string {
  return (
    ZONELESS_DASHBOARD_DIDIT_WEBHOOK_URLS[hostname] ??
    `https://api.yourdomain.com${DIDIT_WEBHOOK_PATH}`
  );
}

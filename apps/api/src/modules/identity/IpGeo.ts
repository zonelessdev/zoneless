/**
 * @fileOverview Pluggable IP → country lookup for identity lite checks.
 *
 * Default reads well-known CDN / load-balancer geo headers. Returns null when
 * unknown so mismatches only fire when both sides are known.
 *
 * Self-hosters can inject a MaxMind/IPInfo provider without forking core logic.
 *
 * @module IpGeo
 */

export interface IpGeoProvider {
  /**
   * Resolve an IP address to an ISO 3166-1 alpha-2 country code.
   * Return null when the country cannot be determined.
   */
  LookupCountry(
    ip: string | null | undefined,
    headers?: Record<string, string | string[] | undefined>
  ): Promise<string | null>;
}

/**
 * Reads country from well-known CDN / reverse-proxy headers.
 * Does not call any external API or ship a GeoIP database.
 */
export class HeaderIpGeoProvider implements IpGeoProvider {
  private static readonly HEADER_KEYS = [
    'cf-ipcountry',
    'x-vercel-ip-country',
    'x-geo-country',
    'cloudfront-viewer-country',
    // Google Cloud HTTPS LB custom headers (when configured)
    'x-gclb-country',
    'x-client-geo-location',
  ];

  async LookupCountry(
    _ip: string | null | undefined,
    headers?: Record<string, string | string[] | undefined>
  ): Promise<string | null> {
    if (!headers) return null;

    for (const key of HeaderIpGeoProvider.HEADER_KEYS) {
      const raw = headers[key] ?? headers[key.toLowerCase()];
      const value = Array.isArray(raw) ? raw[0] : raw;
      if (!value) continue;

      // X-Client-Geo-Location is often "US,Mountain View"
      const country = value.split(',')[0].trim().toUpperCase();
      // Cloudflare uses XX for unknown / T1 for tor
      if (country.length === 2 && country !== 'XX' && country !== 'T1') {
        return country;
      }
    }

    return null;
  }
}

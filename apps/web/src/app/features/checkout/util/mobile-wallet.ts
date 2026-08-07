export type MobileWalletOption = {
  name: string;
  url: string;
};

const MOBILE_WALLET_BROWSE_URLS = [
  { name: 'Phantom', baseUrl: 'https://phantom.app/ul/browse/' },
  { name: 'Solflare', baseUrl: 'https://solflare.com/ul/v1/browse/' },
  { name: 'Backpack', baseUrl: 'https://backpack.app/ul/v1/browse/' },
] as const;

export function IsMobileBrowser(
  userAgent: string,
  maxTouchPoints = 0
): boolean {
  return (
    /Android|iPhone|iPad|iPod/i.test(userAgent) ||
    (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)
  );
}

export function BuildMobileWalletOptions(
  currentUrl: string,
  origin: string
): MobileWalletOption[] {
  const encodedUrl = encodeURIComponent(currentUrl);
  const encodedOrigin = encodeURIComponent(origin);

  return MOBILE_WALLET_BROWSE_URLS.map(({ name, baseUrl }) => ({
    name,
    url: `${baseUrl}${encodedUrl}?ref=${encodedOrigin}`,
  }));
}

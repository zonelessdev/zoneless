import { BuildMobileWalletOptions, IsMobileBrowser } from './mobile-wallet';

describe('mobile wallet checkout helpers', () => {
  describe('IsMobileBrowser', () => {
    it.each([
      'Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/140 Mobile',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 19_0 like Mac OS X)',
      'Mozilla/5.0 (iPad; CPU OS 19_0 like Mac OS X)',
    ])('detects a mobile user agent', (userAgent) => {
      expect(IsMobileBrowser(userAgent)).toBe(true);
    });

    it('detects an iPad using its desktop user agent', () => {
      expect(
        IsMobileBrowser(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15',
          5
        )
      ).toBe(true);
    });

    it('does not classify a desktop browser as mobile', () => {
      expect(
        IsMobileBrowser(
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/140',
          0
        )
      ).toBe(false);
    });
  });

  describe('BuildMobileWalletOptions', () => {
    it('builds encoded browse links for supported wallet browsers', () => {
      const currentUrl =
        'https://checkout.example.com/c/test-session?prefilled=true#pay';
      const origin = 'https://checkout.example.com';
      const encodedUrl = encodeURIComponent(currentUrl);
      const encodedOrigin = encodeURIComponent(origin);

      expect(BuildMobileWalletOptions(currentUrl, origin)).toEqual([
        {
          name: 'Phantom',
          url: `https://phantom.app/ul/browse/${encodedUrl}?ref=${encodedOrigin}`,
        },
        {
          name: 'Solflare',
          url: `https://solflare.com/ul/v1/browse/${encodedUrl}?ref=${encodedOrigin}`,
        },
        {
          name: 'Backpack',
          url: `https://backpack.app/ul/v1/browse/${encodedUrl}?ref=${encodedOrigin}`,
        },
      ]);
    });
  });
});

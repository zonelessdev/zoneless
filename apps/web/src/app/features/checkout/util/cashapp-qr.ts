import { toDataURL } from 'qrcode';

export async function BuildCashAppQrDataUrl(url: string): Promise<string> {
  return toDataURL(url, {
    errorCorrectionLevel: 'H',
    margin: 1,
    width: 280,
    color: { dark: '#111111', light: '#ffffff' },
  });
}

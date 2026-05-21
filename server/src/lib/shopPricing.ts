export const PLAIN_WHITE_USD_CENTS = 500;
export const CUSTOM_UPLOAD_USD_CENTS = 700;

export function getShippingUsdCents(_country: string): number {
  return 305;
}

export function usdCentsToSats(usdCents: number, btcUsdRate: number): number {
  if (!btcUsdRate || btcUsdRate <= 0) return 0;
  return Math.ceil((usdCents / 100 / btcUsdRate) * 100_000_000);
}

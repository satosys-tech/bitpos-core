import axios from "axios";
import { logger } from "./logger.js";

interface PriceCache {
  usd: number;
  eur: number;
  gbp: number;
  fetchedAt: number;
}

let cache: PriceCache | null = null;
const CACHE_TTL_MS = 60_000;

export interface BtcPrice {
  usd: number;
  eur: number;
  gbp: number;
}

export async function getBtcPrice(): Promise<BtcPrice> {
  const now = Date.now();
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return { usd: cache.usd, eur: cache.eur, gbp: cache.gbp };
  }

  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price",
      { params: { ids: "bitcoin", vs_currencies: "usd,eur,gbp" }, timeout: 5000 },
    );
    const data = response.data?.bitcoin;
    if (!data) throw new Error("Unexpected CoinGecko response");
    cache = { usd: data.usd, eur: data.eur, gbp: data.gbp, fetchedAt: now };
    return { usd: cache.usd, eur: cache.eur, gbp: cache.gbp };
  } catch (err) {
    logger.error({ err }, "Failed to fetch BTC price from CoinGecko");
    if (cache) return { usd: cache.usd, eur: cache.eur, gbp: cache.gbp };
    return { usd: 0, eur: 0, gbp: 0 };
  }
}

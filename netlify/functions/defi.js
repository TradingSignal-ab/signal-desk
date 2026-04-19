const https = require("https");

const PROTOCOL_SLUGS = {
  "ETH":   { type:"chain",     slug:"ethereum",     name:"Ethereum",     token:"ETH",   category:"L1 Chain",        geckoId:"ethereum",        coinCapId:"ethereum",        note:null },
  "SOL":   { type:"chain",     slug:"solana",       name:"Solana",       token:"SOL",   category:"L1 Chain",        geckoId:"solana",           coinCapId:"solana",           note:null },
  "AVAX":  { type:"chain",     slug:"avalanche",    name:"Avalanche",    token:"AVAX",  category:"L1 Chain",        geckoId:"avalanche-2",      coinCapId:"avalanche",        note:null },
  "BNB":   { type:"chain",     slug:"bsc",          name:"BNB Chain",    token:"BNB",   category:"L1 Chain",        geckoId:"binancecoin",      coinCapId:"binance-coin",     note:null },
  "ADA":   { type:"chain",     slug:"cardano",      name:"Cardano",      token:"ADA",   category:"L1 Chain",        geckoId:"cardano",          coinCapId:"cardano",          note:null },
  "SUI":   { type:"chain",     slug:"sui",          name:"Sui",          token:"SUI",   category:"L1 Chain",        geckoId:"sui",              coinCapId:"sui",              note:null },
  "NEAR":  { type:"chain",     slug:"near",         name:"NEAR",         token:"NEAR",  category:"L1 Chain",        geckoId:"near",             coinCapId:"near-protocol",    note:null },
  "APT":   { type:"chain",     slug:"aptos",        name:"Aptos",        token:"APT",   category:"L1 Chain",        geckoId:"aptos",            coinCapId:"aptos",            note:null },
  "SEI":   { type:"chain",     slug:"sei",          name:"Sei",          token:"SEI",   category:"L1 Chain",        geckoId:"sei-network",      coinCapId:"sei-network",      note:null },
  "TRX":   { type:"chain",     slug:"tron",         name:"Tron",         token:"TRX",   category:"L1 Chain",        geckoId:"tron",             coinCapId:"tron",             note:null },
  "HBAR":  { type:"chain",     slug:"hedera",       name:"Hedera",       token:"HBAR",  category:"L1 Chain",        geckoId:"hedera-hashgraph", coinCapId:"hedera-hashgraph", note:null },
  "XRP":   { type:"chain",     slug:"xrpl",         name:"XRP Ledger",   token:"XRP",   category:"Payment Network", geckoId:"ripple",           coinCapId:"xrp",              note:"Payment network — ultra-low fees by design. Value model is bridge currency adoption and token appreciation, not fee capture." },
  "HYPE":  { type:"protocol",  slug:"hyperliquid",  name:"Hyperliquid",  token:"HYPE",  category:"Perp DEX",        geckoId:"hyperliquid",      coinCapId:"hyperliquid",      note:null },
  "LINK":  { type:"fees-only", slug:"chainlink",    name:"Chainlink",    token:"LINK",  category:"Oracle",          geckoId:"chainlink",        coinCapId:"chainlink",        note:"Oracle infrastructure — no TVL. Revenue comes from data feed fees paid by protocols using Chainlink services." },
  "ONDO":  { type:"protocol",  slug:"ondo-finance", name:"Ondo Finance", token:"ONDO",  category:"RWA",             geckoId:"ondo-finance",     coinCapId:"ondo",             note:null },
  "MYX":   { type:"protocol",  slug:"myx-finance",  name:"MYX Finance",  token:"MYX",   category:"Perp DEX",        geckoId:"myx-finance",      coinCapId:"myx-finance",      note:null },
  "SYRUP": { type:"protocol",  slug:"maple-finance",name:"Maple/Syrup",  token:"SYRUP", category:"Lending",         geckoId:"maple",            coinCapId:"maple",            note:null },
  "W":     { type:"protocol",  slug:"wormhole",     name:"Wormhole",     token:"W",     category:"Bridge",          geckoId:"wormhole",         coinCapId:"wormhole",         note:null },
  "AXL":   { type:"protocol",  slug:"axelar",       name:"Axelar",       token:"AXL",   category:"Bridge",          geckoId:"axelar",           coinCapId:"axelar",           note:null },
};

// ── In-memory cache shared across warm Lambda invocations ────────────────────
let mcapCache     = {};
let mcapCacheTime = 0;
const MCAP_TTL    = 10 * 60 * 1000; // 10 minutes

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" },
      timeout: 9000,
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch(e) {
          resolve({ status: res.statusCode, data: null });
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

// ── MARKET CAP — batch CoinGecko, CoinCap fallback, cached ──────────────────
async function fetchAllMarketCaps() {
  const now = Date.now();
  if (now - mcapCacheTime < MCAP_TTL && Object.keys(mcapCache).length > 0) {
    return mcapCache;
  }

  const geckoIds = Object.values(PROTOCOL_SLUGS)
    .filter(p => p.geckoId).map(p => p.geckoId).join(",");

  // Single batch CoinGecko call
  try {
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${geckoIds}&vs_currencies=usd&include_market_cap=true&include_24hr_change=true`;
    const { status, data } = await fetchUrl(url);
    if (status === 200 && data && typeof data === "object") {
      const newCache = {};
      for (const [sym, proto] of Object.entries(PROTOCOL_SLUGS)) {
        const e = data[proto.geckoId];
        if (e?.usd_market_cap) {
          newCache[sym] = { mcap: e.usd_market_cap, price: e.usd, change24h: e.usd_24h_change, source: "coingecko" };
        }
      }
      if (Object.keys(newCache).length >= Object.keys(PROTOCOL_SLUGS).length / 2) {
        mcapCache = newCache;
        mcapCacheTime = now;
        return mcapCache;
      }
    }
  } catch(e) {}

  // CoinCap parallel fallback for anything missing
  const missing = Object.entries(PROTOCOL_SLUGS).filter(([sym]) => !mcapCache[sym] && PROTOCOL_SLUGS[sym].coinCapId);
  if (missing.length > 0) {
    const results = await Promise.allSettled(
      missing.map(async ([sym, proto]) => {
        const { status, data } = await fetchUrl(`https://rest.coincap.io/v3/assets/${proto.coinCapId}`);
        if (status === 200 && data?.data?.marketCapUsd) {
          return [sym, {
            mcap:      parseFloat(data.data.marketCapUsd)      || null,
            price:     parseFloat(data.data.priceUsd)          || null,
            change24h: parseFloat(data.data.changePercent24Hr) || null,
            source:    "coincap",
          }];
        }
        return null;
      })
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value) {
        mcapCache[r.value[0]] = r.value[1];
      }
    }
    mcapCacheTime = now;
  }

  return mcapCache;
}

// ── Extract last value from a DeFi Llama time series array ──────────────────
function lastVal(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const last = arr[arr.length - 1];
  // Handle both [timestamp, value] tuples and {date, value} objects
  if (Array.isArray(last)) return last[1] || null;
  return last.value || last.totalVolume || last.users || last.txs || null;
}

// ── Fetch DEX volume for a chain ─────────────────────────────────────────────
async function fetchDexVolume(chainSlug) {
  try {
    const url = `https://api.llama.fi/overview/dexs/${chainSlug}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyVolume`;
    const { status, data } = await fetchUrl(url);
    if (status === 200 && data) {
      return {
        dexVolume24h: data.total24h  || null,
        dexVolume7d:  data.total7d   || null,
        dexVolume30d: data.total30d  || null,
      };
    }
  } catch(e) {}
  return { dexVolume24h: null, dexVolume7d: null, dexVolume30d: null };
}

// ── Fetch active addresses for a chain from DeFi Llama ───────────────────────
// DeFi Llama exposes active addresses via their chain overview endpoint
async function fetchChainActivity(chainSlug) {
  try {
    const url = `https://api.llama.fi/overview/fees/${chainSlug}?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=true`;
    const { status, data } = await fetchUrl(url);
    if (status === 200 && data) {
      // active addresses and tx count live in the totalDataChart arrays
      // keyed by metric name in the breakdown
      return {
        activeAddresses24h: data.activeAddresses?.total24h || data.activeUsers?.total24h || null,
        txCount24h:         data.transactions?.total24h   || null,
      };
    }
  } catch(e) {}
  return { activeAddresses24h: null, txCount24h: null };
}

exports.handler = async (event) => {
  const symbol = event.queryStringParameters?.symbol;

  if (symbol && PROTOCOL_SLUGS[symbol]) {
    const proto = PROTOCOL_SLUGS[symbol];
    try {
      let result = { symbol, ...proto };

      // Market cap — batched and cached
      const allMcaps = await fetchAllMarketCaps();
      if (allMcaps[symbol]) Object.assign(result, allMcaps[symbol]);

      // ── FEES ONLY (Chainlink) ────────────────────────────────────────────
      if (proto.type === "fees-only") {
        try {
          const { data } = await fetchUrl(`https://api.llama.fi/summary/fees/${proto.slug}?dataType=dailyFees`);
          result.fees24h    = data?.total24h    || null;
          result.fees7d     = data?.total7d     || null;
          result.fees30d    = data?.total30d    || null;
          result.revenue24h = data?.revenue24h  || null;
          result.revenue30d = data?.revenue30d  || null;
        } catch(e) {}

      // ── CHAIN ────────────────────────────────────────────────────────────
      } else if (proto.type === "chain") {

        // TVL history
        try {
          const { data: tvlData } = await fetchUrl(`https://api.llama.fi/v2/historicalChainTvl/${proto.slug}`);
          if (Array.isArray(tvlData) && tvlData.length > 0) {
            const recent      = tvlData.slice(-31);
            result.tvl        = recent[recent.length - 1]?.tvl || null;
            result.tvl7dAgo   = recent[recent.length - 8]?.tvl || null;
            result.tvl30dAgo  = recent[0]?.tvl                 || null;
            result.tvlHistory = recent.map(d => d.tvl);
          }
        } catch(e) {}

        // Fees + revenue + active addresses in one call
        try {
          const { data } = await fetchUrl(
            `https://api.llama.fi/overview/fees/${proto.slug}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`
          );
          result.fees24h         = data?.total24h         || null;
          result.fees7d          = data?.total7d           || null;
          result.fees30d         = data?.total30d          || null;
          result.revenue24h      = data?.revenue24h        || null;
          result.revenue30d      = data?.revenue30d        || null;
          result.activeAddrs24h  = data?.activeAddresses?.total24h
                                || data?.activeUsers?.total24h
                                || null;
        } catch(e) {}

        // DEX volume — separate endpoint
        const dex = await fetchDexVolume(proto.slug);
        Object.assign(result, dex);

      // ── PROTOCOL ─────────────────────────────────────────────────────────
      } else {
        const [protoRes, feesRes, dexRes] = await Promise.allSettled([
          fetchUrl(`https://api.llama.fi/protocol/${proto.slug}`),
          fetchUrl(`https://api.llama.fi/summary/fees/${proto.slug}?dataType=dailyFees`),
          fetchUrl(`https://api.llama.fi/summary/dexs/${proto.slug}?dataType=dailyVolume`),
        ]);

        const protoData = protoRes.status === "fulfilled" ? protoRes.value?.data : null;
        const feesData  = feesRes.status  === "fulfilled" ? feesRes.value?.data  : null;
        const dexData   = dexRes.status   === "fulfilled" ? dexRes.value?.data   : null;

        // mcap fallback from DeFi Llama
        if (!result.mcap && protoData?.mcap) result.mcap = protoData.mcap;

        // TVL history
        if (protoData?.tvl && Array.isArray(protoData.tvl)) {
          const recent      = protoData.tvl.slice(-31);
          result.tvl        = recent[recent.length - 1]?.totalLiquidityUSD || null;
          result.tvl7dAgo   = recent[recent.length - 8]?.totalLiquidityUSD || null;
          result.tvl30dAgo  = recent[0]?.totalLiquidityUSD                 || null;
          result.tvlHistory = recent.map(d => d.totalLiquidityUSD);
        } else {
          result.tvl = protoData?.tvl || null;
        }

        if (feesData) {
          result.fees24h    = feesData.total24h    || null;
          result.fees7d     = feesData.total7d     || null;
          result.fees30d    = feesData.total30d    || null;
          result.revenue24h = feesData.revenue24h  || null;
          result.revenue30d = feesData.revenue30d  || null;
        }

        if (dexData) {
          result.dexVolume24h = dexData.total24h || null;
          result.dexVolume7d  = dexData.total7d  || null;
        }
      }

      // MC/TVL ratio
      if (result.mcap && result.tvl && result.tvl > 0) {
        result.mcTvlRatio = parseFloat((result.mcap / result.tvl).toFixed(2));
      }

      return {
        statusCode: 200,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        body: JSON.stringify(result),
      };

    } catch(e) {
      return {
        statusCode: 500,
        headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
        body: JSON.stringify({ error: e.message, symbol }),
      };
    }
  }

  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    body: JSON.stringify(Object.entries(PROTOCOL_SLUGS).map(([sym, p]) => ({ symbol: sym, ...p }))),
  };
};

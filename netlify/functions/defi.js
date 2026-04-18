const https = require("https");

// DeFi Llama protocol slugs
const PROTOCOL_SLUGS = {
  "ETH":   { type:"chain",     slug:"ethereum",      name:"Ethereum",     token:"ETH",   category:"L1 Chain",  geckoId:"ethereum",       note:null },
  "SOL":   { type:"chain",     slug:"solana",         name:"Solana",       token:"SOL",   category:"L1 Chain",  geckoId:"solana",          note:null },
  "AVAX":  { type:"chain",     slug:"avalanche",      name:"Avalanche",    token:"AVAX",  category:"L1 Chain",  geckoId:"avalanche-2",     note:null },
  "BNB":   { type:"chain",     slug:"bsc",            name:"BNB Chain",    token:"BNB",   category:"L1 Chain",  geckoId:"binancecoin",     note:null },
  "DOT":   { type:"chain",     slug:"Polkadot",       name:"Polkadot",     token:"DOT",   category:"L1 Chain",  geckoId:"polkadot",        note:null },
  "ADA":   { type:"chain",     slug:"cardano",        name:"Cardano",      token:"ADA",   category:"L1 Chain",  geckoId:"cardano",         note:null },
  "SUI":   { type:"chain",     slug:"sui",            name:"Sui",          token:"SUI",   category:"L1 Chain",  geckoId:"sui",             note:null },
  "NEAR":  { type:"chain",     slug:"near",           name:"NEAR",         token:"NEAR",  category:"L1 Chain",  geckoId:"near",            note:null },
  "APT":   { type:"chain",     slug:"aptos",          name:"Aptos",        token:"APT",   category:"L1 Chain",  geckoId:"aptos",           note:null },
  "SEI":   { type:"chain",     slug:"sei",            name:"Sei",          token:"SEI",   category:"L1 Chain",  geckoId:"sei-network",     note:null },
  "TRX":   { type:"chain",     slug:"tron",           name:"Tron",         token:"TRX",   category:"L1 Chain",  geckoId:"tron",            note:null },
  "HBAR":  { type:"chain",     slug:"hedera",         name:"Hedera",       token:"HBAR",  category:"L1 Chain",  geckoId:"hedera-hashgraph",note:null },
  "XRP":   { type:"chain",     slug:"xrpl",           name:"XRP Ledger",   token:"XRP",   category:"Payment Network", geckoId:"ripple",   note:"Payment network — ultra-low fees by design. Value model is bridge currency adoption and token appreciation, not fee capture." },
  "ALGO":  { type:"chain",     slug:"algorand",       name:"Algorand",     token:"ALGO",  category:"L1 Chain",  geckoId:"algorand",        note:null },
  "HYPE":  { type:"protocol",  slug:"hyperliquid",    name:"Hyperliquid",  token:"HYPE",  category:"Perp DEX",  geckoId:"hyperliquid",     note:null },
  "LINK":  { type:"fees-only", slug:"chainlink",      name:"Chainlink",    token:"LINK",  category:"Oracle",    geckoId:"chainlink",       note:"Oracle infrastructure — no TVL. Revenue comes from data feed fees paid by protocols using Chainlink services." },
  "ONDO":  { type:"protocol",  slug:"ondo-finance",   name:"Ondo Finance", token:"ONDO",  category:"RWA",       geckoId:"ondo-finance",    note:null },
  "MYX":   { type:"protocol",  slug:"myx-finance",    name:"MYX Finance",  token:"MYX",   category:"Perp DEX",  geckoId:"myx-finance",     note:null },
  "SYRUP": { type:"protocol",  slug:"maple-finance",  name:"Maple/Syrup",  token:"SYRUP", category:"Lending",   geckoId:"maple",           note:null },
  "W":     { type:"protocol",  slug:"wormhole",       name:"Wormhole",     token:"W",     category:"Bridge",    geckoId:"wormhole",        note:null },
  "AXL":   { type:"protocol",  slug:"axelar",         name:"Axelar",       token:"AXL",   category:"Bridge",    geckoId:"axelar",          note:null },
};

// CoinGecko IDs for batch market cap fetch
const GECKO_IDS = Object.values(PROTOCOL_SLUGS)
  .filter(p => p.geckoId)
  .map(p => p.geckoId);

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept":     "application/json",
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error("Parse error: " + data.slice(0, 100))); }
      });
    }).on("error", reject);
  });
}

// Fetch market caps for all tokens in one CoinGecko call
async function fetchMarketCaps() {
  const ids = GECKO_IDS.join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_market_cap=true&include_24hr_change=true`;
  try {
    const data = await fetchUrl(url);
    // Build symbol -> mcap map
    const mcapMap = {};
    for (const [sym, proto] of Object.entries(PROTOCOL_SLUGS)) {
      if (proto.geckoId && data[proto.geckoId]) {
        mcapMap[sym] = {
          mcap:      data[proto.geckoId].usd_market_cap || null,
          price:     data[proto.geckoId].usd            || null,
          change24h: data[proto.geckoId].usd_24h_change || null,
        };
      }
    }
    return mcapMap;
  } catch(e) {
    return {};
  }
}

exports.handler = async (event) => {
  const symbol = event.queryStringParameters?.symbol;

  if (symbol && PROTOCOL_SLUGS[symbol]) {
    const proto = PROTOCOL_SLUGS[symbol];
    try {
      let result = { symbol, ...proto };

      // Fetch market cap from CoinGecko
      if (proto.geckoId) {
        try {
          const cgUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${proto.geckoId}&vs_currencies=usd&include_market_cap=true&include_24hr_change=true`;
          const cgData = await fetchUrl(cgUrl);
          if (cgData[proto.geckoId]) {
            result.mcap      = cgData[proto.geckoId].usd_market_cap  || null;
            result.price     = cgData[proto.geckoId].usd             || null;
            result.change24h = cgData[proto.geckoId].usd_24h_change  || null;
          }
        } catch(e) {
          result.mcap = null;
        }
      }

      // ── FEES ONLY (Chainlink) ──
      if (proto.type === "fees-only") {
        try {
          const feesData = await fetchUrl(`https://api.llama.fi/summary/fees/${proto.slug}?dataType=dailyFees`);
          result.fees24h    = feesData.total24h    || null;
          result.fees7d     = feesData.total7d     || null;
          result.fees30d    = feesData.total30d    || null;
          result.revenue24h = feesData.revenue24h  || null;
          result.revenue30d = feesData.revenue30d  || null;
          result.tvl        = null;
          result.tvlHistory = null;
        } catch(e) {
          result.fees24h = null;
        }

      // ── CHAIN ──
      } else if (proto.type === "chain") {
        const tvlData = await fetchUrl(`https://api.llama.fi/v2/historicalChainTvl/${proto.slug}`);
        if (Array.isArray(tvlData) && tvlData.length > 0) {
          const recent        = tvlData.slice(-31);
          result.tvl          = recent[recent.length - 1]?.tvl || null;
          result.tvl7dAgo     = recent[recent.length - 8]?.tvl || null;
          result.tvl30dAgo    = recent[0]?.tvl                 || null;
          result.tvlHistory   = recent.map(d => d.tvl);
        }
        try {
          const feesData = await fetchUrl(`https://api.llama.fi/overview/fees/${proto.slug}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`);
          result.fees24h    = feesData?.total24h    || null;
          result.fees7d     = feesData?.total7d     || null;
          result.fees30d    = feesData?.total30d    || null;
          result.revenue24h = feesData?.revenue24h  || null;
          result.revenue30d = feesData?.revenue30d  || null;
        } catch(e) {
          result.fees24h = null;
        }

      // ── PROTOCOL ──
      } else {
        const [protoData, feesData] = await Promise.all([
          fetchUrl(`https://api.llama.fi/protocol/${proto.slug}`),
          fetchUrl(`https://api.llama.fi/summary/fees/${proto.slug}?dataType=dailyFees`).catch(() => null),
        ]);
        // Override mcap from DeFi Llama if CoinGecko didn't return it
        if (!result.mcap && protoData?.mcap) result.mcap = protoData.mcap;
        result.tvl = protoData?.tvl || null;
        if (protoData?.tvl && Array.isArray(protoData.tvl)) {
          const recent        = protoData.tvl.slice(-31);
          result.tvl          = recent[recent.length - 1]?.totalLiquidityUSD || result.tvl;
          result.tvl7dAgo     = recent[recent.length - 8]?.totalLiquidityUSD || null;
          result.tvl30dAgo    = recent[0]?.totalLiquidityUSD                 || null;
          result.tvlHistory   = recent.map(d => d.totalLiquidityUSD);
        }
        if (feesData) {
          result.fees24h    = feesData.total24h    || null;
          result.fees7d     = feesData.total7d     || null;
          result.fees30d    = feesData.total30d    || null;
          result.revenue24h = feesData.revenue24h  || null;
          result.revenue30d = feesData.revenue30d  || null;
        }
      }

      // Calculate MC/TVL ratio
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

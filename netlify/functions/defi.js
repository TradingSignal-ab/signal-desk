const https = require("https");

const PROTOCOL_SLUGS = {
  // ── L1 Chains ──
  "ETH":   { type:"chain",     slug:"ethereum",     name:"Ethereum",     token:"ETH",   category:"L1 Chain",       geckoId:"ethereum",        coinCapId:"ethereum",        note:null },
  "SOL":   { type:"chain",     slug:"solana",       name:"Solana",       token:"SOL",   category:"L1 Chain",       geckoId:"solana",           coinCapId:"solana",           note:null },
  "AVAX":  { type:"chain",     slug:"avalanche",    name:"Avalanche",    token:"AVAX",  category:"L1 Chain",       geckoId:"avalanche-2",      coinCapId:"avalanche",        note:null },
  "BNB":   { type:"chain",     slug:"bsc",          name:"BNB Chain",    token:"BNB",   category:"L1 Chain",       geckoId:"binancecoin",      coinCapId:"binance-coin",     note:null },
  "ADA":   { type:"chain",     slug:"cardano",      name:"Cardano",      token:"ADA",   category:"L1 Chain",       geckoId:"cardano",          coinCapId:"cardano",          note:null },
  "SUI":   { type:"chain",     slug:"sui",          name:"Sui",          token:"SUI",   category:"L1 Chain",       geckoId:"sui",              coinCapId:"sui",              note:null },
  "NEAR":  { type:"chain",     slug:"near",         name:"NEAR",         token:"NEAR",  category:"L1 Chain",       geckoId:"near",             coinCapId:"near-protocol",    note:null },
  "APT":   { type:"chain",     slug:"aptos",        name:"Aptos",        token:"APT",   category:"L1 Chain",       geckoId:"aptos",            coinCapId:"aptos",            note:null },
  "SEI":   { type:"chain",     slug:"sei",          name:"Sei",          token:"SEI",   category:"L1 Chain",       geckoId:"sei-network",      coinCapId:"sei-network",      note:null },
  "TRX":   { type:"chain",     slug:"tron",         name:"Tron",         token:"TRX",   category:"L1 Chain",       geckoId:"tron",             coinCapId:"tron",             note:null },
  "HBAR":  { type:"chain",     slug:"hedera",       name:"Hedera",       token:"HBAR",  category:"L1 Chain",       geckoId:"hedera-hashgraph", coinCapId:"hedera-hashgraph", note:null },
  "XRP":   { type:"chain",     slug:"xrpl",         name:"XRP Ledger",   token:"XRP",   category:"Payment Network",geckoId:"ripple",           coinCapId:"xrp",              note:"Payment network — ultra-low fees by design. Value model is bridge currency adoption and token appreciation, not fee capture." },
  // ── DeFi Protocols ──
  "HYPE":  { type:"protocol",  slug:"hyperliquid",  name:"Hyperliquid",  token:"HYPE",  category:"Perp DEX",       geckoId:"hyperliquid",      coinCapId:"hyperliquid",      note:null },
  "LINK":  { type:"fees-only", slug:"chainlink",    name:"Chainlink",    token:"LINK",  category:"Oracle",         geckoId:"chainlink",        coinCapId:"chainlink",        note:"Oracle infrastructure — no TVL. Revenue comes from data feed fees paid by protocols using Chainlink services." },
  "ONDO":  { type:"protocol",  slug:"ondo-finance", name:"Ondo Finance", token:"ONDO",  category:"RWA",            geckoId:"ondo-finance",     coinCapId:"ondo",             note:null },
  "MYX":   { type:"protocol",  slug:"myx-finance",  name:"MYX Finance",  token:"MYX",   category:"Perp DEX",       geckoId:"myx-finance",      coinCapId:"myx-finance",      note:null },
  "SYRUP": { type:"protocol",  slug:"maple-finance",name:"Maple/Syrup",  token:"SYRUP", category:"Lending",        geckoId:"maple",            coinCapId:"maple",            note:null },
  "W":     { type:"protocol",  slug:"wormhole",     name:"Wormhole",     token:"W",     category:"Bridge",         geckoId:"wormhole",         coinCapId:"wormhole",         note:null },
  "AXL":   { type:"protocol",  slug:"axelar",       name:"Axelar",       token:"AXL",   category:"Bridge",         geckoId:"axelar",           coinCapId:"axelar",           note:null },
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { reject(new Error(`Parse error: ${data.slice(0,100)}`)); }
      });
    }).on("error", reject);
  });
}

// Try CoinGecko first, fall back to CoinCap
async function fetchMarketCap(proto) {
  // ── Try CoinGecko ──
  if (proto.geckoId) {
    try {
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${proto.geckoId}&vs_currencies=usd&include_market_cap=true&include_24hr_change=true`;
      const { status, data } = await fetchUrl(url);
      if (status === 200 && data[proto.geckoId]?.usd_market_cap) {
        return {
          mcap:      data[proto.geckoId].usd_market_cap  || null,
          price:     data[proto.geckoId].usd             || null,
          change24h: data[proto.geckoId].usd_24h_change  || null,
          mcapSource:"coingecko",
        };
      }
    } catch(e) { /* fall through to CoinCap */ }
  }

  // ── Fall back to CoinCap ──
  if (proto.coinCapId) {
    try {
      const url = `https://rest.coincap.io/v3/assets/${proto.coinCapId}`;
      const { status, data } = await fetchUrl(url);
      if (status === 200 && data?.data?.marketCapUsd) {
        return {
          mcap:      parseFloat(data.data.marketCapUsd)         || null,
          price:     parseFloat(data.data.priceUsd)             || null,
          change24h: parseFloat(data.data.changePercent24Hr)    || null,
          mcapSource:"coincap",
        };
      }
    } catch(e) { /* both failed */ }
  }

  return { mcap: null, price: null, change24h: null, mcapSource: null };
}

exports.handler = async (event) => {
  const symbol = event.queryStringParameters?.symbol;

  if (symbol && PROTOCOL_SLUGS[symbol]) {
    const proto = PROTOCOL_SLUGS[symbol];
    try {
      let result = { symbol, ...proto };

      // Fetch market cap — CoinGecko with CoinCap fallback
      const mcapData = await fetchMarketCap(proto);
      Object.assign(result, mcapData);

      // ── FEES ONLY (Chainlink) ──
      if (proto.type === "fees-only") {
        try {
          const { data: feesData } = await fetchUrl(`https://api.llama.fi/summary/fees/${proto.slug}?dataType=dailyFees`);
          result.fees24h    = feesData.total24h    || null;
          result.fees7d     = feesData.total7d     || null;
          result.fees30d    = feesData.total30d    || null;
          result.revenue24h = feesData.revenue24h  || null;
          result.revenue30d = feesData.revenue30d  || null;
          result.tvl        = null;
          result.tvlHistory = null;
        } catch(e) { result.fees24h = null; }

      // ── CHAIN ──
      } else if (proto.type === "chain") {
        try {
          const { data: tvlData } = await fetchUrl(`https://api.llama.fi/v2/historicalChainTvl/${proto.slug}`);
          if (Array.isArray(tvlData) && tvlData.length > 0) {
            const recent      = tvlData.slice(-31);
            result.tvl        = recent[recent.length - 1]?.tvl || null;
            result.tvl7dAgo   = recent[recent.length - 8]?.tvl || null;
            result.tvl30dAgo  = recent[0]?.tvl                 || null;
            result.tvlHistory = recent.map(d => d.tvl);
          }
        } catch(e) { result.tvl = null; }

        try {
          const { data: feesData } = await fetchUrl(`https://api.llama.fi/overview/fees/${proto.slug}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`);
          result.fees24h    = feesData?.total24h    || null;
          result.fees7d     = feesData?.total7d     || null;
          result.fees30d    = feesData?.total30d    || null;
          result.revenue24h = feesData?.revenue24h  || null;
          result.revenue30d = feesData?.revenue30d  || null;
        } catch(e) { result.fees24h = null; }

      // ── PROTOCOL ──
      } else {
        const [protoRes, feesRes] = await Promise.all([
          fetchUrl(`https://api.llama.fi/protocol/${proto.slug}`),
          fetchUrl(`https://api.llama.fi/summary/fees/${proto.slug}?dataType=dailyFees`).catch(() => null),
        ]);

        const protoData = protoRes?.data;
        const feesData  = feesRes?.data;

        if (!result.mcap && protoData?.mcap) result.mcap = protoData.mcap;
        result.tvl = protoData?.tvl || null;

        if (protoData?.tvl && Array.isArray(protoData.tvl)) {
          const recent      = protoData.tvl.slice(-31);
          result.tvl        = recent[recent.length - 1]?.totalLiquidityUSD || result.tvl;
          result.tvl7dAgo   = recent[recent.length - 8]?.totalLiquidityUSD || null;
          result.tvl30dAgo  = recent[0]?.totalLiquidityUSD                 || null;
          result.tvlHistory = recent.map(d => d.totalLiquidityUSD);
        }

        if (feesData) {
          result.fees24h    = feesData.total24h    || null;
          result.fees7d     = feesData.total7d     || null;
          result.fees30d    = feesData.total30d    || null;
          result.revenue24h = feesData.revenue24h  || null;
          result.revenue30d = feesData.revenue30d  || null;
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

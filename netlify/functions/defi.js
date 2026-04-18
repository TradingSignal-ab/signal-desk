const https = require("https");

// DeFi Llama protocol slugs — these are the exact slugs used in the API
const PROTOCOL_SLUGS = {
  // Chains — use chain TVL endpoint
  "ETH":   { type:"chain",    slug:"ethereum",     name:"Ethereum",     token:"ETH",  category:"L1 Chain" },
  "SOL":   { type:"chain",    slug:"solana",        name:"Solana",       token:"SOL",  category:"L1 Chain" },
  "AVAX":  { type:"chain",    slug:"avalanche",     name:"Avalanche",    token:"AVAX", category:"L1 Chain" },
  "BNB":   { type:"chain",    slug:"bsc",           name:"BNB Chain",    token:"BNB",  category:"L1 Chain" },
  "DOT":   { type:"chain",    slug:"polkadot",      name:"Polkadot",     token:"DOT",  category:"L1 Chain" },
  "ADA":   { type:"chain",    slug:"cardano",       name:"Cardano",      token:"ADA",  category:"L1 Chain" },
  "SUI":   { type:"chain",    slug:"sui",           name:"Sui",          token:"SUI",  category:"L1 Chain" },
  "NEAR":  { type:"chain",    slug:"near",          name:"NEAR",         token:"NEAR", category:"L1 Chain" },
  "APT":   { type:"chain",    slug:"aptos",         name:"Aptos",        token:"APT",  category:"L1 Chain" },
  "SEI":   { type:"chain",    slug:"sei",           name:"Sei",          token:"SEI",  category:"L1 Chain" },
  "TRX":   { type:"chain",    slug:"tron",          name:"Tron",         token:"TRX",  category:"L1 Chain" },
  "HBAR":  { type:"chain",    slug:"hedera",        name:"Hedera",       token:"HBAR", category:"L1 Chain" },
  "XRP":   { type:"chain",    slug:"xrpl",          name:"XRP Ledger",   token:"XRP",  category:"L1 Chain" },
  "ALGO":  { type:"chain",    slug:"algorand",      name:"Algorand",     token:"ALGO", category:"L1 Chain" },
  // Protocols — use protocol endpoint
  "HYPE":  { type:"protocol", slug:"hyperliquid",          name:"Hyperliquid",  token:"HYPE", category:"Perp DEX"  },
  "LINK":  { type:"protocol", slug:"chainlink",            name:"Chainlink",    token:"LINK", category:"Oracle"    },
  "ONDO":  { type:"protocol", slug:"ondo-finance",         name:"Ondo Finance", token:"ONDO", category:"RWA"       },
  "MYX":   { type:"protocol", slug:"myx-finance",          name:"MYX Finance",  token:"MYX",  category:"Perp DEX"  },
  "SYRUP": { type:"protocol", slug:"syrup-finance",        name:"Syrup",        token:"SYRUP",category:"Lending"   },
  "W":     { type:"protocol", slug:"wormhole",             name:"Wormhole",     token:"W",    category:"Bridge"    },
  "AXL":   { type:"protocol", slug:"axelar",               name:"Axelar",       token:"AXL",  category:"Bridge"    },
};

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      }
    }, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error("Parse error")); }
      });
    }).on("error", reject);
  });
}

exports.handler = async (event) => {
  const symbol = event.queryStringParameters?.symbol;

  // If specific symbol requested
  if (symbol && PROTOCOL_SLUGS[symbol]) {
    const proto = PROTOCOL_SLUGS[symbol];
    try {
      let result = { symbol, ...proto };

      if (proto.type === "chain") {
        // Get chain TVL
        const tvlData = await fetchUrl(`https://api.llama.fi/v2/historicalChainTvl/${proto.slug}`);
        if (Array.isArray(tvlData) && tvlData.length > 0) {
          const recent = tvlData.slice(-31);
          result.tvl = recent[recent.length - 1]?.tvl || null;
          result.tvl7dAgo = recent[recent.length - 8]?.tvl || null;
          result.tvl30dAgo = recent[0]?.tvl || null;
          result.tvlHistory = recent.map(d => d.tvl);
        }
        // Get chain fees/revenue if available
        try {
          const feesData = await fetchUrl(`https://api.llama.fi/overview/fees/${proto.slug}?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true`);
          result.fees24h = feesData?.total24h || null;
          result.fees7d  = feesData?.total7d  || null;
          result.fees30d = feesData?.total30d  || null;
          result.revenue24h = feesData?.revenue24h || null;
          result.revenue30d = feesData?.revenue30d || null;
        } catch(e) {
          result.fees24h = null;
        }
      } else {
        // Protocol TVL + fees
        const [protoData, feesData] = await Promise.all([
          fetchUrl(`https://api.llama.fi/protocol/${proto.slug}`),
          fetchUrl(`https://api.llama.fi/summary/fees/${proto.slug}?dataType=dailyFees`).catch(() => null),
        ]);
        result.tvl = protoData?.tvl || null;
        result.mcap = protoData?.mcap || null;
        // Get TVL history
        if (protoData?.chainTvls) {
          const allTvl = protoData.tvl;
          if (Array.isArray(allTvl)) {
            const recent = allTvl.slice(-31);
            result.tvl = recent[recent.length - 1]?.totalLiquidityUSD || result.tvl;
            result.tvl7dAgo  = recent[recent.length - 8]?.totalLiquidityUSD || null;
            result.tvl30dAgo = recent[0]?.totalLiquidityUSD || null;
            result.tvlHistory = recent.map(d => d.totalLiquidityUSD);
          }
        }
        if (feesData) {
          result.fees24h    = feesData.total24h    || null;
          result.fees7d     = feesData.total7d     || null;
          result.fees30d    = feesData.total30d    || null;
          result.revenue24h = feesData.revenue24h  || null;
          result.revenue30d = feesData.revenue30d  || null;
        }
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

  // No symbol — return the full protocol list
  return {
    statusCode: 200,
    headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    body: JSON.stringify(Object.entries(PROTOCOL_SLUGS).map(([sym, p]) => ({ symbol: sym, ...p }))),
  };
};

const https = require("https");

exports.handler = async (event) => {
  const symbol = event.queryStringParameters?.symbol;
  if (!symbol) return { statusCode: 400, body: "Missing symbol" };

  const options = {
    hostname: "query2.finance.yahoo.com",
    path: `/v8/finance/chart/${symbol}?range=1y&interval=1d&includePrePost=false`,
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "identity",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Cache-Control": "max-age=0",
      "Referer": "https://finance.yahoo.com",
    },
  };

  return new Promise((resolve) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({
            statusCode: 200,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": "application/json",
            },
            body: JSON.stringify(parsed),
          });
        } catch(e) {
          resolve({
            statusCode: 502,
            body: JSON.stringify({ error: "Parse failed", raw: data.slice(0, 300) }),
          });
        }
      });
    });
    req.on("error", (e) => {
      resolve({ statusCode: 500, body: JSON.stringify({ error: e.message }) });
    });
    req.end();
  });
};

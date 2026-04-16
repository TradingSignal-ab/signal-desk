import { useState, useEffect, useRef, useCallback } from "react";

const C = {
  bg:"#050a05",bgCard:"#080f08",bgDeep:"#040804",
  green:"#00ff41",greenDim:"#00cc33",
  red:"#ff2244",yellow:"#ffe500",
  white:"#e8ffe8",grey:"#7aab7a",greyDim:"#3a5a3a",
  border:"#0f2a0f",borderBright:"#1a4a1a",
};

const SECTORS = [
  { label:"ETFs & Macro", icon:"◈", tickers:[
    { symbol:"SPY",  yahooSymbol:"SPY",     type:"etf",    label:"S&P 500 ETF" },
    { symbol:"QQQ",  yahooSymbol:"QQQ",     type:"etf",    label:"NASDAQ ETF" },
  ]},
  { label:"Mega Cap Tech", icon:"◈", tickers:[
    { symbol:"MSFT", yahooSymbol:"MSFT",    type:"stock",  label:"Microsoft" },
    { symbol:"NVDA", yahooSymbol:"NVDA",    type:"stock",  label:"NVIDIA" },
    { symbol:"META", yahooSymbol:"META",    type:"stock",  label:"Meta" },
    { symbol:"AMZN", yahooSymbol:"AMZN",    type:"stock",  label:"Amazon" },
    { symbol:"GOOGL",yahooSymbol:"GOOGL",   type:"stock",  label:"Alphabet" },
    { symbol:"TSLA", yahooSymbol:"TSLA",    type:"stock",  label:"Tesla" },
    { symbol:"NOW",  yahooSymbol:"NOW",     type:"stock",  label:"ServiceNow" },
    { symbol:"DUOL", yahooSymbol:"DUOL",    type:"stock",  label:"Duolingo" },
  ]},
  { label:"Semiconductors", icon:"◈", tickers:[
    { symbol:"MU",   yahooSymbol:"MU",      type:"stock",  label:"Micron" },
    { symbol:"SNDK", yahooSymbol:"SNDK",    type:"stock",  label:"SanDisk" },
    { symbol:"AVGO", yahooSymbol:"AVGO",    type:"stock",  label:"Broadcom" },
  ]},
  { label:"Quantum & Space", icon:"◈", tickers:[
    { symbol:"IONQ", yahooSymbol:"IONQ",    type:"stock",  label:"IonQ" },
    { symbol:"RGTI", yahooSymbol:"RGTI",    type:"stock",  label:"Rigetti" },
    { symbol:"NBIS", yahooSymbol:"NBIS",    type:"stock",  label:"Nebius" },
    { symbol:"RKLB", yahooSymbol:"RKLB",    type:"stock",  label:"Rocket Lab" },
    { symbol:"PLTR", yahooSymbol:"PLTR",    type:"stock",  label:"Palantir" },
    { symbol:"MNTS", yahooSymbol:"MNTS",    type:"stock",  label:"Momentus" },
  ]},
  { label:"Biotech & Health", icon:"◈", tickers:[
    { symbol:"HIMS", yahooSymbol:"HIMS",    type:"stock",  label:"Hims & Hers" },
  ]},
  { label:"Fintech", icon:"◈", tickers:[
    { symbol:"COIN", yahooSymbol:"COIN",    type:"stock",  label:"Coinbase" },
    { symbol:"HOOD", yahooSymbol:"HOOD",    type:"stock",  label:"Robinhood" },
    { symbol:"SOFI", yahooSymbol:"SOFI",    type:"stock",  label:"SoFi" },
    { symbol:"IREN", yahooSymbol:"IREN",    type:"stock",  label:"IREN (Crypto Mining)" },
  ]},
  { label:"🇨🇦 Canada", icon:"◈", tickers:[
    { symbol:"DOL",  yahooSymbol:"DOL.TO",  type:"stock",  label:"Dollarama (TSX)" },
  ]},
  { label:"Crypto", icon:"◈", tickers:[
    { symbol:"BTC",  yahooSymbol:"BTC-USD", type:"crypto", label:"Bitcoin" },
    { symbol:"ETH",  yahooSymbol:"ETH-USD", type:"crypto", label:"Ethereum" },
    { symbol:"SOL",  yahooSymbol:"SOL-USD", type:"crypto", label:"Solana" },
    { symbol:"XRP",  yahooSymbol:"XRP-USD", type:"crypto", label:"XRP" },
  ]},
];

const ALL_TICKERS = SECTORS.flatMap(s => s.tickers);
const EMA_PERIODS = [5, 13, 21, 34, 50];

// ── MATH ──────────────────────────────────────────────────────────────────────
function calcEMA(prices, period) {
  if (!prices || prices.length < period) return null;
  const k = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < prices.length; i++) ema = prices[i] * k + ema * (1 - k);
  return ema;
}

function calcRSI(prices, period = 14) {
  if (!prices || prices.length < period + 1) return null;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = prices[i] - prices[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  let ag = gains / period, al = losses / period;
  for (let i = period + 1; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    ag = (ag * (period - 1) + Math.max(d, 0)) / period;
    al = (al * (period - 1) + Math.max(-d, 0)) / period;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

function calcMACDCustom(prices, fast, slow, sig) {
  if (!prices || prices.length < slow + sig) return { macd:null, signal:null, hist:null };
  const ef = calcEMA(prices, fast), es = calcEMA(prices, slow);
  if (!ef || !es) return { macd:null, signal:null, hist:null };
  const macdVal = ef - es;
  const series = [];
  for (let i = slow; i <= prices.length; i++) {
    const a = calcEMA(prices.slice(0, i), fast);
    const b = calcEMA(prices.slice(0, i), slow);
    if (a && b) series.push(a - b);
  }
  const sigVal = series.length >= sig ? calcEMA(series, sig) : null;
  return { macd:macdVal, signal:sigVal, hist:sigVal !== null ? macdVal - sigVal : null };
}

function calcWeeklyMACD(dailyPrices) {
  if (!dailyPrices || dailyPrices.length < 7) return { macd:null, signal:null, hist:null, riskOn:null };
  const weekly = [];
  for (let i = 4; i < dailyPrices.length; i += 5) weekly.push(dailyPrices[i]);
  if (weekly.length < 22) return { macd:null, signal:null, hist:null, riskOn:null };
  const r = calcMACDCustom(weekly, 6, 20, 9);
  return { ...r, riskOn: r.macd !== null && r.signal !== null ? r.macd > r.signal : null };
}

function getSignal(price, emas, rsi, change, macd, wm) {
  if (!price || !emas || emas.length < 3) return { label:"SCANNING", color:C.greyDim, score:0 };
  const [e5, e13, e21] = emas;
  let s = 0;
  if (e5  && e13) (e5  > e13 ? s++ : s--);
  if (e13 && e21) (e13 > e21 ? s++ : s--);
  if (rsi != null) {
    if (rsi < 35) s += 2; else if (rsi > 65) s -= 2;
    else s += rsi < 50 ? 0.5 : -0.5;
  }
  if (change > 0.5) s++; else if (change < -0.5) s--;
  if (macd?.hist != null) s += macd.hist > 0 ? 0.5 : -0.5;
  if (wm?.riskOn === true) s++; else if (wm?.riskOn === false) s--;
  if (s >= 2.5)  return { label:"STRONG BUY",  color:C.green,    score:s };
  if (s >= 1)    return { label:"BUY",          color:C.greenDim, score:s };
  if (s >= -1)   return { label:"NEUTRAL",      color:C.yellow,   score:s };
  if (s >= -2.5) return { label:"SELL",         color:"#ff6644",  score:s };
  return               { label:"STRONG SELL",  color:C.red,      score:s };
}

function isTradingWindow() {
  const now = new Date();
  const mst = (now.getUTCHours() - 6) * 60 + now.getUTCMinutes();
  return mst >= 720 && mst <= 900;
}

function fmt(p, type) {
  if (!p) return "---";
  if (type === "crypto") return p > 1000 ? `$${p.toLocaleString("en-US",{maximumFractionDigits:0})}` : `$${p.toFixed(4)}`;
  return `$${p.toFixed(2)}`;
}

function fmtEMA(e, type) {
  if (!e) return "---";
  if (type === "crypto") return e > 1000 ? `$${e.toLocaleString("en-US",{maximumFractionDigits:0})}` : `$${e.toFixed(3)}`;
  return `$${e.toFixed(2)}`;
}

function getMockData(symbol) {
  const bases = {
    SPY:532,QQQ:448,BTC:83200,ETH:3180,SOL:142,XRP:0.52,
    NVDA:875,MSFT:415,META:512,AMZN:188,GOOGL:172,NOW:780,DUOL:220,
    IONQ:8.4,RGTI:1.2,NBIS:14,RKLB:22,PLTR:24,
    HIMS:12,COIN:215,HOOD:18,SOFI:9,
  };
  const base = bases[symbol] || 10;
  const n = () => (Math.random() - 0.5) * base * 0.003;
  const prices = Array.from({length:260}, (_,i) => Math.max(0.01, base + Math.sin(i/9)*base*0.025 + n()*i*0.005));
  const volumes = Array.from({length:30}, () => Math.floor(Math.random()*5e6+5e5));
  return { price:prices[prices.length-1], prices, volumes, change:(Math.random()-0.48)*3 };
}

function getAlerts(symbol, price, rsi, macd, wm, change, emas, ema200) {
  const a = [];
  if (rsi != null) {
    if (rsi < 30)      a.push({ msg:`RSI ${rsi.toFixed(0)} — DEEPLY OVERSOLD`,      color:C.green,    p:1 });
    else if (rsi < 38) a.push({ msg:`RSI ${rsi.toFixed(0)} — APPROACHING OVERSOLD`, color:C.greenDim, p:2 });
    else if (rsi > 72) a.push({ msg:`RSI ${rsi.toFixed(0)} — DEEPLY OVERBOUGHT`,    color:C.red,      p:1 });
    else if (rsi > 65) a.push({ msg:`RSI ${rsi.toFixed(0)} — OVERBOUGHT ZONE`,      color:"#ff6644",  p:2 });
  }
  if (wm?.riskOn === true)  a.push({ msg:"WEEKLY MACD → RISK ON CONFIRMED",  color:C.green, p:1 });
  if (wm?.riskOn === false) a.push({ msg:"WEEKLY MACD → RISK OFF — WAIT",    color:C.red,   p:1 });
  if (macd?.hist != null && macd?.macd != null) {
    if (macd.hist > 0 && macd.macd > 0) a.push({ msg:"DAILY MACD BULLISH CROSS", color:C.greenDim, p:2 });
    if (macd.hist < 0 && macd.macd < 0) a.push({ msg:"DAILY MACD BEARISH CROSS", color:"#ff6644",  p:2 });
  }
  if (emas && price) {
    const e21 = emas[2];
    if (e21 && Math.abs(((price-e21)/e21)*100) < 0.3)
      a.push({ msg:"PRICE TESTING EMA21", color:C.yellow, p:2 });
  }
  if (ema200 && price && Math.abs(((price-ema200)/ema200)*100) < 0.5)
    a.push({ msg:"PRICE AT EMA200 — KEY LEVEL", color:C.yellow, p:1 });
  if (Math.abs(change) > 4)
    a.push({ msg:`${change>0?"+":""}${change.toFixed(1)}% TODAY — BIG MOVE`, color:change>0?C.green:C.red, p:1 });
  return a.sort((x, y) => x.p - y.p);
}

// ── YAHOO FINANCE ─────────────────────────────────────────────────────────────
async function fetchYahoo(yahooSymbol) {
  const url = `/api/yahoo?symbol=${yahooSymbol}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`Yahoo HTTP ${res.status}`);
  const data = await res.json();
  console.log(`[Yahoo] ${yahooSymbol}:`, JSON.stringify(data).slice(0, 200));
  const result = data?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${yahooSymbol}`);
  const quote   = result.indicators?.quote?.[0];
  const closes  = quote?.close  || [];
  const vols    = quote?.volume || [];
  const opens   = quote?.open   || [];
  const valid   = closes
    .map((c, i) => ({ c, v:vols[i]||0, o:opens[i]||c }))
    .filter(d => d.c != null && !isNaN(d.c));
  if (valid.length < 10) throw new Error(`Insufficient data for ${yahooSymbol}`);
  const prices  = valid.map(d => d.c);
  const volumes = valid.map(d => d.v);
  const last    = valid[valid.length - 1];
  const price   = last.c;
  const open    = last.o;
  const change  = ((price - open) / open) * 100;
  return { price, prices, volumes, change };
}


// ── LEARN PANEL ───────────────────────────────────────────────────────────────
const LEARN_SECTIONS = [
  {
    title: "MACD — Momentum Explained",
    color: C.green,
    content: [
      {
        heading: "What is MACD?",
        text: "MACD measures whether short-term price momentum is faster or slower than long-term momentum. It answers one question: is buying pressure accelerating or fading? Nothing more.",
      },
      {
        heading: "The Three Numbers",
        text: "MACD Line = 12-day EMA minus 26-day EMA. Positive means short-term is faster than long-term (bullish). Negative means short-term is slower (bearish). Signal Line = a 9-day smoothing of the MACD — think of it as a slow version. Histogram = MACD minus Signal. This is the most important number. When it crosses zero, momentum is shifting. Positive and growing = accelerating up. Positive but shrinking = momentum slowing.",
      },
      {
        heading: "Daily vs Weekly MACD",
        text: "Daily MACD (12,26,9) tells you what momentum is doing RIGHT NOW. Weekly MACD (6,20,9) tells you what the overall trend direction is. Think of weekly as the highway — is it going uphill or downhill? Daily is your speed on that highway. You want to drive fast (daily bullish) on an uphill highway (weekly risk on).",
      },
      {
        heading: "The Four Setups",
        text: "RISK ON + Daily BULLISH = Highest confidence long entry. RISK OFF + Daily BULLISH = Bounce in a downtrend — be cautious. RISK OFF + Daily BEARISH = Strong short or put signal. RISK ON + Daily BEARISH = Pullback in uptrend — watch for entry opportunity.",
      },
    ],
  },
  {
    title: "RSI — Overbought & Oversold",
    color: C.yellow,
    content: [
      {
        heading: "What is RSI?",
        text: "RSI measures how fast and how much price has moved recently on a scale of 0 to 100. High RSI means price moved up fast recently. Low RSI means price moved down hard. It tells you if a move has gone too far too fast.",
      },
      {
        heading: "The Key Levels",
        text: "Below 30 = OVERSOLD. Price has dropped hard — potential bounce zone. Good area to look for long entries or close short positions. Above 65 = OVERBOUGHT. Price has run fast — momentum may be exhausted. Good area to look for short entries or take profits on longs. 30-65 = NEUTRAL. No extreme reading, trend continuation likely.",
      },
      {
        heading: "How This Dashboard Uses RSI",
        text: "RSI below 30 adds +2 to the signal score — a strong buy input. RSI above 65 subtracts 2 — a strong sell input. RSI below 50 adds +0.5 (mild bullish lean). RSI above 50 subtracts 0.5 (mild bearish lean). Combined with MACD and EMA alignment, RSI helps confirm entries rather than acting alone.",
      },
      {
        heading: "Important Note",
        text: "Overbought doesn't mean sell immediately — a strong trend can stay overbought for weeks. Oversold doesn't mean buy immediately — a weak stock can stay oversold for months. Use RSI as a timing tool alongside MACD, not as a standalone signal.",
      },
    ],
  },
  {
    title: "EMAs — Trend Direction",
    color: "#00ccff",
    content: [
      {
        heading: "What is an EMA?",
        text: "An Exponential Moving Average is the average closing price over a set number of days, with recent days weighted more heavily than older days. It smooths out daily noise so you can see the actual trend direction.",
      },
      {
        heading: "The EMA Stack",
        text: "EMA5 = very short term, reacts to moves within a week. EMA13 = short term, about 2-3 weeks. EMA21 = medium term, about a month. EMA34 = medium-long term. EMA50 = longer term trend, 2-3 months. EMA200 = long-term trend, roughly one year. Price above an EMA = bullish for that timeframe. Price below = bearish.",
      },
      {
        heading: "EMA Alignment Ring",
        text: "The ring on each card shows how many of the 5 signal EMAs price is currently above. 5/5 fully green = all timeframes bullish. 0/5 fully red = all timeframes bearish. Mixed readings mean the trend is transitioning. A 5/5 reading with RISK OFF weekly MACD is a warning — it means price bounced but the bigger trend is still down.",
      },
      {
        heading: "EMA200 — The Institutional Level",
        text: "The EMA200 is watched by every major fund and institution. Price above EMA200 = long-term bull market. Price below EMA200 = long-term bear market. When price tests EMA200 from above, it often acts as support. From below, it acts as resistance. This dashboard alerts you when price gets within 0.5% of EMA200 — that is a key decision point.",
      },
    ],
  },
  {
    title: "Signal Score — How Cards Are Rated",
    color: C.greenDim,
    content: [
      {
        heading: "How the Score Works",
        text: "Every card calculates a score from -5 to +5 based on all indicators combined. The score determines the signal badge — STRONG BUY, BUY, NEUTRAL, SELL, or STRONG SELL.",
      },
      {
        heading: "Score Breakdown",
        text: "EMA5 above EMA13 = +1 (else -1). EMA13 above EMA21 = +1 (else -1). RSI below 35 = +2. RSI above 65 = -2. RSI below 50 = +0.5. RSI above 50 = -0.5. Daily MACD histogram positive = +0.5. Daily MACD histogram negative = -0.5. Today's price change above 0.5% = +1. Weekly MACD RISK ON = +1. Weekly MACD RISK OFF = -1.",
      },
      {
        heading: "Signal Thresholds",
        text: "Score above 2.5 = STRONG BUY. Score 1 to 2.5 = BUY. Score -1 to 1 = NEUTRAL. Score -2.5 to -1 = SELL. Score below -2.5 = STRONG SELL. Note: EMA200 is NOT included in the score — it is a visual reference only and does not affect buy/sell ratings.",
      },
      {
        heading: "How to Use the Score",
        text: "Use STRONG BUY + RISK ON as your highest confidence long setup. Use STRONG SELL + RISK OFF as your highest confidence short or put setup. NEUTRAL cards are in transition — wait for a clearer signal. Never use the signal alone — always confirm with your own chart read and the macro context.",
      },
    ],
  },
  {
    title: "Weekly Regime — The Most Important Filter",
    color: C.red,
    content: [
      {
        heading: "What is the Weekly Regime?",
        text: "The weekly regime is determined by the Weekly MACD (6,20,9) — the settings recommended in the tweet you shared. It classifies each ticker as either RISK ON (weekly trend is up) or RISK OFF (weekly trend is down).",
      },
      {
        heading: "RISK ON",
        text: "Weekly MACD line is above the signal line. The weekly trend is bullish. Long entries are valid when daily signals confirm. This is your green light to look for buying opportunities on that ticker.",
      },
      {
        heading: "RISK OFF",
        text: "Weekly MACD line is below the signal line. The weekly trend is bearish. Avoid new long entries. Wait for the first weekly close where MACD crosses back above signal — that is your confirmation to re-enter. This is your signal to look for short or put opportunities.",
      },
      {
        heading: "The Macro Banner",
        text: "The banner at the top of the dashboard shows the weekly regime across your entire watchlist. If more than 55% of tickers are RISK OFF it calls a macro bearish regime — avoid new longs across the board. If more than 55% are RISK ON it confirms a macro bull environment. Mixed readings mean trade selectively on individual ticker signals only.",
      },
    ],
  },
];

function LearnPanel() {
  const [openSection, setOpenSection] = useState(null);
  return (
    <div style={{
      background:C.bgDeep, border:`1px solid ${C.borderBright}`,
      marginBottom:14, overflow:"hidden",
    }}>
      {/* Learn header */}
      <div style={{
        padding:"12px 18px",
        borderBottom: openSection !== null ? `1px solid ${C.border}` : "none",
        fontSize:11, color:C.grey, letterSpacing:3,
      }}>
        {"// INDICATOR REFERENCE GUIDE — click any section to expand"}
      </div>

      {LEARN_SECTIONS.map((section, idx) => {
        const isOpen = openSection === idx;
        return (
          <div key={idx} style={{borderBottom: idx < LEARN_SECTIONS.length-1 ? `1px solid ${C.border}` : "none"}}>
            {/* Section header */}
            <button
              onClick={()=>setOpenSection(isOpen ? null : idx)}
              style={{
                width:"100%", background:isOpen?`${section.color}08`:"transparent",
                border:"none", padding:"12px 18px",
                display:"flex", justifyContent:"space-between", alignItems:"center",
                cursor:"pointer", textAlign:"left",
              }}
            >
              <span style={{fontSize:12, color:section.color, fontWeight:700, letterSpacing:2, fontFamily:"monospace"}}>
                {section.title.toUpperCase()}
              </span>
              <span style={{fontSize:14, color:section.color, opacity:0.7}}>
                {isOpen ? "▲" : "▼"}
              </span>
            </button>

            {/* Section content */}
            {isOpen && (
              <div style={{padding:"0 18px 18px", display:"flex", flexDirection:"column", gap:14}}>
                {section.content.map((block, i) => (
                  <div key={i}>
                    <div style={{
                      fontSize:11, color:section.color, letterSpacing:2,
                      marginBottom:6, fontFamily:"monospace",
                    }}>
                      ◈ {block.heading.toUpperCase()}
                    </div>
                    <div style={{
                      fontSize:12, color:C.grey, lineHeight:1.7,
                      letterSpacing:0.3, fontFamily:"monospace",
                    }}>
                      {block.text}
                    </div>
                  </div>
                ))}

                {/* Quick reference table for signal score */}
                {idx === 1 && (
                  <div style={{display:"flex",flexDirection:"column",gap:3,marginTop:4}}>
                    {[
                      {label:"RISK ON + Daily BULLISH",  result:"HIGHEST CONFIDENCE LONG",   color:C.green},
                      {label:"RISK OFF + Daily BULLISH", result:"BOUNCE IN DOWNTREND — WAIT", color:C.yellow},
                      {label:"RISK OFF + Daily BEARISH", result:"STRONG SHORT/PUT SIGNAL",    color:C.red},
                      {label:"RISK ON + Daily BEARISH",  result:"PULLBACK — WATCH ENTRY",     color:C.greenDim},
                    ].map(({label,result,color})=>(
                      <div key={label} style={{
                        display:"flex",justifyContent:"space-between",alignItems:"center",
                        fontSize:11,padding:"5px 10px",fontFamily:"monospace",
                        background:`${color}08`,border:`1px solid ${color}22`,
                      }}>
                        <span style={{color:C.grey}}>{label}</span>
                        <span style={{color,fontWeight:700,letterSpacing:1}}>{result}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── UI COMPONENTS ─────────────────────────────────────────────────────────────
function Sparkline({ prices, color, width=300, height=48 }) {
  if (!prices || prices.length < 2) return null;
  const min=Math.min(...prices), max=Math.max(...prices), range=max-min||1;
  const pts = prices.map((p,i)=>`${(i/(prices.length-1))*width},${height-((p-min)/range)*(height-4)-2}`).join(" ");
  const id  = `g${color.replace(/\W/g,"")}`;
  const lp  = prices[prices.length-1];
  const lx  = width, ly = height-((lp-min)/range)*(height-4)-2;
  return (
    <svg width={width} height={height} style={{display:"block",overflow:"visible"}}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts} ${width},${height}`} fill={`url(#${id})`}/>
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round"/>
      <circle cx={lx} cy={ly} r={4} fill={color} style={{filter:`drop-shadow(0 0 4px ${color})`}}/>
    </svg>
  );
}

function RSIBar({ rsi }) {
  if (rsi == null) return null;
  const pct   = Math.min(Math.max(rsi,0),100);
  const color = rsi < 35 ? C.green : rsi > 65 ? C.red : C.yellow;
  const zone  = rsi < 35 ? "OVERSOLD" : rsi > 65 ? "OVERBOUGHT" : "NEUTRAL";
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:12,color:C.grey,letterSpacing:1}}>RSI(14)</span>
        <span style={{fontSize:12,color,fontWeight:700,letterSpacing:1}}>{rsi.toFixed(1)} · {zone}</span>
      </div>
      <div style={{height:4,background:"#0a140a",position:"relative"}}>
        <div style={{position:"absolute",left:"30%",width:1,top:-3,bottom:-3,background:C.greyDim}}/>
        <div style={{position:"absolute",left:"65%",width:1,top:-3,bottom:-3,background:C.greyDim}}/>
        <div style={{height:"100%",width:`${pct}%`,background:`linear-gradient(90deg,${color}88,${color})`,transition:"width 0.6s ease"}}/>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
        <span style={{fontSize:10,color:C.greyDim}}>30</span>
        <span style={{fontSize:10,color:C.greyDim}}>65</span>
      </div>
    </div>
  );
}

function EMARing({ emas, price }) {
  const valid = (emas||[]).filter(Boolean);
  if (!valid.length || !price) return null;
  const bullish = valid.filter(e=>price>e).length;
  const pct     = bullish/valid.length;
  const color   = pct>0.7?C.green:pct>0.4?C.yellow:C.red;
  const circ    = 2*Math.PI*14;
  return (
    <div style={{display:"flex",alignItems:"center",gap:8}}>
      <svg width={36} height={36}>
        <circle cx={18} cy={18} r={14} fill="none" stroke={C.border} strokeWidth={3}/>
        <circle cx={18} cy={18} r={14} fill="none" stroke={color} strokeWidth={3}
          strokeDasharray={`${pct*circ} ${circ}`} strokeLinecap="butt"
          transform="rotate(-90 18 18)"
          style={{transition:"stroke-dasharray 0.6s ease",filter:`drop-shadow(0 0 4px ${color})`}}/>
        <text x={18} y={23} textAnchor="middle" fontSize={10} fill={color} fontFamily="monospace" fontWeight="700">
          {bullish}/{valid.length}
        </text>
      </svg>
      <span style={{fontSize:11,color:C.grey,letterSpacing:1}}>EMA ALIGNMENT</span>
    </div>
  );
}

function VolumeBar({ volumes }) {
  if (!volumes||volumes.length<2) return null;
  const recent = volumes.slice(-14);
  const max    = Math.max(...recent);
  const avg    = recent.reduce((a,b)=>a+b,0)/recent.length;
  const last   = recent[recent.length-1];
  const high   = last > avg*1.2;
  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
        <span style={{fontSize:12,color:C.grey,letterSpacing:1}}>VOLUME</span>
        <span style={{fontSize:12,color:high?C.green:C.greyDim,fontWeight:700,letterSpacing:1}}>
          {high?"▲ ELEVATED":"◦ AVERAGE"}
        </span>
      </div>
      <div style={{display:"flex",gap:3,alignItems:"flex-end",height:24}}>
        {recent.map((v,i)=>{
          const h=Math.max(3,(v/max)*24), isLast=i===recent.length-1;
          return <div key={i} style={{flex:1,height:h,background:isLast&&high?C.green:isLast?C.greyDim:"#0f1f0f",boxShadow:isLast&&high?`0 0 6px ${C.green}66`:"none"}}/>;
        })}
      </div>
    </div>
  );
}

function WeeklyMACDPanel({ wm }) {
  if (!wm||wm.riskOn===null||wm.macd===null) return null;
  const {macd:m,signal:s,hist:h,riskOn} = wm;
  const color = riskOn?C.green:C.red;
  return (
    <div style={{border:`1px solid ${color}44`,background:`${color}08`,padding:"10px 12px",display:"flex",flexDirection:"column",gap:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:12,color:C.grey,letterSpacing:1}}>WEEKLY MACD (6,20,9)</span>
        <div style={{fontSize:12,fontWeight:700,color,letterSpacing:2,padding:"3px 10px",
          border:`1px solid ${color}66`,background:`${color}15`,
          boxShadow:`0 0 8px ${color}33`,animation:"pulse 3s infinite"}}>
          {riskOn?"● RISK ON":"○ RISK OFF"}
        </div>
      </div>
      <div style={{display:"flex",gap:8}}>
        {[["MACD",m],["SIGNAL",s],["HIST",h]].map(([lbl,val])=>(
          <div key={lbl} style={{flex:1,background:C.bgDeep,border:`1px solid ${C.border}`,padding:"5px 8px",textAlign:"center"}}>
            <div style={{fontSize:10,color:C.greyDim,letterSpacing:1,marginBottom:3}}>{lbl}</div>
            <div style={{fontSize:11,color:val!=null?(val>=0?C.green:C.red):C.greyDim,fontWeight:700}}>
              {val!=null?val.toFixed(4):"---"}
            </div>
          </div>
        ))}
      </div>
      <div style={{fontSize:10,color:C.greyDim,letterSpacing:0.5}}>
        {riskOn?"Weekly trend UP — longs valid when daily confirms":"Weekly trend DOWN — wait for MACD up-cross"}
      </div>
    </div>
  );
}

function DailyMACDPanel({ macd }) {
  if (!macd||macd.macd===null) return null;
  const {macd:m,signal:s,hist:h} = macd;
  const bull  = h!=null&&h>0;
  const color = bull?C.greenDim:"#ff6644";
  return (
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",justifyContent:"space-between"}}>
        <span style={{fontSize:12,color:C.grey,letterSpacing:1}}>DAILY MACD (12,26,9)</span>
        <span style={{fontSize:12,color,fontWeight:700,letterSpacing:1}}>{bull?"▲ BULLISH":"▼ BEARISH"}</span>
      </div>
      <div style={{display:"flex",gap:8}}>
        {[["MACD",m],["SIG",s],["HIST",h]].map(([lbl,val])=>(
          <div key={lbl} style={{flex:1,background:C.bgDeep,border:`1px solid ${C.border}`,padding:"5px 8px",textAlign:"center"}}>
            <div style={{fontSize:10,color:C.greyDim,letterSpacing:1,marginBottom:3}}>{lbl}</div>
            <div style={{fontSize:11,color:val!=null?(val>=0?C.greenDim:"#ff6644"):C.greyDim,fontWeight:700}}>
              {val!=null?val.toFixed(3):"---"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AssetCard({ asset, data, loading }) {
  const {symbol,type,label} = asset;
  const {price,prices,volumes,change,emas,ema200,rsi,macd,weeklyMacd} = data||{};
  const signal  = getSignal(price,emas,rsi,change||0,macd,weeklyMacd);
  const alerts  = price?getAlerts(symbol,price,rsi,macd,weeklyMacd,change||0,emas,ema200):[];
  const isPos   = (change||0)>=0;
  const wColor  = weeklyMacd?.riskOn===true?C.green:weeklyMacd?.riskOn===false?C.red:signal.color;
  const above200  = ema200&&price?price>ema200:null;
  const diff200   = ema200&&price?(((price-ema200)/ema200)*100).toFixed(2):null;
  const [vis,setVis] = useState(false);
  useEffect(()=>{const t=setTimeout(()=>setVis(true),80);return()=>clearTimeout(t);},[]);

  return (
    <div style={{
      background:C.bgCard,border:`1px solid ${C.border}`,
      borderTop:`2px solid ${loading?C.border:wColor}`,
      padding:"20px 20px 16px",display:"flex",flexDirection:"column",gap:16,
      position:"relative",overflow:"hidden",
      opacity:vis?1:0,transform:vis?"translateY(0)":"translateY(10px)",
      transition:"opacity 0.35s ease, transform 0.35s ease",
      boxShadow:`0 0 24px ${wColor}0a,inset 0 0 40px ${C.bgDeep}88`,
    }}>
      <div style={{position:"absolute",inset:0,pointerEvents:"none",
        background:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,65,0.012) 2px,rgba(0,255,65,0.012) 4px)"}}/>
      <div style={{position:"absolute",top:0,right:0,width:0,height:0,
        borderStyle:"solid",borderWidth:"0 24px 24px 0",
        borderColor:`transparent ${wColor}55 transparent transparent`}}/>

      {alerts.filter(a=>a.p===1).slice(0,2).map((a,i)=>(
        <div key={i} style={{fontSize:11,color:a.color,letterSpacing:1,fontWeight:700,
          background:`${a.color}0f`,border:`1px solid ${a.color}44`,padding:"5px 10px",
          animation:"pulse 2s infinite",display:"flex",alignItems:"center",gap:6}}>
          <span style={{fontSize:14}}>▶</span>{a.msg}
        </div>
      ))}

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <div style={{display:"flex",alignItems:"baseline",gap:8}}>
            <span style={{fontSize:24,fontWeight:700,color:C.white,letterSpacing:3,
              textShadow:`0 0 10px ${wColor}66`}}>{symbol}</span>
            <span style={{fontSize:10,color:C.greyDim,letterSpacing:2,
              border:`1px solid ${C.border}`,padding:"1px 5px"}}>{type.toUpperCase()}</span>
          </div>
          <div style={{fontSize:13,color:C.grey,marginTop:3,letterSpacing:1}}>{label}</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:22,fontWeight:700,color:loading?C.greyDim:C.white,letterSpacing:1,
            textShadow:loading?"none":`0 0 8px ${C.green}44`}}>
            {loading?"LOADING...":fmt(price,type)}
          </div>
          {!loading&&change!==undefined&&(
            <div style={{fontSize:14,fontWeight:700,letterSpacing:1,
              color:isPos?C.green:C.red,textShadow:`0 0 6px ${isPos?C.green:C.red}66`}}>
              {isPos?"▲":"▼"} {Math.abs(change).toFixed(2)}%
            </div>
          )}
        </div>
      </div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <EMARing emas={emas} price={price}/>
        <div style={{fontSize:14,fontWeight:700,letterSpacing:2,color:signal.color,
          border:`1px solid ${signal.color}66`,padding:"6px 16px",
          background:`${signal.color}12`,boxShadow:`0 0 10px ${signal.color}33`}}>
          {signal.label}
        </div>
      </div>

      {prices&&(
        <div style={{margin:"0 -4px"}}>
          <Sparkline prices={prices.slice(-40)} color={wColor} width={308} height={52}/>
        </div>
      )}

      <div style={{height:1,background:`linear-gradient(90deg,transparent,${C.borderBright},transparent)`}}/>
      <RSIBar rsi={rsi}/>
      <WeeklyMACDPanel wm={weeklyMacd}/>
      <DailyMACDPanel macd={macd}/>
      <VolumeBar volumes={volumes}/>
      <div style={{height:1,background:`linear-gradient(90deg,transparent,${C.borderBright},transparent)`}}/>

      {ema200&&price&&(
        <div>
          <div style={{fontSize:11,color:C.greyDim,letterSpacing:2,marginBottom:6}}>LONG-TERM TREND</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
            fontSize:13,padding:"7px 10px",
            background:above200?`${C.green}0a`:`${C.red}0a`,
            border:`1px solid ${above200?C.green:C.red}44`}}>
            <span style={{color:C.grey,letterSpacing:1}}>EMA200</span>
            <span style={{color:C.white,fontWeight:600}}>{fmtEMA(ema200,type)}</span>
            <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:2}}>
              <span style={{fontSize:12,fontWeight:700,letterSpacing:1,
                color:above200?C.green:C.red,textShadow:`0 0 6px ${above200?C.green:C.red}55`}}>
                {above200?"▲ ABOVE 200":"▼ BELOW 200"}
              </span>
              <span style={{fontSize:10,color:above200?C.greenDim:"#ff6644"}}>
                {above200?"+":""}{diff200}% from EMA200
              </span>
            </div>
          </div>
          <div style={{fontSize:10,color:C.greyDim,marginTop:4,letterSpacing:0.5}}>
            {above200?"Long-term trend BULLISH — price above 200-day average":"Long-term trend BEARISH — price below 200-day average"}
          </div>
        </div>
      )}

      {emas&&emas.some(Boolean)&&(
        <div style={{display:"flex",flexDirection:"column",gap:5}}>
          <div style={{fontSize:11,color:C.greyDim,letterSpacing:2,marginBottom:2}}>EMA LEVELS</div>
          {EMA_PERIODS.map((p,i)=>{
            const e=emas[i];
            if(!e||!price) return null;
            const above=price>e, diffPct=(((price-e)/e)*100).toFixed(2);
            return (
              <div key={p} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                fontSize:13,padding:"5px 10px",
                background:above?`${C.green}07`:`${C.red}07`,
                border:`1px solid ${above?C.green:C.red}22`}}>
                <span style={{color:C.grey,width:54,letterSpacing:1}}>EMA{p}</span>
                <span style={{color:C.white,fontWeight:600}}>{fmtEMA(e,type)}</span>
                <span style={{color:above?C.green:C.red,fontWeight:700,letterSpacing:1}}>
                  {above?"▲":"▼"} {Math.abs(diffPct)}%
                </span>
              </div>
            );
          })}
        </div>
      )}

      {alerts.filter(a=>a.p===2).slice(0,1).map((a,i)=>(
        <div key={i} style={{fontSize:11,color:a.color,letterSpacing:1}}>◦ {a.msg}</div>
      ))}
    </div>
  );
}

function SessionBar() {
  const [now,setNow] = useState(new Date());
  useEffect(()=>{const t=setInterval(()=>setNow(new Date()),1000);return()=>clearInterval(t);},[]);
  const h=now.getUTCHours(),m=now.getUTCMinutes(),s=now.getUTCSeconds();
  const mstH=((h-6)+24)%24, etH=((h-4)+24)%24;
  const pad=(v)=>String(v).padStart(2,"0");
  const etTotal=etH*60+m;
  const open=etTotal>=570&&etTotal<960, pre=etTotal>=240&&etTotal<570, prime=isTradingWindow();
  return (
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      background:C.bgDeep,border:`1px solid ${C.border}`,padding:"10px 18px",marginBottom:14}}>
      <div style={{display:"flex",gap:24}}>
        {[["MST",mstH],["ET",etH]].map(([tz,hr])=>(
          <div key={tz} style={{display:"flex",gap:8,alignItems:"baseline"}}>
            <span style={{fontSize:11,color:C.greyDim,letterSpacing:2}}>{tz}</span>
            <span style={{fontSize:16,color:C.green,fontWeight:700,letterSpacing:2,
              textShadow:`0 0 8px ${C.green}55`}}>{pad(hr)}:{pad(m)}:{pad(s)}</span>
          </div>
        ))}
      </div>
      <div style={{display:"flex",gap:8}}>
        {[
          {label:open?"● MARKET OPEN":pre?"◐ PRE-MARKET":"○ MARKET CLOSED",color:open?C.green:pre?C.yellow:C.greyDim},
          {label:prime?"● PRIME WINDOW 12–15 MST":"○ PRIME WINDOW CLOSED",color:prime?C.green:C.greyDim},
        ].map(({label,color})=>(
          <div key={label} style={{fontSize:11,color,letterSpacing:1,fontWeight:700,
            border:`1px solid ${color}44`,padding:"4px 12px",background:`${color}08`,
            boxShadow:color!==C.greyDim?`0 0 8px ${color}22`:"none"}}>{label}</div>
        ))}
      </div>
    </div>
  );
}

function MacroBanner({ assetData }) {
  const entries=Object.values(assetData).filter(d=>d?.weeklyMacd?.riskOn!=null);
  const riskOn=entries.filter(d=>d.weeklyMacd.riskOn).length;
  const riskOff=entries.filter(d=>!d.weeklyMacd.riskOn).length;
  const total=entries.length||1;
  const sigs=Object.values(assetData).map(d=>d?.signal).filter(Boolean);
  const bulls=sigs.filter(s=>s.includes("BUY")).length;
  const bears=sigs.filter(s=>s.includes("SELL")).length;
  const above200Count=Object.values(assetData).filter(d=>d?.ema200&&d?.price&&d.price>d.ema200).length;
  const below200Count=Object.values(assetData).filter(d=>d?.ema200&&d?.price&&d.price<d.ema200).length;
  const total200=above200Count+below200Count;

  let wMsg,wColor;
  if(riskOff/total>0.55){wMsg=`⚠  WEEKLY REGIME: RISK OFF — ${riskOff}/${total} tickers bearish. Hold off on new longs.`;wColor=C.red;}
  else if(riskOn/total>0.55){wMsg=`◈  WEEKLY REGIME: RISK ON — ${riskOn}/${total} tickers bullish. Weekly trend supports entries.`;wColor=C.green;}
  else{wMsg=`◦  WEEKLY REGIME: MIXED — No dominant trend. Use daily MACD to time entries.`;wColor=C.yellow;}

  let dMsg,dColor;
  if(bears/(sigs.length||1)>0.55){dMsg=`DAILY: ${bears} SELL signals dominant.`;dColor="#ff6644";}
  else if(bulls/(sigs.length||1)>0.55){dMsg=`DAILY: ${bulls} BUY signals dominant.`;dColor=C.greenDim;}
  else{dMsg=`DAILY: Mixed signals — no dominant short-term bias.`;dColor=C.grey;}

  const e200Msg=total200>0?`EMA200: ${above200Count}/${total200} above — ${above200Count/total200>0.6?"long-term BULLISH":above200Count/total200<0.4?"long-term BEARISH":"mixed long-term picture"}`:null;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:14}}>
      <div style={{background:`${wColor}08`,border:`1px solid ${wColor}44`,
        padding:"10px 18px",fontSize:13,color:wColor,letterSpacing:0.5,fontWeight:700,
        boxShadow:`0 0 12px ${wColor}15`}}>{wMsg}</div>
      <div style={{display:"flex",gap:6}}>
        <div style={{flex:1,background:C.bgDeep,border:`1px solid ${C.border}`,
          padding:"8px 18px",fontSize:12,color:dColor,letterSpacing:0.5}}>{dMsg}</div>
        {e200Msg&&(
          <div style={{flex:1,background:C.bgDeep,border:`1px solid ${C.border}`,
            padding:"8px 18px",fontSize:12,color:C.grey,letterSpacing:0.5}}>{e200Msg}</div>
        )}
      </div>
    </div>
  );
}

// ── MAIN ──────────────────────────────────────────────────────────────────────
export default function TradingDashboard() {
  const [assetData,setAssetData]   = useState({});
  const [loading,setLoading]       = useState({});
  const [lastUpdate,setLastUpdate] = useState(null);
  const [filter,setFilter]         = useState("ALL");
  const [statusMsg,setStatusMsg]   = useState("");
  const [showLearn,setShowLearn]   = useState(false);
  const intervalRef = useRef(null);

  const processAsset = (symbol, raw) => {
    const emas  = EMA_PERIODS.map(p => calcEMA(raw.prices, p));
    const ema200 = calcEMA(raw.prices, 200);
    const rsi   = calcRSI(raw.prices);
    const macd  = calcMACDCustom(raw.prices, 12, 26, 9);
    const wm    = calcWeeklyMACD(raw.prices);
    const sig   = getSignal(raw.price, emas, rsi, raw.change, macd, wm);
    return { ...raw, emas, ema200, rsi, macd, weeklyMacd:wm, signal:sig.label };
  };

  const fetchAllData = useCallback(async () => {
    console.log("[SignalDesk] Fetching all tickers via Yahoo Finance (1y data)...");
    for (const asset of ALL_TICKERS) {
      const {symbol, yahooSymbol} = asset;
      setLoading(prev=>({...prev,[symbol]:true}));
      setStatusMsg(`Fetching ${symbol}...`);
      try {
        const raw = await fetchYahoo(yahooSymbol);
        setAssetData(prev=>({...prev,[symbol]:processAsset(symbol,raw)}));
        console.log(`[Yahoo] ✓ ${symbol} — $${raw.price.toFixed(2)} (${raw.prices.length} bars)`);
      } catch(e) {
        console.warn(`[Yahoo] ✗ ${symbol}: ${e.message} — using demo data`);
        const mock = getMockData(symbol);
        setAssetData(prev=>({...prev,[symbol]:processAsset(symbol,mock)}));
      }
      setLoading(prev=>({...prev,[symbol]:false}));
      await new Promise(r=>setTimeout(r,300));
    }
    setStatusMsg("");
    setLastUpdate(new Date());
    console.log("[SignalDesk] All tickers loaded.");
  }, []);

  useEffect(()=>{
    fetchAllData();
    intervalRef.current=setInterval(fetchAllData,5*60*1000);
    return()=>clearInterval(intervalRef.current);
  },[fetchAllData]);

  const alertCount = Object.entries(assetData).reduce((acc,[sym,d])=>{
    if(!d?.price) return acc;
    return acc+getAlerts(sym,d.price,d.rsi,d.macd,d.weeklyMacd,d.change||0,d.emas,d.ema200).filter(a=>a.p===1).length;
  },0);

  const loadedCount = Object.values(assetData).filter(d=>d?.price).length;
  const totalCount  = ALL_TICKERS.length;
  const allLoaded   = loadedCount >= totalCount;

  const filterOptions=["ALL","RISK ON","RISK OFF","ABOVE 200","BELOW 200","STRONG BUY","BUY","NEUTRAL","SELL","STRONG SELL","⚡ ALERTS"];
  const fColors={"RISK ON":C.green,"RISK OFF":C.red,"STRONG BUY":C.green,"BUY":C.greenDim,"NEUTRAL":C.yellow,"SELL":"#ff6644","STRONG SELL":C.red,"⚡ ALERTS":"#ff8800","ALL":C.grey,"ABOVE 200":C.green,"BELOW 200":C.red};

  return (
    <div style={{minHeight:"100vh",background:C.bg,
      backgroundImage:`radial-gradient(ellipse at 50% 0%,#001a0066 0%,transparent 60%),repeating-linear-gradient(0deg,transparent,transparent 40px,${C.green}04 40px,${C.green}04 41px),repeating-linear-gradient(90deg,transparent,transparent 40px,${C.green}03 40px,${C.green}03 41px)`,
      color:C.white,padding:"20px 18px",fontFamily:"'Courier New','Courier',monospace"}}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes flicker{0%,100%{opacity:1}92%{opacity:0.97}95%{opacity:0.9}97%{opacity:1}}
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-thumb{background:${C.borderBright};}
        button{cursor:pointer;transition:all 0.15s;font-family:inherit;}
        button:hover{filter:brightness(1.3);}
      `}</style>

      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:18}}>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:14}}>
            <h1 style={{margin:0,fontSize:28,fontWeight:700,letterSpacing:6,
              color:C.green,textShadow:`0 0 20px ${C.green}88,0 0 40px ${C.green}44`,
              animation:"flicker 8s infinite"}}>SIGNAL//DESK</h1>
            {alertCount>0&&(
              <div style={{background:`${C.red}18`,border:`1px solid ${C.red}88`,
                color:C.red,fontSize:11,padding:"3px 10px",fontWeight:700,
                letterSpacing:1,animation:"pulse 1.5s infinite",
                boxShadow:`0 0 10px ${C.red}44`}}>
                ▶ {alertCount} ALERT{alertCount>1?"S":""}
              </div>
            )}
          </div>
          <div style={{fontSize:11,color:C.greyDim,letterSpacing:3,marginTop:5}}>
            {totalCount} TICKERS · YAHOO FINANCE · 1Y DATA · EMA200 · NO API KEY &nbsp;·&nbsp;
            {lastUpdate?`SYNC ${lastUpdate.toLocaleTimeString()}`:"INITIALIZING..."}
          </div>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setShowLearn(!showLearn)} style={{
            background:showLearn?`${C.green}12`:"transparent",
            border:`1px solid ${showLearn?C.green+"66":C.borderBright}`,
            color:showLearn?C.green:C.grey,
            padding:"7px 14px",fontSize:11,letterSpacing:1,
            boxShadow:showLearn?`0 0 8px ${C.green}22`:"none"}}>
            ? LEARN
          </button>
          <button onClick={fetchAllData} style={{background:"transparent",
            border:`1px solid ${C.borderBright}`,
            color:C.grey,padding:"7px 14px",fontSize:11,letterSpacing:1}}>↺ REFRESH</button>
        </div>
      </div>

      {/* Loading bar */}
      {!allLoaded&&(
        <div style={{marginBottom:14}}>
          <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
            <span style={{fontSize:11,color:C.greyDim,letterSpacing:2}}>{statusMsg||"LOADING MARKET DATA"}</span>
            <span style={{fontSize:11,color:C.green,letterSpacing:2}}>{loadedCount}/{totalCount}</span>
          </div>
          <div style={{height:3,background:C.bgDeep,border:`1px solid ${C.border}`}}>
            <div style={{height:"100%",width:`${(loadedCount/totalCount)*100}%`,
              background:`linear-gradient(90deg,${C.greenDim},${C.green})`,
              boxShadow:`0 0 8px ${C.green}66`,transition:"width 0.4s ease"}}/>
          </div>
        </div>
      )}

      {/* Learn panel — collapsible */}
      {showLearn && <LearnPanel/>}

      <SessionBar/>
      <MacroBanner assetData={assetData}/>

      {/* Filter bar */}
      <div style={{display:"flex",gap:6,marginBottom:20,flexWrap:"wrap"}}>
        {filterOptions.map(f=>{
          const active=filter===f, color=fColors[f]||C.grey;
          return (
            <button key={f} onClick={()=>setFilter(f)} style={{
              background:active?`${color}18`:"transparent",
              border:`1px solid ${active?color+"88":C.border}`,
              color:active?color:C.greyDim,
              padding:"5px 12px",fontSize:11,letterSpacing:1,
              boxShadow:active?`0 0 8px ${color}22`:"none"}}>{f}</button>
          );
        })}
      </div>

      {/* Sectors */}
      {SECTORS.map(sector=>{
        const filtered=sector.tickers.filter(asset=>{
          const d=assetData[asset.symbol];
          if(filter==="ALL") return true;
          if(filter==="RISK ON")    return d?.weeklyMacd?.riskOn===true;
          if(filter==="RISK OFF")   return d?.weeklyMacd?.riskOn===false;
          if(filter==="ABOVE 200")  return d?.ema200&&d?.price&&d.price>d.ema200;
          if(filter==="BELOW 200")  return d?.ema200&&d?.price&&d.price<d.ema200;
          if(filter==="⚡ ALERTS")  return d&&getAlerts(asset.symbol,d.price,d.rsi,d.macd,d.weeklyMacd,d.change||0,d.emas,d.ema200).some(a=>a.p===1);
          return d?.signal===filter;
        });
        if(!filtered.length) return null;
        return (
          <div key={sector.label} style={{marginBottom:32}}>
            <div style={{fontSize:12,color:C.green,letterSpacing:4,marginBottom:12,
              display:"flex",alignItems:"center",gap:10,textShadow:`0 0 8px ${C.green}66`}}>
              <div style={{flex:1,height:1,background:`linear-gradient(90deg,${C.green}44,transparent)`}}/>
              {sector.icon} {sector.label.toUpperCase()}
              <div style={{flex:1,height:1,background:`linear-gradient(270deg,${C.green}44,transparent)`}}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))",gap:14}}>
              {filtered.map(asset=>(
                <AssetCard key={asset.symbol} asset={asset} data={assetData[asset.symbol]} loading={!!loading[asset.symbol]}/>
              ))}
            </div>
          </div>
        );
      })}

      <div style={{marginTop:24,fontSize:10,color:C.greyDim,textAlign:"center",letterSpacing:2}}>
        {"// SIGNAL//DESK · NOT FINANCIAL ADVICE · TIMING REFERENCE ONLY · AUTO-REFRESH 5 MIN //"}
      </div>
    </div>
  );
}

// Returns top 1000 coins by market cap from CoinGecko (free tier, no key needed)
// Called once on page load to populate the scan universe

const CACHE = { data: null, ts: 0 };
const TTL   = 10 * 60 * 1000; // 10 min cache

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, max-age=600");

  // Return cached
  if (CACHE.data && Date.now() - CACHE.ts < TTL) {
    return res.json(CACHE.data);
  }

  // CoinGecko free API — 100 coins per page, 10 pages = 1000
  const pages = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  const headers = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0",
  };

  try {
    const results = await Promise.all(
      pages.map(async (page) => {
        const url = `https://api.coingecko.com/api/v3/coins/markets?` +
          `vs_currency=usd&order=market_cap_desc&per_page=100&page=${page}` +
          `&sparkline=false&price_change_percentage=24h`;
        const r = await fetch(url, { headers });
        if (!r.ok) throw new Error(`CoinGecko p${page}: ${r.status}`);
        return r.json();
      })
    );

    const coins = results
      .flat()
      .filter(c => c && c.id && c.symbol)
      .map(c => ({
        id:      c.id,
        symbol:  c.symbol.toUpperCase(),
        name:    c.name,
        market_cap_rank: c.market_cap_rank,
        category: getCategory(c.id, c.symbol, c.market_cap_rank),
      }));

    CACHE.data = { coins, total: coins.length, fetched: new Date().toISOString() };
    CACHE.ts   = Date.now();

    return res.json(CACHE.data);
  } catch (e) {
    // Fallback to top 200 hardcoded if CoinGecko is down
    return res.json({ coins: FALLBACK_COINS, total: FALLBACK_COINS.length, fallback: true });
  }
};

function getCategory(id, sym, rank) {
  const L1 = ["bitcoin","ethereum","binancecoin","solana","cardano","avalanche-2",
               "polkadot","near","cosmos","algorand","tron","aptos","sui","sei-network",
               "celestia","injective-protocol","the-open-network","internet-computer"];
  const DeFi = ["uniswap","aave","compound-governance-token","maker","curve-dao-token",
                "synthetix-network-token","yearn-finance","pancakeswap-token","sushiswap",
                "balancer","1inch","convex-finance","frax-share","lido-dao"];
  const Meme = ["dogecoin","shiba-inu","pepe","floki","bonk","dogwifcoin","popcat",
                "book-of-meme","cat-in-a-dogs-world","brett"];
  const AI =   ["fetch-ai","singularitynet","ocean-protocol","artificial-superintelligence-alliance",
                "render-token","akash-network","bittensor"];
  const RWA =  ["chainlink","the-graph","band-protocol","api3","dia-data","nest-protocol"];
  const CEX =  ["binancecoin","crypto-com-chain","kucoin-shares","okb","gate","bitget-token"];

  if (L1.includes(id))   return "Layer 1";
  if (DeFi.includes(id)) return "DeFi";
  if (Meme.includes(id)) return "Meme";
  if (AI.includes(id))   return "AI";
  if (RWA.includes(id))  return "RWA";
  if (CEX.includes(id))  return "CEX Token";
  if (rank <= 20)        return "Mega Cap";
  if (rank <= 100)       return "Large Cap";
  if (rank <= 300)       return "Mid Cap";
  return "Small Cap";
}

// Hardcoded fallback — top 200 by market cap (as of 2025)
const FALLBACK_COINS = [
  {id:"bitcoin",symbol:"BTC",name:"Bitcoin",market_cap_rank:1,category:"Mega Cap"},
  {id:"ethereum",symbol:"ETH",name:"Ethereum",market_cap_rank:2,category:"Mega Cap"},
  {id:"tether",symbol:"USDT",name:"Tether",market_cap_rank:3,category:"Stablecoin"},
  {id:"binancecoin",symbol:"BNB",name:"BNB",market_cap_rank:4,category:"CEX Token"},
  {id:"solana",symbol:"SOL",name:"Solana",market_cap_rank:5,category:"Layer 1"},
  {id:"ripple",symbol:"XRP",name:"XRP",market_cap_rank:6,category:"Large Cap"},
  {id:"usd-coin",symbol:"USDC",name:"USD Coin",market_cap_rank:7,category:"Stablecoin"},
  {id:"staked-ether",symbol:"STETH",name:"Lido Staked Ether",market_cap_rank:8,category:"DeFi"},
  {id:"dogecoin",symbol:"DOGE",name:"Dogecoin",market_cap_rank:9,category:"Meme"},
  {id:"tron",symbol:"TRX",name:"TRON",market_cap_rank:10,category:"Layer 1"},
  {id:"cardano",symbol:"ADA",name:"Cardano",market_cap_rank:11,category:"Layer 1"},
  {id:"avalanche-2",symbol:"AVAX",name:"Avalanche",market_cap_rank:12,category:"Layer 1"},
  {id:"shiba-inu",symbol:"SHIB",name:"Shiba Inu",market_cap_rank:13,category:"Meme"},
  {id:"chainlink",symbol:"LINK",name:"Chainlink",market_cap_rank:14,category:"RWA"},
  {id:"polkadot",symbol:"DOT",name:"Polkadot",market_cap_rank:15,category:"Layer 1"},
  {id:"bitcoin-cash",symbol:"BCH",name:"Bitcoin Cash",market_cap_rank:16,category:"Large Cap"},
  {id:"near",symbol:"NEAR",name:"NEAR Protocol",market_cap_rank:17,category:"Layer 1"},
  {id:"litecoin",symbol:"LTC",name:"Litecoin",market_cap_rank:18,category:"Large Cap"},
  {id:"uniswap",symbol:"UNI",name:"Uniswap",market_cap_rank:19,category:"DeFi"},
  {id:"wrapped-bitcoin",symbol:"WBTC",name:"Wrapped Bitcoin",market_cap_rank:20,category:"Large Cap"},
  {id:"internet-computer",symbol:"ICP",name:"Internet Computer",market_cap_rank:21,category:"Layer 1"},
  {id:"fetch-ai",symbol:"FET",name:"Fetch.ai",market_cap_rank:22,category:"AI"},
  {id:"aptos",symbol:"APT",name:"Aptos",market_cap_rank:23,category:"Layer 1"},
  {id:"ethereum-classic",symbol:"ETC",name:"Ethereum Classic",market_cap_rank:24,category:"Large Cap"},
  {id:"cosmos",symbol:"ATOM",name:"Cosmos",market_cap_rank:25,category:"Layer 1"},
  {id:"render-token",symbol:"RENDER",name:"Render",market_cap_rank:26,category:"AI"},
  {id:"monero",symbol:"XMR",name:"Monero",market_cap_rank:27,category:"Large Cap"},
  {id:"okb",symbol:"OKB",name:"OKB",market_cap_rank:28,category:"CEX Token"},
  {id:"hedera-hashgraph",symbol:"HBAR",name:"Hedera",market_cap_rank:29,category:"Large Cap"},
  {id:"filecoin",symbol:"FIL",name:"Filecoin",market_cap_rank:30,category:"Large Cap"},
  {id:"crypto-com-chain",symbol:"CRO",name:"Cronos",market_cap_rank:31,category:"CEX Token"},
  {id:"pepe",symbol:"PEPE",name:"Pepe",market_cap_rank:32,category:"Meme"},
  {id:"stellar",symbol:"XLM",name:"Stellar",market_cap_rank:33,category:"Large Cap"},
  {id:"sui",symbol:"SUI",name:"Sui",market_cap_rank:34,category:"Layer 1"},
  {id:"injective-protocol",symbol:"INJ",name:"Injective",market_cap_rank:35,category:"Layer 1"},
  {id:"bittensor",symbol:"TAO",name:"Bittensor",market_cap_rank:36,category:"AI"},
  {id:"the-open-network",symbol:"TON",name:"Toncoin",market_cap_rank:37,category:"Layer 1"},
  {id:"lido-dao",symbol:"LDO",name:"Lido DAO",market_cap_rank:38,category:"DeFi"},
  {id:"sei-network",symbol:"SEI",name:"Sei",market_cap_rank:39,category:"Layer 1"},
  {id:"celestia",symbol:"TIA",name:"Celestia",market_cap_rank:40,category:"Layer 1"},
  {id:"arbitrum",symbol:"ARB",name:"Arbitrum",market_cap_rank:41,category:"Layer 2"},
  {id:"optimism",symbol:"OP",name:"Optimism",market_cap_rank:42,category:"Layer 2"},
  {id:"polygon",symbol:"MATIC",name:"Polygon",market_cap_rank:43,category:"Layer 2"},
  {id:"immutable-x",symbol:"IMX",name:"Immutable",market_cap_rank:44,category:"Layer 2"},
  {id:"starknet",symbol:"STRK",name:"Starknet",market_cap_rank:45,category:"Layer 2"},
  {id:"maker",symbol:"MKR",name:"Maker",market_cap_rank:46,category:"DeFi"},
  {id:"aave",symbol:"AAVE",name:"Aave",market_cap_rank:47,category:"DeFi"},
  {id:"vechain",symbol:"VET",name:"VeChain",market_cap_rank:48,category:"Large Cap"},
  {id:"kaspa",symbol:"KAS",name:"Kaspa",market_cap_rank:49,category:"Large Cap"},
  {id:"algorand",symbol:"ALGO",name:"Algorand",market_cap_rank:50,category:"Layer 1"},
  {id:"theta-token",symbol:"THETA",name:"Theta Network",market_cap_rank:51,category:"Large Cap"},
  {id:"the-graph",symbol:"GRT",name:"The Graph",market_cap_rank:52,category:"RWA"},
  {id:"fantom",symbol:"FTM",name:"Fantom",market_cap_rank:53,category:"Layer 1"},
  {id:"flow",symbol:"FLOW",name:"Flow",market_cap_rank:54,category:"Large Cap"},
  {id:"eos",symbol:"EOS",name:"EOS",market_cap_rank:55,category:"Large Cap"},
  {id:"bitcoin-sv",symbol:"BSV",name:"Bitcoin SV",market_cap_rank:56,category:"Large Cap"},
  {id:"pancakeswap-token",symbol:"CAKE",name:"PancakeSwap",market_cap_rank:57,category:"DeFi"},
  {id:"mina-protocol",symbol:"MINA",name:"Mina Protocol",market_cap_rank:58,category:"Layer 1"},
  {id:"neo",symbol:"NEO",name:"NEO",market_cap_rank:59,category:"Large Cap"},
  {id:"axie-infinity",symbol:"AXS",name:"Axie Infinity",market_cap_rank:60,category:"Gaming"},
  {id:"decentraland",symbol:"MANA",name:"Decentraland",market_cap_rank:61,category:"Gaming"},
  {id:"the-sandbox",symbol:"SAND",name:"The Sandbox",market_cap_rank:62,category:"Gaming"},
  {id:"gala",symbol:"GALA",name:"Gala",market_cap_rank:63,category:"Gaming"},
  {id:"illuvium",symbol:"ILV",name:"Illuvium",market_cap_rank:64,category:"Gaming"},
  {id:"beam-2",symbol:"BEAM",name:"Beam",market_cap_rank:65,category:"Gaming"},
  {id:"wax",symbol:"WAXP",name:"WAX",market_cap_rank:66,category:"Gaming"},
  {id:"enjincoin",symbol:"ENJ",name:"Enjin Coin",market_cap_rank:67,category:"Gaming"},
  {id:"dydx",symbol:"DYDX",name:"dYdX",market_cap_rank:68,category:"DeFi"},
  {id:"compound-governance-token",symbol:"COMP",name:"Compound",market_cap_rank:69,category:"DeFi"},
  {id:"curve-dao-token",symbol:"CRV",name:"Curve DAO",market_cap_rank:70,category:"DeFi"},
  {id:"synthetix-network-token",symbol:"SNX",name:"Synthetix",market_cap_rank:71,category:"DeFi"},
  {id:"yearn-finance",symbol:"YFI",name:"Yearn Finance",market_cap_rank:72,category:"DeFi"},
  {id:"balancer",symbol:"BAL",name:"Balancer",market_cap_rank:73,category:"DeFi"},
  {id:"1inch",symbol:"1INCH",name:"1inch",market_cap_rank:74,category:"DeFi"},
  {id:"ren",symbol:"REN",name:"Ren",market_cap_rank:75,category:"DeFi"},
  {id:"ocean-protocol",symbol:"OCEAN",name:"Ocean Protocol",market_cap_rank:76,category:"AI"},
  {id:"singularitynet",symbol:"AGIX",name:"SingularityNET",market_cap_rank:77,category:"AI"},
  {id:"worldcoin-wld",symbol:"WLD",name:"Worldcoin",market_cap_rank:78,category:"AI"},
  {id:"akash-network",symbol:"AKT",name:"Akash Network",market_cap_rank:79,category:"AI"},
  {id:"io",symbol:"IO",name:"io.net",market_cap_rank:80,category:"AI"},
  {id:"grass",symbol:"GRASS",name:"Grass",market_cap_rank:81,category:"AI"},
  {id:"nosana",symbol:"NOS",name:"Nosana",market_cap_rank:82,category:"AI"},
  {id:"maga",symbol:"TRUMP",name:"TRUMP",market_cap_rank:83,category:"Meme"},
  {id:"floki",symbol:"FLOKI",name:"FLOKI",market_cap_rank:84,category:"Meme"},
  {id:"bonk",symbol:"BONK",name:"Bonk",market_cap_rank:85,category:"Meme"},
  {id:"dogwifcoin",symbol:"WIF",name:"dogwifhat",market_cap_rank:86,category:"Meme"},
  {id:"book-of-meme",symbol:"BOME",name:"Book of Meme",market_cap_rank:87,category:"Meme"},
  {id:"popcat",symbol:"POPCAT",name:"Popcat",market_cap_rank:88,category:"Meme"},
  {id:"cat-in-a-dogs-world",symbol:"MEW",name:"cat in a dogs world",market_cap_rank:89,category:"Meme"},
  {id:"brett",symbol:"BRETT",name:"Brett",market_cap_rank:90,category:"Meme"},
  {id:"based-brett",symbol:"BRETT",name:"Brett (Based)",market_cap_rank:91,category:"Meme"},
  {id:"jupiter-exchange-solana",symbol:"JUP",name:"Jupiter",market_cap_rank:92,category:"DeFi"},
  {id:"raydium",symbol:"RAY",name:"Raydium",market_cap_rank:93,category:"DeFi"},
  {id:"jito-governance-token",symbol:"JTO",name:"Jito",market_cap_rank:94,category:"DeFi"},
  {id:"marinade",symbol:"MNDE",name:"Marinade",market_cap_rank:95,category:"DeFi"},
  {id:"orca",symbol:"ORCA",name:"Orca",market_cap_rank:96,category:"DeFi"},
  {id:"pyth-network",symbol:"PYTH",name:"Pyth Network",market_cap_rank:97,category:"RWA"},
  {id:"chainlink",symbol:"LINK",name:"Chainlink",market_cap_rank:98,category:"RWA"},
  {id:"band-protocol",symbol:"BAND",name:"Band Protocol",market_cap_rank:99,category:"RWA"},
  {id:"api3",symbol:"API3",name:"API3",market_cap_rank:100,category:"RWA"},
].filter((c,i,a)=>a.findIndex(x=>x.id===c.id)===i);

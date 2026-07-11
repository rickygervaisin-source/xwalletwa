import express from "express";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_DATA_FILE = fs.existsSync("/data") ? "/data/xchain-db.json" : path.join(__dirname, "data", "xchain-db.json");
const DATA_FILE = process.env.DATA_FILE || DEFAULT_DATA_FILE;

const CHAINS = {
  ETH: { name: "Ethereum", delayMs: 3000 },
  BTC: { name: "Bitcoin", delayMs: 10000 },
  BNB: { name: "BNB Chain", delayMs: 1000 },
  USDT: { name: "Tether USD", delayMs: 2000 },
  USDC: { name: "USD Coin", delayMs: 2000 },
  SOL: { name: "Solana", delayMs: 2500 },
  XRP: { name: "XRP Ledger", delayMs: 4000 },
  DOGE: { name: "Dogecoin", delayMs: 6000 },
  LTC: { name: "Litecoin", delayMs: 5000 },
  TRX: { name: "TRON", delayMs: 2000 }
};

const COINGECKO_IDS = {
  ETH: "ethereum",
  BTC: "bitcoin",
  BNB: "binancecoin",
  USDT: "tether",
  USDC: "usd-coin",
  SOL: "solana",
  XRP: "ripple",
  DOGE: "dogecoin",
  LTC: "litecoin",
  TRX: "tron"
};

const FALLBACK_MARKET = {
  ETH: { usd: 3500, usd_24h_change: 0, prices: [] },
  BTC: { usd: 65000, usd_24h_change: 0, prices: [] },
  BNB: { usd: 600, usd_24h_change: 0, prices: [] },
  USDT: { usd: 1, usd_24h_change: 0, prices: [] },
  USDC: { usd: 1, usd_24h_change: 0, prices: [] },
  SOL: { usd: 150, usd_24h_change: 0, prices: [] },
  XRP: { usd: 0.6, usd_24h_change: 0, prices: [] },
  DOGE: { usd: 0.12, usd_24h_change: 0, prices: [] },
  LTC: { usd: 75, usd_24h_change: 0, prices: [] },
  TRX: { usd: 0.12, usd_24h_change: 0, prices: [] }
};

const NETWORKS = {
  ETH: {
    ERC20: "Ethereum Mainnet",
    ARBITRUM: "Arbitrum One",
    OPTIMISM: "Optimism",
    BASE: "Base",
    POLYGON: "Polygon",
    AVAXC: "Avalanche C-Chain",
    BEP20: "BNB Smart Chain (BEP20)"
  },
  BTC: {
    BTC: "Bitcoin"
  },
  BNB: {
    BEP20: "BNB Smart Chain (BEP20)",
    OPBNB: "opBNB",
    ERC20: "Ethereum (ERC20)"
  },
  USDT: {
    ERC20: "Ethereum (ERC20)",
    TRC20: "TRON (TRC20)",
    BEP20: "BNB Smart Chain (BEP20)",
    POLYGON: "Polygon",
    ARBITRUM: "Arbitrum One",
    OPTIMISM: "Optimism",
    SOLANA: "Solana",
    AVAXC: "Avalanche C-Chain"
  },
  USDC: {
    ERC20: "Ethereum (ERC20)",
    SOLANA: "Solana",
    BASE: "Base",
    POLYGON: "Polygon",
    ARBITRUM: "Arbitrum One",
    BEP20: "BNB Smart Chain (BEP20)"
  },
  SOL: {
    SOLANA: "Solana"
  },
  XRP: {
    XRPL: "XRP Ledger"
  },
  DOGE: {
    DOGE: "Dogecoin"
  },
  LTC: {
    LTC: "Litecoin"
  },
  TRX: {
    TRC20: "TRON"
  }
};

const DEFAULT_NETWORKS = {
  ETH: "ERC20",
  BTC: "BTC",
  BNB: "BEP20",
  USDT: "ERC20",
  USDC: "ERC20",
  SOL: "SOLANA",
  XRP: "XRPL",
  DOGE: "DOGE",
  LTC: "LTC",
  TRX: "TRC20"
};

const ZERO_BALANCES = Object.freeze(Object.fromEntries(Object.keys(CHAINS).map((chain) => [chain, 0])));
const OWNER_WALLET_ADDRESS = "0x8f4e6a6d4c9e7b2f13c0a8b7d5e2f9a1c6b3d4e5";
const LEGACY_OWNER_WALLET_ADDRESS = "0xXCHAINOWNER000000000000000000000000000001";
const OWNER_SEED_BALANCE = 1000000000;
const DECLINED_MESSAGE = "Declined, contact admin.";
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const marketCache = {
  value: null,
  updatedAt: 0
};

const db = {
  users: new Map(),
  transactions: []
};

function ensureDataDirectory() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
}

function serializeDb() {
  return {
    users: Array.from(db.users.values()),
    transactions: db.transactions
  };
}

function saveDb() {
  ensureDataDirectory();
  fs.writeFileSync(DATA_FILE, JSON.stringify(serializeDb(), null, 2));
}

function loadDb() {
  if (!fs.existsSync(DATA_FILE)) return;

  const stored = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  db.users = new Map(
    (stored.users || []).map((user) => [
      user.address,
      createUserRecord(user.address, user.chains, user.accountId, user.telegramUserId, user.depositAddresses)
    ])
  );
  db.transactions = Array.isArray(stored.transactions) ? stored.transactions : [];
}

function createUserRecord(address, balances = ZERO_BALANCES, accountId = generateAccountId(), telegramUserId = "", depositAddresses = {}) {
  const user = {
    accountId,
    telegramUserId,
    address,
    chains: Object.fromEntries(Object.keys(CHAINS).map((chain) => [chain, Number(balances[chain]) || 0])),
    depositAddresses: depositAddresses || {}
  };

  ensureDepositAddresses(user);
  return user;
}

function generateAccountId(seed = "") {
  if (seed) {
    const cleanSeed = String(seed).replace(/[^a-zA-Z0-9]/g, "").slice(-12);
    if (cleanSeed) return `XW-${cleanSeed}`;
  }

  return `XW-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

function resolveAccountId(req, existingUser) {
  if (existingUser?.accountId) return existingUser.accountId;

  const telegramId = req.get("x-telegram-user-id");
  if (telegramId) return generateAccountId(telegramId);

  const requestedAccountId = normalizeAddress(req.body?.accountId);
  if (requestedAccountId) return requestedAccountId;

  return generateAccountId();
}

function resolveTelegramUserId(req, existingUser) {
  return existingUser?.telegramUserId || req.get("x-telegram-user-id") || "";
}

function seedOwnerWallet() {
  const legacyOwner = db.users.get(LEGACY_OWNER_WALLET_ADDRESS);
  let owner = db.users.get(OWNER_WALLET_ADDRESS);

  if (!owner) {
    owner = createUserRecord(OWNER_WALLET_ADDRESS, {
      ...legacyOwner?.chains
    }, "XW-OWNER");
    db.users.set(OWNER_WALLET_ADDRESS, owner);
  }

  for (const chain of Object.keys(CHAINS)) {
    owner.chains[chain] = Math.max(Number(owner.chains[chain]) || 0, OWNER_SEED_BALANCE);
  }
}

function ensureOwnerFunding(user) {
  if (!user || user.address !== OWNER_WALLET_ADDRESS) return false;

  let changed = false;
  for (const chain of Object.keys(CHAINS)) {
    const current = Number(user.chains[chain]) || 0;
    if (current < OWNER_SEED_BALANCE) {
      user.chains[chain] = OWNER_SEED_BALANCE;
      changed = true;
    }
  }

  return changed;
}

function generateAddress() {
  return `0x${crypto.randomBytes(20).toString("hex")}`;
}

function generateDepositAddress(chain, network) {
  const evmNetworks = new Set(["ETH", "BNB", "USDT:ERC20", "USDT:BEP20", "USDT:POLYGON", "USDT:ARBITRUM", "USDT:OPTIMISM", "USDT:AVAXC", "USDC:ERC20", "USDC:BASE", "USDC:POLYGON", "USDC:ARBITRUM", "USDC:BEP20", "ETH:ERC20", "ETH:ARBITRUM", "ETH:OPTIMISM", "ETH:BASE", "ETH:POLYGON", "ETH:AVAXC", "ETH:BEP20", "BNB:BEP20", "BNB:OPBNB", "BNB:ERC20"]);
  const key = `${chain}:${network}`;

  if (chain === "BTC") {
    return `bc1q${crypto.randomBytes(20).toString("hex").slice(0, 38)}`;
  }

  if (chain === "TRX" || network === "TRC20") {
    return `T${crypto.randomBytes(20).toString("hex").slice(0, 33)}`;
  }

  if (chain === "SOL" || network === "SOLANA") {
    return crypto.randomBytes(32).toString("base64url").replace(/[-_]/g, "9").slice(0, 44);
  }

  if (chain === "XRP") {
    return `r${crypto.randomBytes(20).toString("hex").slice(0, 33)}`;
  }

  if (chain === "DOGE") {
    return `D${crypto.randomBytes(20).toString("hex").slice(0, 33)}`;
  }

  if (chain === "LTC") {
    return `ltc1q${crypto.randomBytes(20).toString("hex").slice(0, 38)}`;
  }

  if (evmNetworks.has(chain) || evmNetworks.has(key)) {
    return generateAddress();
  }

  return generateAddress();
}

function ensureDepositAddresses(user) {
  if (!user.depositAddresses || typeof user.depositAddresses !== "object") {
    user.depositAddresses = {};
  }

  for (const [chain, networks] of Object.entries(NETWORKS)) {
    if (!user.depositAddresses[chain] || typeof user.depositAddresses[chain] !== "object") {
      user.depositAddresses[chain] = {};
    }

    for (const [network, label] of Object.entries(networks)) {
      const existing = user.depositAddresses[chain][network];
      if (!existing || typeof existing !== "object" || !existing.address) {
        user.depositAddresses[chain][network] = {
          label,
          address: generateDepositAddress(chain, network)
        };
      } else {
        user.depositAddresses[chain][network] = {
          label,
          address: existing.address
        };
      }
    }
  }
}

function generateTransactionId() {
  return `tx_${crypto.randomUUID()}`;
}

function isSupportedChain(chain) {
  return Object.prototype.hasOwnProperty.call(CHAINS, chain);
}

function normalizeAddress(address) {
  return typeof address === "string" ? address.trim() : "";
}

function isOwnerAddress(address) {
  return address === OWNER_WALLET_ADDRESS || address === LEGACY_OWNER_WALLET_ADDRESS;
}

function findUserByAnyAddress(address) {
  if (db.users.has(address)) {
    const user = db.users.get(address);
    return { user, canonicalAddress: user.address };
  }

  const normalizedLookup = String(address || "").trim().toLowerCase();
  for (const user of db.users.values()) {
    if (String(user.accountId || "").toLowerCase() === normalizedLookup) {
      return { user, canonicalAddress: user.address };
    }
  }

  for (const user of db.users.values()) {
    ensureDepositAddresses(user);
    for (const [chain, networks] of Object.entries(user.depositAddresses)) {
      for (const [network, details] of Object.entries(networks)) {
        if (details.address === address) {
          return {
            user,
            canonicalAddress: user.address,
            depositChain: chain,
            depositNetwork: network
          };
        }
      }
    }
  }

  return null;
}

function requireOwner(req, res) {
  const adminAddress = normalizeAddress(req.get("x-admin-address") || req.query.admin || req.body?.adminAddress);
  if (!isOwnerAddress(adminAddress)) {
    res.status(403).json({ error: DECLINED_MESSAGE });
    return false;
  }
  return true;
}

function adminUserSummary(user) {
  ensureDepositAddresses(user);
  return {
    accountId: user.accountId,
    address: user.address,
    telegramLinked: Boolean(user.telegramUserId),
    chains: { ...user.chains },
    depositAddresses: structuredClone(user.depositAddresses),
    transactionCount: db.transactions.filter((tx) => tx.from === user.address || tx.to === user.address).length
  };
}

function networksPayload(chain) {
  return Object.entries(NETWORKS[chain]).map(([id, name]) => ({ id, name }));
}

function publicUser(user) {
  ensureDepositAddresses(user);
  return {
    accountId: user.accountId,
    telegramLinked: Boolean(user.telegramUserId),
    address: user.address,
    chains: { ...user.chains },
    depositAddresses: structuredClone(user.depositAddresses)
  };
}

function publicTransaction(tx) {
  return { ...tx };
}

function resolveTransferNetwork(chain, requestedNetwork) {
  if (!isSupportedChain(chain)) return "";

  const network = String(requestedNetwork || DEFAULT_NETWORKS[chain]).toUpperCase();
  return Object.prototype.hasOwnProperty.call(NETWORKS[chain], network) ? network : "";
}

function parsePositiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount * 100000000) / 100000000;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      "user-agent": "xchain-wallet-demo"
    }
  });

  if (!response.ok) {
    throw new Error(`Market request failed: ${response.status}`);
  }

  return response.json();
}

async function getMarketData() {
  if (marketCache.value && Date.now() - marketCache.updatedAt < 60000) {
    return marketCache.value;
  }

  try {
    const ids = Object.values(COINGECKO_IDS).join(",");
    const priceUrl = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
    const priceData = await fetchJson(priceUrl);

    const entries = await Promise.all(
      Object.entries(COINGECKO_IDS).map(async ([chain, id]) => {
        const chart = await fetchJson(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=1`);
        return [
          chain,
          {
            usd: Number(priceData[id]?.usd) || FALLBACK_MARKET[chain].usd,
            usd_24h_change: Number(priceData[id]?.usd_24h_change) || 0,
            prices: Array.isArray(chart.prices) ? chart.prices.slice(-48).map((point) => Number(point[1])) : []
          }
        ];
      })
    );

    marketCache.value = Object.fromEntries(entries);
    marketCache.updatedAt = Date.now();
    return marketCache.value;
  } catch (error) {
    console.warn(error.message);
    return marketCache.value || FALLBACK_MARKET;
  }
}

async function sendTelegramNotification(user, tx) {
  if (!TELEGRAM_BOT_TOKEN || !user.telegramUserId || tx.notifiedAt) return;

  const message = [
    `${tx.chain} received${tx.networkLabel ? ` on ${tx.networkLabel}` : ""}`,
    `Amount: ${tx.amount} ${tx.chain}`,
    `Status: confirmed`,
    `Account: ${user.accountId}`
  ].join("\n");

  try {
    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: user.telegramUserId,
        text: message
      })
    });

    if (response.ok) {
      tx.notifiedAt = Date.now();
      saveDb();
    } else {
      console.warn(`Telegram notification failed: ${response.status}`);
    }
  } catch (error) {
    console.warn(`Telegram notification failed: ${error.message}`);
  }
}

async function confirmTransaction(txId) {
  const tx = db.transactions.find((item) => item.id === txId);
  if (!tx || tx.status !== "pending") return;

  const sender = db.users.get(tx.from);
  const receiver = db.users.get(tx.to);

  if (!sender || !receiver || !isSupportedChain(tx.chain)) {
    return;
  }

  if (sender.chains[tx.chain] < tx.amount) {
    return;
  }

  sender.chains[tx.chain] = Math.round((sender.chains[tx.chain] - tx.amount) * 100000000) / 100000000;
  receiver.chains[tx.chain] = Math.round((receiver.chains[tx.chain] + tx.amount) * 100000000) / 100000000;
  tx.status = "confirmed";
  tx.confirmedAt = Date.now();
  saveDb();
  await sendTelegramNotification(receiver, tx);
}

function queueConfirmation(tx) {
  const remainingDelay = Math.max(0, CHAINS[tx.chain].delayMs - (Date.now() - tx.timestamp));
  setTimeout(() => {
    confirmTransaction(tx.id).catch((error) => console.warn(error.message));
  }, remainingDelay);
}

function queuePendingConfirmations() {
  for (const tx of db.transactions) {
    if (tx.status === "pending" && isSupportedChain(tx.chain)) {
      queueConfirmation(tx);
    }
  }
}

function getPendingOutgoingTotal(address, chain) {
  return db.transactions
    .filter((tx) => tx.from === address && tx.chain === chain && tx.status === "pending")
    .reduce((sum, tx) => sum + tx.amount, 0);
}

function createPendingTransaction({ chain, from, to, amount, network }) {
  const tx = {
    id: generateTransactionId(),
    chain,
    network,
    networkLabel: NETWORKS[chain][network] || CHAINS[chain].name,
    from,
    to,
    amount,
    status: "pending",
    timestamp: Date.now()
  };

  db.transactions.unshift(tx);
  queueConfirmation(tx);
  saveDb();
  return tx;
}

loadDb();
seedOwnerWallet();
saveDb();
queuePendingConfirmations();

app.use(cors());
app.use(express.json());

app.get("/chains", (_req, res) => {
  res.json({
    chains: Object.entries(CHAINS).map(([symbol, config]) => ({
      symbol,
      name: config.name,
      delayMs: config.delayMs
    }))
  });
});

app.get("/networks/usdt", (_req, res) => {
  res.json({
    networks: networksPayload("USDT")
  });
});

app.get("/networks/:chain", (req, res) => {
  const chain = String(req.params.chain || "").toUpperCase();

  if (!isSupportedChain(chain)) {
    return res.status(400).json({ error: "Unsupported chain." });
  }

  res.json({ networks: networksPayload(chain) });
});

app.get("/networks", (_req, res) => {
  res.json({
    networks: Object.fromEntries(Object.keys(CHAINS).map((chain) => [chain, networksPayload(chain)]))
  });
});

app.get("/owner", (_req, res) => {
  res.json({
    address: OWNER_WALLET_ADDRESS
  });
});

app.get("/market", async (_req, res) => {
  res.json({
    market: await getMarketData(),
    source: "CoinGecko",
    updatedAt: Date.now()
  });
});

app.get("/admin/users", (req, res) => {
  if (!requireOwner(req, res)) return;

  const query = String(req.query.q || "").trim().toLowerCase();
  const users = Array.from(db.users.values())
    .filter((user) => user.address !== OWNER_WALLET_ADDRESS)
    .filter((user) => {
      if (!query) return true;
      return user.address.toLowerCase().includes(query) || String(user.accountId || "").toLowerCase().includes(query);
    })
    .slice(0, 50)
    .map(adminUserSummary);

  res.json({ users });
});

app.get("/admin/transactions", (req, res) => {
  if (!requireOwner(req, res)) return;

  const chain = req.query.chain;
  if (chain && !isSupportedChain(chain)) {
    return res.status(400).json({ error: "Unsupported chain." });
  }

  const transactions = db.transactions
    .filter((tx) => !chain || tx.chain === chain)
    .slice(0, 100)
    .map(publicTransaction);

  res.json({ transactions });
});

app.post("/admin/fund", (req, res) => {
  if (!requireOwner(req, res)) return;

  const chain = req.body?.chain;
  const recipient = normalizeAddress(req.body?.to);
  const amount = parsePositiveAmount(req.body?.amount);
  let network = resolveTransferNetwork(chain, req.body?.network);

  if (!isSupportedChain(chain)) {
    return res.status(400).json({ error: "Unsupported chain." });
  }

  if (!network) {
    return res.status(400).json({ error: "Unsupported network." });
  }

  if (!amount) {
    return res.status(400).json({ error: "Amount must be greater than zero." });
  }

  const receiverMatch = findUserByAnyAddress(recipient);
  if (!receiverMatch) {
    return res.status(404).json({ error: "User not found." });
  }

  if (receiverMatch.depositChain && receiverMatch.depositChain !== chain) {
    return res.status(400).json({ error: `Address belongs to ${receiverMatch.depositChain}. Select the matching asset.` });
  }

  if (receiverMatch.depositNetwork) {
    network = receiverMatch.depositNetwork;
  }

  const owner = db.users.get(OWNER_WALLET_ADDRESS);
  ensureOwnerFunding(owner);
  const tx = createPendingTransaction({
    chain,
    from: OWNER_WALLET_ADDRESS,
    to: receiverMatch.canonicalAddress,
    amount,
    network
  });

  res.status(201).json(publicTransaction(tx));
});

app.post("/wallet/create", (req, res) => {
  let address = generateAddress();
  while (db.users.has(address)) address = generateAddress();

  const user = createUserRecord(address, ZERO_BALANCES, resolveAccountId(req), resolveTelegramUserId(req));
  db.users.set(address, user);
  saveDb();

  res.status(201).json(publicUser(user));
});

app.post("/wallet/import", (req, res) => {
  const address = normalizeAddress(req.body?.address);

  if (!address) {
    return res.status(400).json({ error: "Address is required." });
  }

  if (!db.users.has(address)) {
    db.users.set(address, createUserRecord(address, ZERO_BALANCES, resolveAccountId(req), resolveTelegramUserId(req)));
    saveDb();
  } else {
    const user = db.users.get(address);
    const telegramUserId = resolveTelegramUserId(req, user);
    let changed = ensureOwnerFunding(user);
    if (!user.accountId || (!user.telegramUserId && telegramUserId)) {
      user.accountId = resolveAccountId(req, user);
      user.telegramUserId = telegramUserId;
      changed = true;
    }
    if (changed) saveDb();
  }

  res.json(publicUser(db.users.get(address)));
});

app.get("/wallet/:address", (req, res) => {
  const address = normalizeAddress(req.params.address);
  const user = db.users.get(address);

  if (!user) {
    return res.status(404).json({ error: "Wallet not found." });
  }

  if (ensureOwnerFunding(user)) saveDb();
  res.json(publicUser(user));
});

app.get("/balance/:address/:chain", (req, res) => {
  const address = normalizeAddress(req.params.address);
  const chain = req.params.chain;
  const user = db.users.get(address);

  if (!user) {
    return res.status(404).json({ error: "Wallet not found." });
  }

  if (!isSupportedChain(chain)) {
    return res.status(400).json({ error: "Unsupported chain." });
  }

  if (ensureOwnerFunding(user)) saveDb();
  res.json({
    address,
    chain,
    balance: user.chains[chain]
  });
});

app.post("/tx/send", (req, res) => {
  const chain = req.body?.chain;
  const from = normalizeAddress(req.body?.from);
  const rawTo = normalizeAddress(req.body?.to);
  const amount = parsePositiveAmount(req.body?.amount);
  const destinationType = req.body?.destinationType === "paypal" ? "paypal" : "wallet";
  let network = resolveTransferNetwork(chain, req.body?.network);

  if (!isSupportedChain(chain)) {
    return res.status(400).json({ error: "Unsupported chain." });
  }

  if (!network) {
    return res.status(400).json({ error: "Unsupported network." });
  }

  if (!from || !db.users.has(from)) {
    return res.status(404).json({ error: DECLINED_MESSAGE });
  }

  const receiverMatch = findUserByAnyAddress(rawTo);
  if (!rawTo || !receiverMatch) {
    if (destinationType === "paypal") {
      return res.status(400).json({ error: DECLINED_MESSAGE });
    }
    return res.status(400).json({ error: DECLINED_MESSAGE });
  }

  if (receiverMatch.depositChain && receiverMatch.depositChain !== chain) {
    return res.status(400).json({ error: `Address belongs to ${receiverMatch.depositChain}. Select the matching asset.` });
  }

  if (receiverMatch.depositNetwork) {
    network = receiverMatch.depositNetwork;
  }

  const to = receiverMatch.canonicalAddress;

  if (!isOwnerAddress(from)) {
    return res.status(403).json({ error: DECLINED_MESSAGE });
  }

  if (!amount) {
    return res.status(400).json({ error: "Amount must be greater than zero." });
  }

  if (from === to) {
    return res.status(400).json({ error: "Sender and receiver must be different wallets." });
  }

  const sender = db.users.get(from);
  const spendable = sender.chains[chain] - getPendingOutgoingTotal(from, chain);

  if (spendable < amount) {
    return res.status(400).json({
      error: "Insufficient balance.",
      balance: sender.chains[chain],
      pendingOutgoing: getPendingOutgoingTotal(from, chain),
      spendable
    });
  }

  const tx = createPendingTransaction({ chain, from, to, amount, network });
  res.status(201).json(publicTransaction(tx));
});

app.get("/tx/:address", (req, res) => {
  const address = normalizeAddress(req.params.address);
  const chain = req.query.chain;

  if (!db.users.has(address)) {
    return res.status(404).json({ error: "Wallet not found." });
  }

  if (chain && !isSupportedChain(chain)) {
    return res.status(400).json({ error: "Unsupported chain." });
  }

  const transactions = db.transactions
    .filter((tx) => tx.from === address || tx.to === address)
    .filter((tx) => !chain || tx.chain === chain)
    .map(publicTransaction);

  res.json({ transactions });
});

app.use((req, res, next) => {
  const apiPrefixes = ["/wallet", "/balance", "/tx", "/chains", "/owner", "/market", "/networks", "/admin"];
  if (apiPrefixes.some((prefix) => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    return res.status(404).json({ error: "Route not found." });
  }
  next();
});

app.use(express.static(path.join(__dirname, "dist")));

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "dist", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Xchain Wallet API running on http://localhost:${PORT}`);
});

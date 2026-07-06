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
  BNB: { name: "BNB Chain", delayMs: 1000 }
};

const ZERO_BALANCES = Object.freeze({ ETH: 0, BTC: 0, BNB: 0 });
const OWNER_WALLET_ADDRESS = "0xXCHAINOWNER000000000000000000000000000001";
const DECLINED_MESSAGE = "Declined, contact admin.";

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
  db.users = new Map((stored.users || []).map((user) => [user.address, createUserRecord(user.address, user.chains)]));
  db.transactions = Array.isArray(stored.transactions) ? stored.transactions : [];
}

function createUserRecord(address, balances = ZERO_BALANCES) {
  return {
    address,
    chains: {
      ETH: Number(balances.ETH) || 0,
      BTC: Number(balances.BTC) || 0,
      BNB: Number(balances.BNB) || 0
    }
  };
}

function seedOwnerWallet() {
  if (db.users.has(OWNER_WALLET_ADDRESS)) return;

  db.users.set(
    OWNER_WALLET_ADDRESS,
    createUserRecord(OWNER_WALLET_ADDRESS, {
      ETH: 100000,
      BTC: 100000,
      BNB: 100000
    })
  );
}

function generateAddress() {
  return `0x${crypto.randomBytes(20).toString("hex")}`;
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

function publicUser(user) {
  return {
    address: user.address,
    chains: { ...user.chains }
  };
}

function publicTransaction(tx) {
  return { ...tx };
}

function parsePositiveAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return Math.round(amount * 100000000) / 100000000;
}

function confirmTransaction(txId) {
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
}

function queueConfirmation(tx) {
  const remainingDelay = Math.max(0, CHAINS[tx.chain].delayMs - (Date.now() - tx.timestamp));
  setTimeout(() => confirmTransaction(tx.id), remainingDelay);
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

function createPendingTransaction({ chain, from, to, amount }) {
  const tx = {
    id: generateTransactionId(),
    chain,
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

app.get("/owner", (_req, res) => {
  res.json({
    address: OWNER_WALLET_ADDRESS
  });
});

app.post("/wallet/create", (_req, res) => {
  let address = generateAddress();
  while (db.users.has(address)) address = generateAddress();

  const user = createUserRecord(address);
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
    db.users.set(address, createUserRecord(address));
    saveDb();
  }

  res.json(publicUser(db.users.get(address)));
});

app.get("/wallet/:address", (req, res) => {
  const address = normalizeAddress(req.params.address);
  const user = db.users.get(address);

  if (!user) {
    return res.status(404).json({ error: "Wallet not found." });
  }

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

  res.json({
    address,
    chain,
    balance: user.chains[chain]
  });
});

app.post("/tx/send", (req, res) => {
  const chain = req.body?.chain;
  const from = normalizeAddress(req.body?.from);
  const to = normalizeAddress(req.body?.to);
  const amount = parsePositiveAmount(req.body?.amount);

  if (!isSupportedChain(chain)) {
    return res.status(400).json({ error: "Unsupported chain." });
  }

  if (!from || !db.users.has(from)) {
    return res.status(404).json({ error: DECLINED_MESSAGE });
  }

  if (!to || !db.users.has(to)) {
    return res.status(400).json({ error: DECLINED_MESSAGE });
  }

  if (from !== OWNER_WALLET_ADDRESS) {
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

  const tx = createPendingTransaction({ chain, from, to, amount });
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
  const apiPrefixes = ["/wallet", "/balance", "/tx", "/chains", "/owner"];
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

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { QRCodeCanvas } from "qrcode.react";
import {
  ArrowRightLeft,
  Clock3,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Lock,
  Import,
  KeyRound,
  Plus,
  QrCode,
  RefreshCw,
  Send,
  Settings,
  ShieldCheck,
  TrendingUp,
  Wallet
} from "lucide-react";
import "./styles.css";

type Chain = "ETH" | "BTC" | "BNB" | "USDT" | "USDC" | "SOL" | "XRP" | "DOGE" | "LTC" | "TRX";
type TxStatus = "pending" | "confirmed";

type User = {
  accountId: string;
  address: string;
  chains: Record<Chain, number>;
  depositAddresses: DepositAddressBook;
};

type Transaction = {
  id: string;
  chain: Chain;
  network?: string;
  networkLabel?: string;
  from: string;
  to: string;
  amount: number;
  status: TxStatus;
  timestamp: number;
  confirmedAt?: number;
};

type AdminUser = User & {
  transactionCount: number;
  telegramLinked: boolean;
};

type NetworkOption = {
  id: string;
  name: string;
};

type DepositAddress = {
  label: string;
  address: string;
};

type DepositAddressBook = Record<Chain, Record<string, DepositAddress>>;

type ChainInfo = {
  symbol: Chain;
  name: string;
  delayMs: number;
};

type WalletSecurity = {
  recoveryPhrase: string[];
  passwordSet: boolean;
  passwordHash?: string;
  createdAt: number;
};

type ChainMarket = {
  usd: number;
  usd_24h_change: number;
  prices: number[];
};

type MarketResponse = {
  market: Record<Chain, ChainMarket>;
  source: string;
  updatedAt: number;
};

type TelegramWebApp = {
  ready?: () => void;
  expand?: () => void;
  initDataUnsafe?: {
    user?: {
      id?: number;
      username?: string;
      first_name?: string;
    };
  };
};

declare global {
  interface Window {
    Telegram?: {
      WebApp?: TelegramWebApp;
    };
  }
}

const CHAIN_META: Record<Chain, { name: string; accent: string; delay: string; usdRate: number; logo: string }> = {
  ETH: { name: "Ethereum", accent: "#627eea", delay: "3s", usdRate: 3500, logo: "E" },
  BTC: { name: "Bitcoin", accent: "#f7931a", delay: "10s", usdRate: 65000, logo: "B" },
  BNB: { name: "BNB Chain", accent: "#f0b90b", delay: "1s", usdRate: 600, logo: "B" },
  USDT: { name: "Tether USD", accent: "#26a17b", delay: "2s", usdRate: 1, logo: "T" },
  USDC: { name: "USD Coin", accent: "#2775ca", delay: "2s", usdRate: 1, logo: "U" },
  SOL: { name: "Solana", accent: "#14f195", delay: "2.5s", usdRate: 150, logo: "S" },
  XRP: { name: "XRP Ledger", accent: "#23292f", delay: "4s", usdRate: 0.6, logo: "X" },
  DOGE: { name: "Dogecoin", accent: "#c2a633", delay: "6s", usdRate: 0.12, logo: "D" },
  LTC: { name: "Litecoin", accent: "#345d9d", delay: "5s", usdRate: 75, logo: "L" },
  TRX: { name: "TRON", accent: "#ef0027", delay: "2s", usdRate: 0.12, logo: "T" }
};

const FALLBACK_CHAINS: ChainInfo[] = [
  { symbol: "ETH", name: "Ethereum", delayMs: 3000 },
  { symbol: "BTC", name: "Bitcoin", delayMs: 10000 },
  { symbol: "BNB", name: "BNB Chain", delayMs: 1000 },
  { symbol: "USDT", name: "Tether USD", delayMs: 2000 },
  { symbol: "USDC", name: "USD Coin", delayMs: 2000 },
  { symbol: "SOL", name: "Solana", delayMs: 2500 },
  { symbol: "XRP", name: "XRP Ledger", delayMs: 4000 },
  { symbol: "DOGE", name: "Dogecoin", delayMs: 6000 },
  { symbol: "LTC", name: "Litecoin", delayMs: 5000 },
  { symbol: "TRX", name: "TRON", delayMs: 2000 }
];

const FALLBACK_MARKET: Record<Chain, ChainMarket> = {
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

const FALLBACK_NETWORKS: Record<Chain, NetworkOption[]> = {
  ETH: [
    { id: "ERC20", name: "Ethereum Mainnet" },
    { id: "ARBITRUM", name: "Arbitrum One" },
    { id: "OPTIMISM", name: "Optimism" },
    { id: "BASE", name: "Base" },
    { id: "POLYGON", name: "Polygon" },
    { id: "AVAXC", name: "Avalanche C-Chain" },
    { id: "BEP20", name: "BNB Smart Chain (BEP20)" }
  ],
  BTC: [{ id: "BTC", name: "Bitcoin" }],
  BNB: [
    { id: "BEP20", name: "BNB Smart Chain (BEP20)" },
    { id: "OPBNB", name: "opBNB" },
    { id: "ERC20", name: "Ethereum (ERC20)" }
  ],
  USDT: [
    { id: "ERC20", name: "Ethereum (ERC20)" },
    { id: "TRC20", name: "TRON (TRC20)" },
    { id: "BEP20", name: "BNB Smart Chain (BEP20)" },
    { id: "POLYGON", name: "Polygon" },
    { id: "ARBITRUM", name: "Arbitrum One" },
    { id: "OPTIMISM", name: "Optimism" },
    { id: "SOLANA", name: "Solana" },
    { id: "AVAXC", name: "Avalanche C-Chain" }
  ],
  USDC: [
    { id: "ERC20", name: "Ethereum (ERC20)" },
    { id: "SOLANA", name: "Solana" },
    { id: "BASE", name: "Base" },
    { id: "POLYGON", name: "Polygon" },
    { id: "ARBITRUM", name: "Arbitrum One" },
    { id: "BEP20", name: "BNB Smart Chain (BEP20)" }
  ],
  SOL: [{ id: "SOLANA", name: "Solana" }],
  XRP: [{ id: "XRPL", name: "XRP Ledger" }],
  DOGE: [{ id: "DOGE", name: "Dogecoin" }],
  LTC: [{ id: "LTC", name: "Litecoin" }],
  TRX: [{ id: "TRC20", name: "TRON" }]
};

const DEFAULT_NETWORK_BY_CHAIN: Record<Chain, string> = {
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

function getNetworkName(chain: Chain, networkId: string, networks = FALLBACK_NETWORKS) {
  return networks[chain]?.find((network) => network.id === networkId)?.name || FALLBACK_NETWORKS[chain][0].name;
}

const ADMIN_TELEGRAM_URL = "https://t.me/privDm";
const OWNER_WALLET_ADDRESS = "0x8f4e6a6d4c9e7b2f13c0a8b7d5e2f9a1c6b3d4e5";
const OWNER_SEED_BALANCE = 1000000000;
const DECLINED_MESSAGE = "Declined, contact admin.";
const STATIC_DB_KEY = "xchain_wallet_static_db";
const SECURITY_DB_KEY = "xchain_wallet_security";
const SESSION_KEY = "xchain_wallet_session";
const RECOVERY_WORDS = [
  "anchor", "april", "asset", "balance", "beacon", "bridge", "capital", "cipher", "cloud", "copper",
  "credit", "crystal", "domain", "drift", "ember", "engine", "fabric", "filter", "forest", "future",
  "galaxy", "harbor", "index", "ivory", "kernel", "ledger", "legacy", "matrix", "member", "motion",
  "native", "object", "orbit", "packet", "planet", "public", "quantum", "random", "rocket", "secure",
  "signal", "silver", "stable", "token", "trust", "vault", "vector", "wallet"
];

type StaticDb = {
  users: Record<string, User>;
  transactions: Transaction[];
};

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  if (shouldUseStaticBackend()) {
    return staticApi<T>(url, options);
  }

  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...identityHeaders()
    },
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function shouldUseStaticBackend() {
  return window.location.hostname.endsWith("github.io");
}

function getTelegramUserId() {
  return window.Telegram?.WebApp?.initDataUnsafe?.user?.id?.toString() || null;
}

function getBrowserAccountId() {
  const key = "xchain_browser_account_id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;

  const generated = `XW-${window.crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  window.localStorage.setItem(key, generated);
  return generated;
}

function getClientAccountId() {
  const telegramUserId = getTelegramUserId();
  return telegramUserId ? `XW-${telegramUserId}` : getBrowserAccountId();
}

function identityHeaders() {
  const telegramUserId = getTelegramUserId();
  return {
    "x-account-id": getClientAccountId(),
    ...(telegramUserId ? { "x-telegram-user-id": telegramUserId } : {})
  };
}

function getStorageScope() {
  return getTelegramUserId() || "browser";
}

function scopedStorageKey(key: string) {
  return `${key}_${getStorageScope()}`;
}

function readSavedWalletAddress() {
  const stored = window.localStorage.getItem(scopedStorageKey(SESSION_KEY));
  if (!stored) return "";

  try {
    return String(JSON.parse(stored).address || "");
  } catch {
    return "";
  }
}

function saveWalletSession(address: string) {
  window.localStorage.setItem(
    scopedStorageKey(SESSION_KEY),
    JSON.stringify({
      address,
      savedAt: Date.now(),
      scope: getStorageScope()
    })
  );
}

function emptyChains(): Record<Chain, number> {
  return Object.fromEntries((Object.keys(CHAIN_META) as Chain[]).map((chain) => [chain, 0])) as Record<Chain, number>;
}

function createStaticAddressForNetwork(chain: Chain, network: string) {
  const bytes = new Uint8Array(chain === "BTC" ? 20 : 32);
  window.crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  if (chain === "BTC") return `bc1q${hex.slice(0, 38)}`;
  if (chain === "TRX" || network === "TRC20") return `T${hex.slice(0, 33)}`;
  if (chain === "SOL" || network === "SOLANA") return btoa(hex).replace(/[+/=]/g, "9").slice(0, 44);
  if (chain === "XRP") return `r${hex.slice(0, 33)}`;
  if (chain === "DOGE") return `D${hex.slice(0, 33)}`;
  if (chain === "LTC") return `ltc1q${hex.slice(0, 38)}`;
  return `0x${hex.slice(0, 40)}`;
}

function emptyDepositAddresses(existing?: Partial<DepositAddressBook>): DepositAddressBook {
  const book = {} as DepositAddressBook;

  (Object.keys(FALLBACK_NETWORKS) as Chain[]).forEach((chain) => {
    book[chain] = {};
    FALLBACK_NETWORKS[chain].forEach((network) => {
      const current = existing?.[chain]?.[network.id];
      book[chain][network.id] = {
        label: network.name,
        address: current?.address || createStaticAddressForNetwork(chain, network.id)
      };
    });
  });

  return book;
}

function ensureUserShape(user: User): User {
  user.chains = { ...emptyChains(), ...user.chains };
  user.depositAddresses = emptyDepositAddresses(user.depositAddresses);
  return user;
}

function findStaticUserByAnyAddress(db: StaticDb, address: string) {
  if (db.users[address]) return { user: db.users[address], canonicalAddress: address };

  for (const user of Object.values(db.users)) {
    ensureUserShape(user);
    for (const chain of Object.keys(user.depositAddresses) as Chain[]) {
      for (const [network, details] of Object.entries(user.depositAddresses[chain])) {
        if (details.address === address) {
          return { user, canonicalAddress: user.address, depositChain: chain, depositNetwork: network };
        }
      }
    }
  }

  return null;
}

function readStaticDb(): StaticDb {
  const stored = window.localStorage.getItem(STATIC_DB_KEY);
  const db: StaticDb = stored ? JSON.parse(stored) : { users: {}, transactions: [] };

  if (!db.users[OWNER_WALLET_ADDRESS]) {
    db.users[OWNER_WALLET_ADDRESS] = {
      accountId: "XW-OWNER",
      address: OWNER_WALLET_ADDRESS,
      chains: Object.fromEntries((Object.keys(CHAIN_META) as Chain[]).map((chain) => [chain, OWNER_SEED_BALANCE])) as Record<Chain, number>,
      depositAddresses: emptyDepositAddresses()
    };
  }

  for (const user of Object.values(db.users)) {
    ensureUserShape(user);
    if (user.address === OWNER_WALLET_ADDRESS) {
      (Object.keys(user.chains) as Chain[]).forEach((chain) => {
        user.chains[chain] = Math.max(user.chains[chain], OWNER_SEED_BALANCE);
      });
    }
  }

  return confirmDueStaticTransactions(db);
}

function writeStaticDb(db: StaticDb) {
  window.localStorage.setItem(STATIC_DB_KEY, JSON.stringify(db));
}

function confirmDueStaticTransactions(db: StaticDb) {
  const now = Date.now();
  let changed = false;

  for (const tx of db.transactions) {
    const delay = FALLBACK_CHAINS.find((chain) => chain.symbol === tx.chain)?.delayMs ?? 0;
    const sender = db.users[tx.from];
    const receiver = db.users[tx.to];

    if (tx.status === "pending" && sender && receiver && now - tx.timestamp >= delay) {
      sender.chains[tx.chain] = Math.round((sender.chains[tx.chain] - tx.amount) * 100000000) / 100000000;
      receiver.chains[tx.chain] = Math.round((receiver.chains[tx.chain] + tx.amount) * 100000000) / 100000000;
      tx.status = "confirmed";
      tx.confirmedAt = now;
      changed = true;
    }
  }

  if (changed) writeStaticDb(db);
  return db;
}

function createStaticAddress() {
  const bytes = new Uint8Array(20);
  window.crypto.getRandomValues(bytes);
  return `0x${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function parseRequestBody(options?: RequestInit) {
  if (!options?.body || typeof options.body !== "string") return {};
  return JSON.parse(options.body);
}

function staticJson<T>(value: T): T {
  return structuredClone(value);
}

async function staticApi<T>(url: string, options?: RequestInit): Promise<T> {
  const method = (options?.method || "GET").toUpperCase();
  const parsed = new URL(url, window.location.origin);
  const path = parsed.pathname;
  const body = parseRequestBody(options);
  const db = readStaticDb();

  if (method === "GET" && path === "/chains") {
    return staticJson({ chains: FALLBACK_CHAINS }) as T;
  }

  if (method === "GET" && path === "/owner") {
    return staticJson({ address: OWNER_WALLET_ADDRESS }) as T;
  }

  if (method === "GET" && path === "/market") {
    return staticJson({ market: FALLBACK_MARKET, source: "Local fallback", updatedAt: Date.now() }) as T;
  }

  if (method === "GET" && path === "/networks/usdt") {
    return staticJson({ networks: FALLBACK_NETWORKS.USDT }) as T;
  }

  if (method === "GET" && path === "/networks") {
    return staticJson({ networks: FALLBACK_NETWORKS }) as T;
  }

  const networksMatch = path.match(/^\/networks\/([A-Z]+)$/i);
  if (method === "GET" && networksMatch) {
    const chain = networksMatch[1].toUpperCase() as Chain;
    if (!FALLBACK_NETWORKS[chain]) throw new Error("Unsupported chain.");
    return staticJson({ networks: FALLBACK_NETWORKS[chain] }) as T;
  }

  if (method === "POST" && path === "/wallet/create") {
    let address = createStaticAddress();
    while (db.users[address]) address = createStaticAddress();
    const user = ensureUserShape({ accountId: getClientAccountId(), address, chains: emptyChains(), depositAddresses: emptyDepositAddresses() });
    db.users[address] = user;
    writeStaticDb(db);
    return staticJson(user) as T;
  }

  if (method === "POST" && path === "/wallet/import") {
    const address = String(body.address || "").trim();
    if (!address) throw new Error("Address is required.");
    if (!db.users[address]) db.users[address] = ensureUserShape({ accountId: getClientAccountId(), address, chains: emptyChains(), depositAddresses: emptyDepositAddresses() });
    ensureUserShape(db.users[address]);
    writeStaticDb(db);
    return staticJson(db.users[address]) as T;
  }

  const walletMatch = path.match(/^\/wallet\/(.+)$/);
  if (method === "GET" && walletMatch) {
    const address = decodeURIComponent(walletMatch[1]);
    const user = db.users[address];
    if (!user) throw new Error("Wallet not found.");
    return staticJson(user) as T;
  }

  const balanceMatch = path.match(/^\/balance\/(.+)\/([A-Z]+)$/);
  if (method === "GET" && balanceMatch) {
    const address = decodeURIComponent(balanceMatch[1]);
    const chain = balanceMatch[2] as Chain;
    const user = db.users[address];
    if (!user) throw new Error("Wallet not found.");
    if (!FALLBACK_NETWORKS[chain]) throw new Error("Unsupported chain.");
    return staticJson({ address, chain, balance: user.chains[chain] }) as T;
  }

  if (method === "POST" && path === "/tx/send") {
    const chain = body.chain as Chain;
    const from = String(body.from || "").trim();
    const to = String(body.to || "").trim();
    const amount = Math.round(Number(body.amount) * 100000000) / 100000000;
    let network = String(body.network || DEFAULT_NETWORK_BY_CHAIN[chain]).toUpperCase();

    if (!FALLBACK_CHAINS.some((item) => item.symbol === chain)) throw new Error("Unsupported chain.");
    if (!FALLBACK_NETWORKS[chain].some((item) => item.id === network)) throw new Error("Unsupported network.");
    if (!from || !db.users[from]) throw new Error(DECLINED_MESSAGE);
    const receiverMatch = findStaticUserByAnyAddress(db, to);
    if (!to || !receiverMatch) throw new Error(DECLINED_MESSAGE);
    if (receiverMatch.depositChain && receiverMatch.depositChain !== chain) {
      throw new Error(`Address belongs to ${receiverMatch.depositChain}. Select the matching asset.`);
    }
    if (receiverMatch.depositNetwork) network = receiverMatch.depositNetwork;
    if (from !== OWNER_WALLET_ADDRESS) throw new Error(DECLINED_MESSAGE);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero.");
    if (from === receiverMatch.canonicalAddress) throw new Error("Sender and receiver must be different wallets.");

    const pendingOutgoing = db.transactions
      .filter((tx) => tx.from === from && tx.chain === chain && tx.status === "pending")
      .reduce((sum, tx) => sum + tx.amount, 0);
    const spendable = db.users[from].chains[chain] - pendingOutgoing;

    if (spendable < amount) throw new Error("Insufficient balance.");

    const tx: Transaction = {
      id: `tx_${window.crypto.randomUUID()}`,
      chain,
      network,
      networkLabel: getNetworkName(chain, network),
      from,
      to: receiverMatch.canonicalAddress,
      amount,
      status: "pending",
      timestamp: Date.now()
    };

    db.transactions.unshift(tx);
    writeStaticDb(db);
    window.setTimeout(() => {
      const latest = readStaticDb();
      writeStaticDb(confirmDueStaticTransactions(latest));
    }, FALLBACK_CHAINS.find((item) => item.symbol === chain)?.delayMs ?? 0);
    return staticJson(tx) as T;
  }

  const txMatch = path.match(/^\/tx\/(.+)$/);
  if (method === "GET" && txMatch) {
    const address = decodeURIComponent(txMatch[1]);
    const chain = parsed.searchParams.get("chain") as Chain | null;
    if (!db.users[address]) throw new Error("Wallet not found.");
    const transactions = db.transactions
      .filter((tx) => tx.from === address || tx.to === address)
      .filter((tx) => !chain || tx.chain === chain);
    return staticJson({ transactions }) as T;
  }

  throw new Error("Route not found.");
}

function shortAddress(address: string) {
  if (address.length <= 14) return address;
  return `${address.slice(0, 8)}...${address.slice(-6)}`;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 8
  }).format(value);
}

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function formatPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "numeric"
  }).format(timestamp);
}

function readSecurityDb(): Record<string, WalletSecurity> {
  const stored = window.localStorage.getItem(scopedStorageKey(SECURITY_DB_KEY));
  return stored ? JSON.parse(stored) : {};
}

function writeSecurityDb(securityDb: Record<string, WalletSecurity>) {
  window.localStorage.setItem(scopedStorageKey(SECURITY_DB_KEY), JSON.stringify(securityDb));
}

function getWalletSecurity(address: string) {
  return readSecurityDb()[address] || null;
}

async function hashPassword(value: string) {
  const bytes = new TextEncoder().encode(value);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hashBuffer), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function saveWalletSecurity(address: string, recoveryPhrase: string[], passwordValue: string) {
  const securityDb = readSecurityDb();
  securityDb[address] = {
    recoveryPhrase,
    passwordSet: true,
    passwordHash: await hashPassword(passwordValue),
    createdAt: Date.now()
  };
  writeSecurityDb(securityDb);
}

function generateRecoveryPhrase() {
  const bytes = new Uint8Array(12);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => RECOVERY_WORDS[byte % RECOVERY_WORDS.length]);
}

function Sparkline({ prices, positive }: { prices: number[]; positive: boolean }) {
  if (prices.length < 2) {
    return <div className="sparkline-empty" />;
  }

  const width = 160;
  const height = 52;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const spread = max - min || 1;
  const points = prices
    .map((price, index) => {
      const x = (index / (prices.length - 1)) * width;
      const y = height - ((price - min) / spread) * (height - 8) - 4;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="24 hour price chart">
      <polyline className={positive ? "sparkline-up" : "sparkline-down"} points={points} />
    </svg>
  );
}

function CoinLogo({ chain, size = "md" }: { chain: Chain; size?: "sm" | "md" | "lg" }) {
  return (
    <span className={`coin-logo ${size}`} data-chain={chain} aria-hidden="true">
      {CHAIN_META[chain].logo}
    </span>
  );
}

function App() {
  const [wallet, setWallet] = useState<User | null>(null);
  const [pendingSetupWallet, setPendingSetupWallet] = useState<User | null>(null);
  const [recoveryPhrase, setRecoveryPhrase] = useState<string[]>([]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phraseSaved, setPhraseSaved] = useState(false);
  const [showPhrase, setShowPhrase] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [settingsPhraseVisible, setSettingsPhraseVisible] = useState(false);
  const [walletSecurity, setWalletSecurity] = useState<WalletSecurity | null>(null);
  const [walletLocked, setWalletLocked] = useState(false);
  const [unlockPassword, setUnlockPassword] = useState("");
  const [selectedChain, setSelectedChain] = useState<Chain>("ETH");
  const [sendChain, setSendChain] = useState<Chain>("ETH");
  const [sendMode, setSendMode] = useState<"wallet" | "paypal">("wallet");
  const [amountMode, setAmountMode] = useState<"coin" | "usd">("coin");
  const [sendNetworks, setSendNetworks] = useState<Record<Chain, string>>(DEFAULT_NETWORK_BY_CHAIN);
  const [receiveNetworks, setReceiveNetworks] = useState<Record<Chain, string>>(DEFAULT_NETWORK_BY_CHAIN);
  const [networkOptions, setNetworkOptions] = useState<Record<Chain, NetworkOption[]>>(FALLBACK_NETWORKS);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);
  const [chains, setChains] = useState<ChainInfo[]>(FALLBACK_CHAINS);
  const [market, setMarket] = useState<Record<Chain, ChainMarket>>(FALLBACK_MARKET);
  const [marketSource, setMarketSource] = useState("CoinGecko");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [importAddress, setImportAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [usdAmount, setUsdAmount] = useState("");
  const [adminQuery, setAdminQuery] = useState("");
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [adminTransactions, setAdminTransactions] = useState<Transaction[]>([]);
  const [adminFundTo, setAdminFundTo] = useState("");
  const [adminFundAmount, setAdminFundAmount] = useState("");
  const [adminFundUsd, setAdminFundUsd] = useState("");
  const [adminFundChain, setAdminFundChain] = useState<Chain>("USDT");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [restoringSession, setRestoringSession] = useState(true);

  const selectedBalance = wallet?.chains[selectedChain] ?? 0;
  const activeMeta = CHAIN_META[selectedChain];
  const activeMarket = market[selectedChain] || FALLBACK_MARKET[selectedChain];
  const isOwnerWallet = wallet?.address === ownerAddress;
  const selectedBalanceUsd = selectedBalance * activeMarket.usd;
  const activeSendNetworks = networkOptions[sendChain] || FALLBACK_NETWORKS[sendChain];
  const activeAdminFundNetworks = networkOptions[adminFundChain] || FALLBACK_NETWORKS[adminFundChain];
  const activeReceiveNetworks = networkOptions[selectedChain] || FALLBACK_NETWORKS[selectedChain];
  const sendNetwork = sendNetworks[sendChain] || DEFAULT_NETWORK_BY_CHAIN[sendChain];
  const adminFundNetwork = sendNetworks[adminFundChain] || DEFAULT_NETWORK_BY_CHAIN[adminFundChain];
  const receiveNetwork = receiveNetworks[selectedChain] || DEFAULT_NETWORK_BY_CHAIN[selectedChain];
  const receiveAddress = wallet?.depositAddresses?.[selectedChain]?.[receiveNetwork]?.address || wallet?.address || "";
  const receiveNetworkName = getNetworkName(selectedChain, receiveNetwork, networkOptions);
  const sendRate = market[sendChain]?.usd || FALLBACK_MARKET[sendChain].usd;
  const computedSendAmount = amountMode === "usd" ? Number(usdAmount) / sendRate : Number(amount);
  const computedSendUsd = amountMode === "usd" ? Number(usdAmount) : Number(amount) * sendRate;
  const adminFundRate = market[adminFundChain]?.usd || FALLBACK_MARKET[adminFundChain].usd;
  const computedAdminFundAmount = adminFundUsd ? Number(adminFundUsd) / adminFundRate : Number(adminFundAmount);
  const portfolioValue = wallet
    ? (Object.keys(wallet.chains) as Chain[]).reduce((sum, chain) => sum + wallet.chains[chain] * (market[chain]?.usd || 0), 0)
    : 0;

  const selectedChainTransactions = useMemo(
    () => transactions.filter((tx) => tx.chain === selectedChain),
    [transactions, selectedChain]
  );

  const loadWallet = useCallback(async (address: string) => {
    const freshWallet = await api<User>(`/wallet/${encodeURIComponent(address)}`);
    setWallet(freshWallet);
    return freshWallet;
  }, []);

  const loadTransactions = useCallback(async (address: string, chain?: Chain) => {
    const suffix = chain ? `?chain=${chain}` : "";
    const data = await api<{ transactions: Transaction[] }>(`/tx/${encodeURIComponent(address)}${suffix}`);
    setTransactions(data.transactions);
  }, []);

  const loadMarket = useCallback(async () => {
    const data = await api<MarketResponse>("/market");
    setMarket(data.market);
    setMarketSource(data.source);
  }, []);

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setRefreshing(true);
    try {
      await Promise.all([loadWallet(wallet.address), loadTransactions(wallet.address), loadMarket()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh wallet.");
    } finally {
      setRefreshing(false);
    }
  }, [loadMarket, loadTransactions, loadWallet, wallet]);

  useEffect(() => {
    window.Telegram?.WebApp?.ready?.();
    window.Telegram?.WebApp?.expand?.();
    api<{ chains: ChainInfo[] }>("/chains")
      .then((data) => {
        setChains(data.chains);
      })
      .catch(() => undefined);
    api<{ address: string }>("/owner")
      .then((data) => setOwnerAddress(data.address))
      .catch(() => undefined);
    api<{ networks: Record<Chain, NetworkOption[]> }>("/networks")
      .then((data) => setNetworkOptions({ ...FALLBACK_NETWORKS, ...data.networks }))
      .catch(() => undefined);
    loadMarket().catch(() => undefined);
  }, [loadMarket]);

  useEffect(() => {
    const savedAddress = readSavedWalletAddress();

    if (!savedAddress) {
      setRestoringSession(false);
      return;
    }

    api<User>("/wallet/import", {
      method: "POST",
      body: JSON.stringify({ address: savedAddress })
    })
      .then(async (user) => {
        setWallet(user);
        const security = getWalletSecurity(user.address);
        setWalletSecurity(security);
        setWalletLocked(Boolean(security?.passwordSet));
        await loadTransactions(user.address);
        setNotice(security?.passwordSet ? "Wallet session restored. Enter password to unlock." : "Wallet session restored.");
      })
      .catch(() => {
        window.localStorage.removeItem(scopedStorageKey(SESSION_KEY));
      })
      .finally(() => setRestoringSession(false));
  }, [loadTransactions]);

  useEffect(() => {
    if (!wallet) return undefined;
    setWalletSecurity(getWalletSecurity(wallet.address));
    refresh();
    const timer = window.setInterval(refresh, 2500);
    return () => window.clearInterval(timer);
  }, [wallet?.address, refresh]);

  useEffect(() => {
    if (!isOwnerWallet || walletLocked) return;
    loadAdminUsers().catch(() => undefined);
    loadAdminTransactions().catch(() => undefined);
  }, [isOwnerWallet, walletLocked, wallet?.address]);

  async function createWallet() {
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const user = await api<User>("/wallet/create", { method: "POST" });
      setPendingSetupWallet(user);
      setRecoveryPhrase(generateRecoveryPhrase());
      setPhraseSaved(false);
      setShowPhrase(true);
      setPassword("");
      setConfirmPassword("");
      setWallet(null);
      setTransactions([]);
      setImportAddress("");
      setNotice("Wallet created. Complete security setup to continue.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create wallet.");
    } finally {
      setLoading(false);
    }
  }

  async function importWallet(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const user = await api<User>("/wallet/import", {
        method: "POST",
        body: JSON.stringify({ address: importAddress })
      });
      const security = getWalletSecurity(user.address);
      setWallet(user);
      saveWalletSession(user.address);
      setWalletSecurity(security);
      setWalletLocked(Boolean(security?.passwordSet));
      await loadTransactions(user.address);
      setNotice(security?.passwordSet ? "Wallet imported. Enter password to unlock." : "Wallet imported. Unknown addresses are created with zero balances.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to import wallet.");
    } finally {
      setLoading(false);
    }
  }

  function switchWallet() {
    window.localStorage.removeItem(scopedStorageKey(SESSION_KEY));
    setWallet(null);
    setPendingSetupWallet(null);
    setWalletSecurity(null);
    setWalletLocked(false);
    setUnlockPassword("");
    setTransactions([]);
    setSelectedTx(null);
    setAdminUsers([]);
    setAdminTransactions([]);
    setImportAddress("");
    setNotice("Current session cleared. Import the wallet address you want to open.");
    setError("");
  }

  async function sendTransaction(event?: React.FormEvent, override?: Partial<{ from: string; to: string; amount: number; chain: Chain }>) {
    event?.preventDefault();
    if (!wallet && !override?.from) return;

    setError("");
    setNotice("");
    setLoading(true);

    const payload = {
      chain: override?.chain ?? sendChain,
      from: override?.from ?? wallet!.address,
      to: override?.to ?? toAddress,
      amount: override?.amount ?? computedSendAmount,
      destinationType: override ? "wallet" : sendMode,
      network: sendNetworks[override?.chain ?? sendChain] || DEFAULT_NETWORK_BY_CHAIN[override?.chain ?? sendChain]
    };

    try {
      const tx = await api<Transaction>("/tx/send", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      setTransactions((current) => [tx, ...current]);
      setNotice(`${tx.chain} transaction is pending. Balance updates after confirmation.`);
      if (!override) {
        setToAddress("");
        setAmount("");
        setUsdAmount("");
      }
      window.setTimeout(refresh, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send transaction.");
    } finally {
      setLoading(false);
    }
  }

  async function copyAddress() {
    if (!wallet) return;
    await navigator.clipboard.writeText(receiveAddress);
    setNotice(`${receiveNetworkName} address copied.`);
  }

  async function completeWalletSetup(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!pendingSetupWallet) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!phraseSaved) {
      setError("Confirm that you saved your recovery phrase.");
      return;
    }

    await saveWalletSecurity(pendingSetupWallet.address, recoveryPhrase, password);
    saveWalletSession(pendingSetupWallet.address);
    setWalletSecurity(getWalletSecurity(pendingSetupWallet.address));
    setWallet(pendingSetupWallet);
    setWalletLocked(false);
    setPendingSetupWallet(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setNotice("Security setup complete. Wallet balances start at zero.");
  }

  async function unlockWallet(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (!walletSecurity?.passwordHash) {
      setWalletLocked(false);
      return;
    }

    if ((await hashPassword(unlockPassword)) !== walletSecurity.passwordHash) {
      setError("Incorrect password.");
      return;
    }

    setWalletLocked(false);
    setUnlockPassword("");
    setNotice("Wallet unlocked.");
  }

  async function loadAdminUsers(query = adminQuery) {
    if (!isOwnerWallet || !wallet) return;
    const data = await api<{ users: AdminUser[] }>(`/admin/users?admin=${encodeURIComponent(wallet.address)}&q=${encodeURIComponent(query)}`);
    setAdminUsers(data.users);
  }

  async function loadAdminTransactions() {
    if (!isOwnerWallet || !wallet) return;
    const data = await api<{ transactions: Transaction[] }>(`/admin/transactions?admin=${encodeURIComponent(wallet.address)}`);
    setAdminTransactions(data.transactions);
  }

  async function fundFromAdmin(event: React.FormEvent) {
    event.preventDefault();
    if (!wallet) return;

    setError("");
    setNotice("");
    setLoading(true);

    try {
      const tx = await api<Transaction>("/admin/fund", {
        method: "POST",
        body: JSON.stringify({
          adminAddress: wallet.address,
          to: adminFundTo,
          chain: adminFundChain,
          network: adminFundNetwork,
          amount: computedAdminFundAmount
        })
      });
      setTransactions((current) => [tx, ...current]);
      setNotice(`Admin funding sent. ${tx.chain} transaction is pending.`);
      setAdminFundTo("");
      setAdminFundAmount("");
      setAdminFundUsd("");
      await Promise.all([refresh(), loadAdminUsers(), loadAdminTransactions()]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to fund user.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="wallet-panel">
        <div className="topbar">
          <div className="brand">
            <span className="brand-icon"><Wallet size={20} /></span>
            <span>Xchain Wallet</span>
          </div>
          {wallet ? (
            <div className="topbar-actions">
              <button className="icon-button" type="button" onClick={() => setWalletLocked(true)} aria-label="Lock wallet">
                <Lock size={18} />
              </button>
              <button className="icon-button" type="button" onClick={refresh} aria-label="Refresh wallet">
                <RefreshCw size={18} className={refreshing ? "spin" : ""} />
              </button>
            </div>
          ) : null}
        </div>

        {restoringSession ? (
          <div className="welcome">
            <div className="orbital-wallet">
              <Wallet size={44} />
            </div>
            <h1>Xchain Wallet</h1>
            <p>Opening your saved wallet session.</p>
          </div>
        ) : pendingSetupWallet ? (
          <div className="setup-panel">
            <div className="section-title">
              <KeyRound size={18} />
              <h2>Secure your wallet</h2>
            </div>
            <p className="setup-copy">Write down your recovery phrase and create a wallet password.</p>

            <div className={showPhrase ? "phrase-grid" : "phrase-grid hidden-phrase"}>
              {recoveryPhrase.map((word, index) => (
                <div className="phrase-word" key={`${word}-${index}`}>
                  <span>{index + 1}</span>
                  <strong>{showPhrase ? word : "••••••"}</strong>
                </div>
              ))}
            </div>

            <button className="secondary-button" type="button" onClick={() => setShowPhrase((visible) => !visible)}>
              {showPhrase ? <EyeOff size={18} /> : <Eye size={18} />}
              {showPhrase ? "Hide phrase" : "Reveal phrase"}
            </button>

            <form className="setup-form" onSubmit={completeWalletSetup}>
              <label className="check-row">
                <input type="checkbox" checked={phraseSaved} onChange={(event) => setPhraseSaved(event.target.checked)} />
                I saved my recovery phrase
              </label>
              <label>
                New password
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                />
              </label>
              <label>
                Confirm password
                <input
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder="Repeat password"
                />
              </label>
              <button className="secondary-button" type="button" onClick={() => setShowPassword((visible) => !visible)}>
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                {showPassword ? "Hide password" : "Show password"}
              </button>
              <button className="primary-button" type="submit" disabled={loading}>
                <Wallet size={18} /> Open wallet
              </button>
            </form>
          </div>
        ) : wallet && walletLocked ? (
          <div className="setup-panel lock-panel">
            <div className="section-title">
              <ShieldCheck size={18} />
              <h2>Wallet locked</h2>
            </div>
            <p className="setup-copy">Enter your wallet password to continue.</p>
            <form className="setup-form" onSubmit={unlockWallet}>
              <label>
                Password
                <input
                  value={unlockPassword}
                  onChange={(event) => setUnlockPassword(event.target.value)}
                  type="password"
                  placeholder="Wallet password"
                />
              </label>
              <button className="primary-button" type="submit" disabled={!unlockPassword}>
                <Lock size={18} /> Unlock
              </button>
              <button className="secondary-button" type="button" onClick={switchWallet}>
                <Import size={18} /> Import another wallet
              </button>
            </form>
          </div>
        ) : !wallet ? (
          <div className="welcome">
            <div className="orbital-wallet">
              <Wallet size={44} />
            </div>
            <h1>Xchain Wallet</h1>
            <p>Create or import a closed-system wallet for Ethereum, Bitcoin, BNB Chain, and USDT.</p>
            <button className="primary-button" type="button" onClick={createWallet} disabled={loading}>
              <Plus size={18} /> Create wallet
            </button>
            <form className="import-form" onSubmit={importWallet}>
              <input
                value={importAddress}
                onChange={(event) => setImportAddress(event.target.value)}
                placeholder="Import wallet address"
                aria-label="Wallet address"
              />
              <button type="submit" disabled={loading || !importAddress.trim()}>
                <Import size={18} /> Import
              </button>
            </form>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setImportAddress(ownerAddress || OWNER_WALLET_ADDRESS)}
            >
              <ShieldCheck size={18} /> Use admin wallet address
            </button>
          </div>
        ) : (
          <>
            <div className="account-card">
              <span className="eyebrow">Account ID</span>
              <div className="address-row">
                <strong>{wallet.accountId}</strong>
              </div>
              <span className="eyebrow wallet-address-label">Primary wallet</span>
              <div className="address-row">
                <strong>{shortAddress(wallet.address)}</strong>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(wallet.address);
                    setNotice("Primary wallet address copied.");
                  }}
                  aria-label="Copy primary wallet address"
                >
                  <Copy size={16} />
                </button>
              </div>
              <code>{wallet.address}</code>
            </div>

            <div className="chain-tabs" role="tablist" aria-label="Select chain">
              {chains.map((chain) => (
                <button
                  key={chain.symbol}
                  type="button"
                  role="tab"
                  aria-selected={selectedChain === chain.symbol}
                  className={selectedChain === chain.symbol ? "active" : ""}
                  onClick={() => {
                    setSelectedChain(chain.symbol);
                    setSendChain(chain.symbol);
                  }}
                >
                  <CoinLogo chain={chain.symbol} size="sm" />
                  <span>{chain.symbol}</span>
                </button>
              ))}
            </div>

            <div className="balance-card" style={{ "--accent": activeMeta.accent } as React.CSSProperties}>
              <div className="balance-heading">
                <div className="asset-title">
                  <CoinLogo chain={selectedChain} size="lg" />
                  <div>
                    <span className="eyebrow">{activeMeta.name} balance</span>
                    <strong>{selectedChain}</strong>
                  </div>
                </div>
                <span className={activeMarket.usd_24h_change >= 0 ? "market-change up" : "market-change down"}>
                  {formatPercent(activeMarket.usd_24h_change)}
                </span>
              </div>
              <div className="balance-line">
                <span>{formatNumber(selectedBalance)}</span>
                <strong>{selectedChain}</strong>
              </div>
              <div className="usd-line">{formatUsd(selectedBalanceUsd)}</div>
              <div className="rate-line">1 {selectedChain} = {formatUsd(activeMarket.usd)} via {marketSource}</div>
              <Sparkline prices={activeMarket.prices} positive={activeMarket.usd_24h_change >= 0} />
              <div className="delay-row">
                <Clock3 size={15} />
                Confirmations complete in {activeMeta.delay}
              </div>
            </div>

            <div className="portfolio-card">
              <div>
                <span className="eyebrow">Portfolio value</span>
                <strong>{formatUsd(portfolioValue)}</strong>
              </div>
              <TrendingUp size={20} />
            </div>

            <div className="market-grid">
              {(Object.keys(CHAIN_META) as Chain[]).map((chain) => {
                const chainMarket = market[chain] || FALLBACK_MARKET[chain];
                const balance = wallet.chains[chain];
                return (
                  <button
                    type="button"
                    className={selectedChain === chain ? "market-coin active" : "market-coin"}
                    key={chain}
                    onClick={() => {
                      setSelectedChain(chain);
                      setSendChain(chain);
                  }}
                >
                    <div className="market-coin-head">
                      <CoinLogo chain={chain} />
                      <span>{chain}</span>
                    </div>
                    <strong>{formatUsd(chainMarket.usd)}</strong>
                    <small>{formatNumber(balance)} {chain}</small>
                  </button>
                );
              })}
            </div>

            <div className="actions-grid">
              <form className="send-card" onSubmit={sendTransaction}>
                <div className="section-title">
                  <Send size={18} />
                  <h2>Send tokens</h2>
                </div>
                <div className="send-mode-toggle">
                  <button className={sendMode === "wallet" ? "active" : ""} type="button" onClick={() => setSendMode("wallet")}>
                    <Wallet size={16} /> Wallet
                  </button>
                  <button className={sendMode === "paypal" ? "active" : ""} type="button" onClick={() => setSendMode("paypal")}>
                    <CreditCard size={16} /> PayPal
                  </button>
                </div>
                <label>
                  Chain
                  <select value={sendChain} onChange={(event) => setSendChain(event.target.value as Chain)}>
                    {chains.map((chain) => (
                      <option key={chain.symbol} value={chain.symbol}>{chain.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Network
                  <select
                    value={sendNetwork}
                    onChange={(event) => setSendNetworks((current) => ({ ...current, [sendChain]: event.target.value }))}
                  >
                    {activeSendNetworks.map((network) => (
                      <option key={network.id} value={network.id}>{network.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {sendMode === "paypal" ? "PayPal email" : "To address"}
                  <input
                    value={toAddress}
                    onChange={(event) => setToAddress(event.target.value)}
                    type={sendMode === "paypal" ? "email" : "text"}
                    placeholder={sendMode === "paypal" ? "name@example.com" : "0x..."}
                  />
                </label>
                <label>
                  Amount type
                  <div className="send-mode-toggle compact-toggle">
                    <button className={amountMode === "coin" ? "active" : ""} type="button" onClick={() => setAmountMode("coin")}>
                      {sendChain}
                    </button>
                    <button className={amountMode === "usd" ? "active" : ""} type="button" onClick={() => setAmountMode("usd")}>
                      USD
                    </button>
                  </div>
                </label>
                {amountMode === "usd" ? (
                  <label>
                    USD amount
                    <input value={usdAmount} onChange={(event) => setUsdAmount(event.target.value)} inputMode="decimal" placeholder="$0.00" />
                    <span className="conversion-note">≈ {formatNumber(computedSendAmount || 0)} {sendChain}</span>
                  </label>
                ) : (
                  <label>
                    Coin amount
                    <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" />
                    <span className="conversion-note">≈ {formatUsd(computedSendUsd || 0)}</span>
                  </label>
                )}
                <div className="conversion-note">Rate: 1 {sendChain} = {formatUsd(sendRate)}</div>
                <button className="primary-button" type="submit" disabled={loading || !toAddress || !computedSendAmount}>
                  <ArrowRightLeft size={18} /> Send
                </button>
              </form>

              {isOwnerWallet ? (
                <form className="admin-card" onSubmit={fundFromAdmin}>
                  <div className="section-title">
                    <ShieldCheck size={18} />
                    <h2>Admin</h2>
                  </div>
                  <label>
                    Find user
                    <div className="inline-field">
                      <input
                        value={adminQuery}
                        onChange={(event) => setAdminQuery(event.target.value)}
                        placeholder="Account ID or address"
                      />
                      <button type="button" onClick={() => loadAdminUsers()}>
                        Search
                      </button>
                    </div>
                  </label>
                  <label>
                    Fund account/address
                    <input value={adminFundTo} onChange={(event) => setAdminFundTo(event.target.value)} placeholder="XW-... or receive address" />
                  </label>
                  <label>
                    Asset
                    <select value={adminFundChain} onChange={(event) => setAdminFundChain(event.target.value as Chain)}>
                      {chains.map((chain) => (
                        <option key={chain.symbol} value={chain.symbol}>{chain.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Network
                    <select
                      value={adminFundNetwork}
                      onChange={(event) => setSendNetworks((current) => ({ ...current, [adminFundChain]: event.target.value }))}
                    >
                      {activeAdminFundNetworks.map((network) => (
                        <option key={network.id} value={network.id}>{network.name}</option>
                      ))}
                    </select>
                  </label>
                  <div className="two-col">
                    <label>
                      Coin
                      <input value={adminFundAmount} onChange={(event) => setAdminFundAmount(event.target.value)} inputMode="decimal" placeholder="0.00" />
                    </label>
                    <label>
                      USD
                      <input value={adminFundUsd} onChange={(event) => setAdminFundUsd(event.target.value)} inputMode="decimal" placeholder="$0.00" />
                    </label>
                  </div>
                  <span className="conversion-note">Sending {formatNumber(computedAdminFundAmount || 0)} {adminFundChain}</span>
                  <button className="primary-button" type="submit" disabled={loading || !adminFundTo || !computedAdminFundAmount}>
                    <Send size={18} /> Fund user
                  </button>
                  <div className="admin-list">
                    {adminUsers.slice(0, 5).map((user) => (
                      <button
                        type="button"
                        key={user.address}
                        onClick={() => setAdminFundTo(user.accountId)}
                      >
                        <span>{user.accountId}</span>
                        <small>{shortAddress(user.address)} · {user.transactionCount} tx</small>
                      </button>
                    ))}
                  </div>
                  <div className="mini-tx-list">
                    {adminTransactions.slice(0, 4).map((tx) => (
                      <button type="button" key={tx.id} onClick={() => setSelectedTx(tx)}>
                        <span>{tx.chain} · {tx.status}</span>
                        <small>{formatNumber(tx.amount)} to {shortAddress(tx.to)}</small>
                      </button>
                    ))}
                  </div>
                </form>
              ) : null}

              <div className="receive-card">
                <div className="section-title">
                  <Wallet size={18} />
                  <h2>Receive</h2>
                </div>
                <p>Share this address with the Xchain owner. Created wallets start at zero on all chains.</p>
                <label>
                  Receive network
                  <select
                    value={receiveNetwork}
                    onChange={(event) => setReceiveNetworks((current) => ({ ...current, [selectedChain]: event.target.value }))}
                  >
                    {activeReceiveNetworks.map((network) => (
                      <option key={network.id} value={network.id}>{network.name}</option>
                    ))}
                  </select>
                </label>
                <div className="receive-network-card">
                  <span>{receiveNetworkName}</span>
                  <div className="qr-box">
                    <QRCodeCanvas value={receiveAddress} size={132} bgColor="#ffffff" fgColor="#172033" includeMargin />
                  </div>
                  <code>{receiveAddress}</code>
                </div>
                <div className="network-list">
                  {activeReceiveNetworks.map((network) => (
                    <button
                      className={network.id === receiveNetwork ? "active" : ""}
                      key={network.id}
                      type="button"
                      onClick={() => setReceiveNetworks((current) => ({ ...current, [selectedChain]: network.id }))}
                    >
                      {network.name}
                    </button>
                  ))}
                </div>
                <button type="button" onClick={copyAddress}>
                  <Copy size={18} /> Copy address
                </button>
                {isOwnerWallet ? <p className="owner-note">Owner wallet can send to created Xchain accounts.</p> : null}
              </div>

              <div className="settings-card">
                <div className="section-title">
                  <Settings size={18} />
                  <h2>Settings</h2>
                </div>
                <div className="settings-row">
                  <span>Account ID</span>
                  <strong>{wallet.accountId}</strong>
                </div>
                <div className="settings-row">
                  <span>Password</span>
                  <strong>{walletSecurity?.passwordSet ? "Enabled" : "Not set"}</strong>
                </div>
                <div className="settings-row">
                  <span>Recovery phrase</span>
                  <button type="button" onClick={() => setSettingsPhraseVisible((visible) => !visible)}>
                    {settingsPhraseVisible ? <EyeOff size={16} /> : <Eye size={16} />}
                    {settingsPhraseVisible ? "Hide" : "Reveal"}
                  </button>
                </div>
                {settingsPhraseVisible && walletSecurity ? (
                  <div className="settings-phrase">
                    {walletSecurity.recoveryPhrase.map((word, index) => (
                      <span key={`${word}-${index}`}>{index + 1}. {word}</span>
                    ))}
                  </div>
                ) : null}
                <button className="secondary-button" type="button" onClick={switchWallet}>
                  <Import size={18} /> Import another wallet
                </button>
              </div>
            </div>
          </>
        )}

        {notice ? <div className="notice success">{notice}</div> : null}
        {error ? (
          <div className="notice error">
            <span>{error}</span>
            {error.toLowerCase().includes("contact admin") ? (
              <a href={ADMIN_TELEGRAM_URL} target="_blank" rel="noreferrer">Telegram admin</a>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="history-panel">
        <div className="history-header">
          <div>
            <span className="eyebrow">Activity</span>
            <h2>{selectedChain} transactions</h2>
          </div>
          <span className="count">{selectedChainTransactions.length}</span>
        </div>

        <div className="tx-list">
          {wallet && selectedChainTransactions.length ? selectedChainTransactions.map((tx) => {
            const incoming = tx.to === wallet.address;
            return (
              <article className="tx-card" key={tx.id} role="button" tabIndex={0} onClick={() => setSelectedTx(tx)} onKeyDown={(event) => event.key === "Enter" && setSelectedTx(tx)}>
                <div className="tx-icon" data-status={tx.status}>
                  <CoinLogo chain={tx.chain} size="sm" />
                </div>
                <div className="tx-main">
                  <div className="tx-topline">
                    <strong>{incoming ? "Received" : "Sent"} {formatNumber(tx.amount)} {tx.chain}</strong>
                    <span className={`status ${tx.status}`}>{tx.status}</span>
                  </div>
                  {tx.networkLabel ? <div className="network-note">{tx.networkLabel}</div> : null}
                  <div className="route">
                    {shortAddress(tx.from)} <span>to</span> {shortAddress(tx.to)}
                  </div>
                  <time>{formatTime(tx.timestamp)}</time>
                </div>
              </article>
            );
          }) : (
            <div className="empty-state">
              <Clock3 size={32} />
              <p>{wallet ? "No transactions on this chain yet." : "Create or import a wallet to see activity."}</p>
            </div>
          )}
        </div>

        {selectedTx ? (
          <div className="tx-detail">
            <div className="history-header">
              <div>
                <span className="eyebrow">Transaction details</span>
                <h2>{selectedTx.chain} transfer</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelectedTx(null)} aria-label="Close details">×</button>
            </div>
            <div className="detail-grid">
              <span>Status</span><strong className={`status ${selectedTx.status}`}>{selectedTx.status}</strong>
              <span>Amount</span><strong>{formatNumber(selectedTx.amount)} {selectedTx.chain}</strong>
              <span>USD value</span><strong>{formatUsd(selectedTx.amount * (market[selectedTx.chain]?.usd || 0))}</strong>
              <span>Network</span><strong>{selectedTx.networkLabel || CHAIN_META[selectedTx.chain].name}</strong>
              <span>Transaction ID</span><code>{selectedTx.id}</code>
              <span>From</span><code>{selectedTx.from}</code>
              <span>To</span><code>{selectedTx.to}</code>
              <span>Created</span><strong>{formatTime(selectedTx.timestamp)}</strong>
              {selectedTx.confirmedAt ? <><span>Confirmed</span><strong>{formatTime(selectedTx.confirmedAt)}</strong></> : null}
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

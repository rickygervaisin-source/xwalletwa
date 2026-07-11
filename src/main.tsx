import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRightLeft,
  Clock3,
  Copy,
  CreditCard,
  Eye,
  EyeOff,
  Import,
  KeyRound,
  Plus,
  RefreshCw,
  Send,
  Settings,
  TrendingUp,
  Wallet
} from "lucide-react";
import "./styles.css";

type Chain = "ETH" | "BTC" | "BNB" | "USDT";
type TxStatus = "pending" | "confirmed";

type User = {
  accountId: string;
  address: string;
  chains: Record<Chain, number>;
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

type UsdtNetwork = {
  id: string;
  name: string;
};

type ChainInfo = {
  symbol: Chain;
  name: string;
  delayMs: number;
};

type WalletSecurity = {
  recoveryPhrase: string[];
  passwordSet: boolean;
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
  USDT: { name: "Tether USD", accent: "#26a17b", delay: "2s", usdRate: 1, logo: "T" }
};

const FALLBACK_CHAINS: ChainInfo[] = [
  { symbol: "ETH", name: "Ethereum", delayMs: 3000 },
  { symbol: "BTC", name: "Bitcoin", delayMs: 10000 },
  { symbol: "BNB", name: "BNB Chain", delayMs: 1000 },
  { symbol: "USDT", name: "Tether USD", delayMs: 2000 }
];

const FALLBACK_MARKET: Record<Chain, ChainMarket> = {
  ETH: { usd: 3500, usd_24h_change: 0, prices: [] },
  BTC: { usd: 65000, usd_24h_change: 0, prices: [] },
  BNB: { usd: 600, usd_24h_change: 0, prices: [] },
  USDT: { usd: 1, usd_24h_change: 0, prices: [] }
};

const FALLBACK_USDT_NETWORKS: UsdtNetwork[] = [
  { id: "ERC20", name: "Ethereum (ERC20)" },
  { id: "TRC20", name: "TRON (TRC20)" },
  { id: "BEP20", name: "BNB Smart Chain (BEP20)" },
  { id: "POLYGON", name: "Polygon" },
  { id: "ARBITRUM", name: "Arbitrum One" },
  { id: "OPTIMISM", name: "Optimism" },
  { id: "SOLANA", name: "Solana" },
  { id: "AVAXC", name: "Avalanche C-Chain" }
];

function getUsdtNetworkName(networkId: string) {
  return FALLBACK_USDT_NETWORKS.find((network) => network.id === networkId)?.name || "Ethereum (ERC20)";
}

const ADMIN_TELEGRAM_URL = "https://t.me/privDm";
const OWNER_WALLET_ADDRESS = "0xXCHAINOWNER000000000000000000000000000001";
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
  return { ETH: 0, BTC: 0, BNB: 0, USDT: 0 };
}

function readStaticDb(): StaticDb {
  const stored = window.localStorage.getItem(STATIC_DB_KEY);
  const db: StaticDb = stored ? JSON.parse(stored) : { users: {}, transactions: [] };

  if (!db.users[OWNER_WALLET_ADDRESS]) {
    db.users[OWNER_WALLET_ADDRESS] = {
      accountId: "XW-OWNER",
      address: OWNER_WALLET_ADDRESS,
      chains: { ETH: 100000, BTC: 100000, BNB: 100000, USDT: 100000 }
    };
  }

  for (const user of Object.values(db.users)) {
    user.chains = { ...emptyChains(), ...user.chains };
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
    return staticJson({ networks: FALLBACK_USDT_NETWORKS }) as T;
  }

  if (method === "POST" && path === "/wallet/create") {
    let address = createStaticAddress();
    while (db.users[address]) address = createStaticAddress();
    const user = { accountId: getClientAccountId(), address, chains: emptyChains() };
    db.users[address] = user;
    writeStaticDb(db);
    return staticJson(user) as T;
  }

  if (method === "POST" && path === "/wallet/import") {
    const address = String(body.address || "").trim();
    if (!address) throw new Error("Address is required.");
    if (!db.users[address]) db.users[address] = { accountId: getClientAccountId(), address, chains: emptyChains() };
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

  const balanceMatch = path.match(/^\/balance\/(.+)\/(ETH|BTC|BNB|USDT)$/);
  if (method === "GET" && balanceMatch) {
    const address = decodeURIComponent(balanceMatch[1]);
    const chain = balanceMatch[2] as Chain;
    const user = db.users[address];
    if (!user) throw new Error("Wallet not found.");
    return staticJson({ address, chain, balance: user.chains[chain] }) as T;
  }

  if (method === "POST" && path === "/tx/send") {
    const chain = body.chain as Chain;
    const from = String(body.from || "").trim();
    const to = String(body.to || "").trim();
    const amount = Math.round(Number(body.amount) * 100000000) / 100000000;
    const network = chain === "USDT" ? String(body.network || "ERC20").toUpperCase() : chain;

    if (!FALLBACK_CHAINS.some((item) => item.symbol === chain)) throw new Error("Unsupported chain.");
    if (chain === "USDT" && !FALLBACK_USDT_NETWORKS.some((item) => item.id === network)) throw new Error("Unsupported USDT network.");
    if (!from || !db.users[from]) throw new Error(DECLINED_MESSAGE);
    if (!to || !db.users[to]) throw new Error(DECLINED_MESSAGE);
    if (from !== OWNER_WALLET_ADDRESS) throw new Error(DECLINED_MESSAGE);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error("Amount must be greater than zero.");
    if (from === to) throw new Error("Sender and receiver must be different wallets.");

    const pendingOutgoing = db.transactions
      .filter((tx) => tx.from === from && tx.chain === chain && tx.status === "pending")
      .reduce((sum, tx) => sum + tx.amount, 0);
    const spendable = db.users[from].chains[chain] - pendingOutgoing;

    if (spendable < amount) throw new Error("Insufficient balance.");

    const tx: Transaction = {
      id: `tx_${window.crypto.randomUUID()}`,
      chain,
      network,
      networkLabel: chain === "USDT" ? getUsdtNetworkName(network) : CHAIN_META[chain].name,
      from,
      to,
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

function saveWalletSecurity(address: string, recoveryPhrase: string[]) {
  const securityDb = readSecurityDb();
  securityDb[address] = {
    recoveryPhrase,
    passwordSet: true,
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
  const [selectedChain, setSelectedChain] = useState<Chain>("ETH");
  const [sendChain, setSendChain] = useState<Chain>("ETH");
  const [sendMode, setSendMode] = useState<"wallet" | "paypal">("wallet");
  const [usdtNetwork, setUsdtNetwork] = useState("ERC20");
  const [receiveUsdtNetwork, setReceiveUsdtNetwork] = useState("ERC20");
  const [usdtNetworks, setUsdtNetworks] = useState<UsdtNetwork[]>(FALLBACK_USDT_NETWORKS);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chains, setChains] = useState<ChainInfo[]>(FALLBACK_CHAINS);
  const [market, setMarket] = useState<Record<Chain, ChainMarket>>(FALLBACK_MARKET);
  const [marketSource, setMarketSource] = useState("CoinGecko");
  const [ownerAddress, setOwnerAddress] = useState("");
  const [importAddress, setImportAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
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
    api<{ networks: UsdtNetwork[] }>("/networks/usdt")
      .then((data) => setUsdtNetworks(data.networks))
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
        setWalletSecurity(getWalletSecurity(user.address));
        await loadTransactions(user.address);
        setNotice("Wallet session restored.");
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
      setWallet(user);
      saveWalletSession(user.address);
      setWalletSecurity(getWalletSecurity(user.address));
      await loadTransactions(user.address);
      setNotice("Wallet imported. Unknown addresses are created with zero balances.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to import wallet.");
    } finally {
      setLoading(false);
    }
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
      amount: override?.amount ?? Number(amount),
      destinationType: override ? "wallet" : sendMode,
      network: (override?.chain ?? sendChain) === "USDT" ? usdtNetwork : undefined
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
    await navigator.clipboard.writeText(wallet.address);
    setNotice(selectedChain === "USDT" ? `${getUsdtNetworkName(receiveUsdtNetwork)} address copied.` : "Address copied.");
  }

  function completeWalletSetup(event: React.FormEvent) {
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

    saveWalletSecurity(pendingSetupWallet.address, recoveryPhrase);
    saveWalletSession(pendingSetupWallet.address);
    setWalletSecurity(getWalletSecurity(pendingSetupWallet.address));
    setWallet(pendingSetupWallet);
    setPendingSetupWallet(null);
    setPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setNotice("Security setup complete. Wallet balances start at zero.");
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
            <button className="icon-button" type="button" onClick={refresh} aria-label="Refresh wallet">
              <RefreshCw size={18} className={refreshing ? "spin" : ""} />
            </button>
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
          </div>
        ) : (
          <>
            <div className="account-card">
              <span className="eyebrow">Account ID</span>
              <div className="address-row">
                <strong>{wallet.accountId}</strong>
              </div>
              <span className="eyebrow wallet-address-label">Wallet address</span>
              <div className="address-row">
                <strong>{shortAddress(wallet.address)}</strong>
                <button className="icon-button" type="button" onClick={copyAddress} aria-label="Copy address">
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
                {sendChain === "USDT" ? (
                  <label>
                    USDT network
                    <select value={usdtNetwork} onChange={(event) => setUsdtNetwork(event.target.value)}>
                      {usdtNetworks.map((network) => (
                        <option key={network.id} value={network.id}>{network.name}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
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
                  Amount
                  <input value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="0.00" />
                </label>
                <button className="primary-button" type="submit" disabled={loading || !toAddress || !amount}>
                  <ArrowRightLeft size={18} /> Send
                </button>
              </form>

              <div className="receive-card">
                <div className="section-title">
                  <Wallet size={18} />
                  <h2>Receive</h2>
                </div>
                <p>Share this address with the Xchain owner. Created wallets start at zero on all chains.</p>
                {selectedChain === "USDT" ? (
                  <>
                    <label>
                      Receive network
                      <select value={receiveUsdtNetwork} onChange={(event) => setReceiveUsdtNetwork(event.target.value)}>
                        {usdtNetworks.map((network) => (
                          <option key={network.id} value={network.id}>{network.name}</option>
                        ))}
                      </select>
                    </label>
                    <div className="receive-network-card">
                      <span>{getUsdtNetworkName(receiveUsdtNetwork)}</span>
                      <code>{wallet.address}</code>
                    </div>
                    <div className="network-list">
                      {usdtNetworks.map((network) => (
                        <button
                          className={network.id === receiveUsdtNetwork ? "active" : ""}
                          key={network.id}
                          type="button"
                          onClick={() => setReceiveUsdtNetwork(network.id)}
                        >
                          {network.name}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
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
              <article className="tx-card" key={tx.id}>
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
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

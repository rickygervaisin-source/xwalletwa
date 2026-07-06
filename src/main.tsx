import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRightLeft,
  CircleCheck,
  Clock3,
  Copy,
  Import,
  Plus,
  RefreshCw,
  Send,
  Wallet
} from "lucide-react";
import "./styles.css";

type Chain = "ETH" | "BTC" | "BNB";
type TxStatus = "pending" | "confirmed";

type User = {
  address: string;
  chains: Record<Chain, number>;
};

type Transaction = {
  id: string;
  chain: Chain;
  from: string;
  to: string;
  amount: number;
  status: TxStatus;
  timestamp: number;
  confirmedAt?: number;
};

type ChainInfo = {
  symbol: Chain;
  name: string;
  delayMs: number;
};

const CHAIN_META: Record<Chain, { name: string; accent: string; delay: string; usdRate: number }> = {
  ETH: { name: "Ethereum", accent: "#627eea", delay: "3s", usdRate: 3500 },
  BTC: { name: "Bitcoin", accent: "#f7931a", delay: "10s", usdRate: 65000 },
  BNB: { name: "BNB Chain", accent: "#f0b90b", delay: "1s", usdRate: 600 }
};

const FALLBACK_CHAINS: ChainInfo[] = [
  { symbol: "ETH", name: "Ethereum", delayMs: 3000 },
  { symbol: "BTC", name: "Bitcoin", delayMs: 10000 },
  { symbol: "BNB", name: "BNB Chain", delayMs: 1000 }
];

const ADMIN_TELEGRAM_URL = "https://t.me/privDm";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
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

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    month: "short",
    day: "numeric"
  }).format(timestamp);
}

function App() {
  const [wallet, setWallet] = useState<User | null>(null);
  const [selectedChain, setSelectedChain] = useState<Chain>("ETH");
  const [sendChain, setSendChain] = useState<Chain>("ETH");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [chains, setChains] = useState<ChainInfo[]>(FALLBACK_CHAINS);
  const [ownerAddress, setOwnerAddress] = useState("");
  const [importAddress, setImportAddress] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [amount, setAmount] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const selectedBalance = wallet?.chains[selectedChain] ?? 0;
  const activeMeta = CHAIN_META[selectedChain];
  const isOwnerWallet = wallet?.address === ownerAddress;
  const selectedBalanceUsd = selectedBalance * activeMeta.usdRate;

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

  const refresh = useCallback(async () => {
    if (!wallet) return;
    setRefreshing(true);
    try {
      await Promise.all([loadWallet(wallet.address), loadTransactions(wallet.address)]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to refresh wallet.");
    } finally {
      setRefreshing(false);
    }
  }, [loadTransactions, loadWallet, wallet]);

  useEffect(() => {
    api<{ chains: ChainInfo[] }>("/chains")
      .then((data) => {
        setChains(data.chains);
      })
      .catch(() => undefined);
    api<{ address: string }>("/owner")
      .then((data) => setOwnerAddress(data.address))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!wallet) return undefined;
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
      setWallet(user);
      setTransactions([]);
      setImportAddress("");
      setNotice("Wallet created with zero balances on every chain.");
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
      amount: override?.amount ?? Number(amount)
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
    setNotice("Address copied.");
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

        {!wallet ? (
          <div className="welcome">
            <div className="orbital-wallet">
              <Wallet size={44} />
            </div>
            <h1>Xchain Wallet</h1>
            <p>Create or import a closed-system wallet for Ethereum, Bitcoin, and BNB Chain.</p>
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
              <span className="eyebrow">Wallet address</span>
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
                  {chain.symbol}
                </button>
              ))}
            </div>

            <div className="balance-card" style={{ "--accent": activeMeta.accent } as React.CSSProperties}>
              <span className="eyebrow">{activeMeta.name} balance</span>
              <div className="balance-line">
                <span>{formatNumber(selectedBalance)}</span>
                <strong>{selectedChain}</strong>
              </div>
              <div className="usd-line">{formatUsd(selectedBalanceUsd)}</div>
              <div className="rate-line">1 {selectedChain} = {formatUsd(activeMeta.usdRate)}</div>
              <div className="delay-row">
                <Clock3 size={15} />
                Confirmations complete in {activeMeta.delay}
              </div>
            </div>

            <div className="actions-grid">
              <form className="send-card" onSubmit={sendTransaction}>
                <div className="section-title">
                  <Send size={18} />
                  <h2>Send tokens</h2>
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
                  To address
                  <input value={toAddress} onChange={(event) => setToAddress(event.target.value)} placeholder="0x..." />
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
                <button type="button" onClick={copyAddress}>
                  <Copy size={18} /> Copy address
                </button>
                {isOwnerWallet ? <p className="owner-note">Owner wallet can send to created Xchain accounts.</p> : null}
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
                  {tx.status === "confirmed" ? <CircleCheck size={18} /> : <Clock3 size={18} />}
                </div>
                <div className="tx-main">
                  <div className="tx-topline">
                    <strong>{incoming ? "Received" : "Sent"} {formatNumber(tx.amount)} {tx.chain}</strong>
                    <span className={`status ${tx.status}`}>{tx.status}</span>
                  </div>
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

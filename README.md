# Xchain Wallet

A closed-system, multi-chain crypto wallet. It does not connect to real blockchains, MetaMask, real crypto networks, or external APIs.

## Features

- Create wallets with zero initial balances on ETH, BTC, and BNB.
- Import any wallet address into the in-memory system, also starting at zero if it does not exist.
- Owner wallet can send tokens to existing user wallets.
- Separate balances and histories for Ethereum, Bitcoin, and BNB Chain.
- Pending transactions confirm after chain-specific delays:
  - ETH: 3 seconds
  - BTC: 10 seconds
  - BNB: 1 second
- Balances update only after confirmation.
- React dashboard auto-refreshes balances and transaction status.
- User wallet send attempts are declined with a contact admin message.

## Run locally

```bash
npm install
npm run dev
```

Open the Vite URL shown in your terminal, usually:

```text
http://localhost:5173
```

You can also run the backend only:

```bash
node server.js
```

The API runs on:

```text
http://localhost:4000
```

## Deploy

For one public full-stack service:

```bash
npm install
npm run build
node server.js
```

The Express server serves the React build from `dist/` and the API from the same domain.

Suggested host settings:

```text
Build command: npm install && npm run build
Start command: node server.js
```

## API

```text
POST /wallet/create
POST /wallet/import
GET  /wallet/:address
GET  /balance/:address/:chain
POST /tx/send
GET  /tx/:address?chain=optional
GET  /chains
GET  /owner
```

## Notes

Created and imported user wallets never receive signup funds. Only the seeded owner wallet can send to created Xchain Wallet accounts.

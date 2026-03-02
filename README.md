# FanFundingAlgorand

An Algorand TestNet dApp where creators mint ASA-based “NFTs” and supporters donate ALGO directly to creators.

## Tech stack

- Next.js (App Router)
- Algorand: `algosdk`
- Wallets: Kibisis + Pera via `@txnlab/use-wallet`
- Storage: IPFS via Pinata

## 📦 Installation

```bash
npm install
```

## 🔧 Development

```bash
npm run dev
```

## Environment variables

Create `.env.local`:

- `PINATA_JWT` (required for minting)

## Health check

- `GET /api/health` returns:

```json
{
	"algod": "ok",
	"indexer": "ok",
	"pinata": "configured"
}
```

## 🌐 Deployment

The app is deployed on Vercel. Environment variables needed:
- `NEXT_PUBLIC_CONTRACT_ADDRESS`
- `NEXT_PUBLIC_NETWORK`
- `NEXT_PUBLIC_RPC_URL`
- `NEXT_PUBLIC_PINATA_JWT`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`


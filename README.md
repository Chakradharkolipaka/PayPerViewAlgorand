# FanFundingAlgorand

An Algorand TestNet dApp where creators mint ASA-based “NFTs” and supporters donate ALGO directly to creators.

## Tech stack

- Next.js (App Router)
- Algorand: `algosdk`
- Wallets: Kibisis (browser extension) via `@txnlab/use-wallet`
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
- `NEXT_PUBLIC_REGISTRY_APP_ID` (required for production discovery; registry TEAL app id)

## 🔁 Workflow (UI + on-chain)

### 1) Connect wallet (Kibisis)

- Click **Kibisis** in the navbar.
- Approve the connection in the Kibisis extension.
- The connected TestNet account address is shown in the navbar.

### 2) Mint NFT (ASA)

On `/mint`:

1. Upload image + enter name/description.
2. Server route `/api/pinata/upload` uploads to Pinata:
	- Image → IPFS
	- Metadata JSON `{ name, description, image }` → IPFS
	- Returns `tokenURI` (HTTP gateway URL)
3. The UI then builds an **Algorand ASA create transaction**:
	- `assetName = name`
	- `assetURL = tokenURI`
	- `total = 1`, `decimals = 0` (NFT-like)
4. The unsigned transaction is encoded and sent to Kibisis for signing via `@txnlab/use-wallet`.
5. After confirmation, the UI calls the **FanFunding Registry TEAL App**:
	- App call args: `"register"`, `assetId`
	- Foreign assets: `[assetId]`
	This writes an on-chain mapping `assetId -> creator` in app global state.

### 3) Dashboard discovery

On `/`:

- `GET /api/nfts` reads the registry app global state (canonical on-chain registry).
- For each registered `assetId`, the API looks up the asset params and returns simplified NFT cards.

### 4) Donate / fund

- The **Fan Donate** button builds a normal ALGO payment txn to the creator address.
- Kibisis signs, the app submits, then confirmation updates the UI.

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

If deploying to Vercel (or similar), set:

- `PINATA_JWT`

### Deploying the Registry Smart Contract (TestNet)

The dApp requires a stateful TEAL registry app. You deploy it **once** to TestNet, then set the created app id in:

- `NEXT_PUBLIC_REGISTRY_APP_ID`

#### 1) Local deployment (recommended for testing)

1. Fund a TestNet account (deployer).
2. Add the deployer mnemonic to your shell env (do **not** commit it):

```bash
export DEPLOYER_MNEMONIC="your 25-word mnemonic here"
```

3. Deploy:

```bash
npm run deploy:registry
```

This will:
- Compile TEAL via Algod
- Create the app
- Write `NEXT_PUBLIC_REGISTRY_APP_ID=<appId>` into `.env.local`

#### 2) Vercel deployment (CI-style)

Vercel doesn’t run “one-off deploy scripts” automatically on every deploy unless you explicitly do so.

Recommended production approach:

1. Deploy the registry app locally once (section above).
2. Set these env vars in Vercel:
	- `PINATA_JWT`
	- `NEXT_PUBLIC_REGISTRY_APP_ID`

If you *must* deploy from CI, do it in a **separate secure workflow** (GitHub Actions) that:
- Stores `DEPLOYER_MNEMONIC` as an encrypted secret
- Runs `npm run deploy:registry`
- Writes the resulting App ID to a secure place (and then you copy it into Vercel env)

Never put `DEPLOYER_MNEMONIC` in any `NEXT_PUBLIC_...` env var.


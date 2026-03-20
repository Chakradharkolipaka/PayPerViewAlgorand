 # PayPerViewAlgorand

Pay Per View: an Algorand TestNet video platform where creators mint **video NFTs** and viewers pay a **fixed ALGO ticket** per watch.

## Links

- App: https://pay-per-view-algorand.vercel.app/
- GitHub: https://github.com/Chakradharkolipaka/PayPerViewAlgorand
- Wallet (Pera Algo Wallet): https://perawallet.app/
- TestNet faucet: https://lora.algokit.io/testnet/fund

## Tech stack

- Next.js (App Router)
- Algorand: `algosdk`
- Wallet: Pera Algo Wallet (mobile)
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

### 1) Connect wallet (Pera)

- Click **Connect Pera** in the navbar.
- Approve the connection in the Pera mobile app.
- The connected TestNet account address is shown in the navbar.

### 2) Mint Video NFT (Algorand ASA)

On `/mint`:

1. Upload a video + enter name/description.
2. Server route `/api/pinata/upload` uploads to Pinata:
	- Video → IPFS
	- Metadata JSON `{ name, description, video, mime_type }` → IPFS
	- Returns `tokenURI` (HTTP gateway URL)
3. The UI then builds an **Algorand ASA create transaction**:
	- `assetName = name`
	- `assetURL = tokenURI`
	- `total = 1`, `decimals = 0` (NFT-like)
4. The unsigned transaction is sent to Pera for signing.
5. After confirmation, the UI calls the **FanFunding Registry TEAL App**:
	- App call args: `"register"`, `assetId`
	- Foreign assets: `[assetId]`
	This writes an on-chain mapping `assetId -> creator` in app global state.

### 3) Dashboard discovery

On `/`:

- `GET /api/nfts` reads the registry app global state (canonical on-chain registry).
- For each registered `assetId`, the API looks up the asset params and returns simplified NFT cards.

### 4) Watch (Pay-Per-View)

This project uses an **x402-style gate** for Pay-Per-View.

#### Why x402-style?

The app returns **HTTP 402 Payment Required** from the server until a valid on-chain payment is detected. This keeps the watch flow server-enforced and avoids sending the raw IPFS video URL in query params.

#### Watch flow

1. User clicks **Watch** on a video card.
2. The app navigates to `/watch/[tokenId]`.
3. The page calls:

	- `GET /api/watch/[tokenId]?viewer=<walletAddress>`

4. The server responds:

	**200 OK** (already paid or viewer is owner)
	- `{ tokenId, owner, metadata, videoUrl }`

	**402 Payment Required** (ticket required)
	- `{ requiredPayment: { receiver, amountAlgo, amountMicro, note } }`

5. If 402, the watch page builds a normal Algorand **payment transaction**:

	- `sender = viewer`
	- `receiver = creator`
	- `amount = PAY_PER_VIEW_AMOUNT_ALGO` (microAlgos on-chain)
	- `note = "PayPerView for <tokenId>"`

6. Pera signs, the app submits, then the page retries the gate endpoint. Once it returns 200, the video plays fullscreen.

#### Revenue aggregation

Revenue on `/` and `/api/nfts` is computed by summing payment transactions received by the creator that match the note prefix:

- `PayPerView for <tokenId>`

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


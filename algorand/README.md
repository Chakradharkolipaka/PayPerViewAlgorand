# Algorand smart contract (TEAL app)

This folder contains the stateful Algorand smart contract used by the FanFunding dApp.

## What it does

- Maintains an on-chain registry of minted NFTs (ASAs) by recording `asset_id -> creator address`.
- Allows the UI to discover NFTs **without** relying on Indexer note-prefix hacks.

## Contract interface (high level)

The app is a stateful AVM application (TEAL). It exposes two ABI methods:

- `register(asset_id: uint64)`
  - Sender must be the ASA `creator`.
  - Writes global state keys:
    - `a:<asset_id>` → creator address bytes
- `get_creator(asset_id: uint64) -> address`
  - Returns creator address stored in global state, or zero-address if missing.

The UI mints an ASA, then calls `register(asset_id)` to register it.

## Build

Contract is written in PyTeal and compiled to TEAL during deployment.

See `deploy.py` for deployment.

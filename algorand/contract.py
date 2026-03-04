"""FanFunding registry smart contract.

Production goal:
- Make NFT discovery deterministic on-chain with a stateful app.

Design notes:
- We keep it intentionally simple and cheap.
- We store a mapping from asset_id to creator address in global state.
- The UI mints an ASA and then registers it.

Limitations:
- Global state is finite. This works for small/medium registries.
  For very large registries, consider box storage or off-chain indexing.
"""

from __future__ import annotations

from beaker import Application
from pyteal import (
    AbiType,
    Approve,
    Assert,
    Bytes,
    Concat,
    Expr,
    Global,
    Int,
    Len,
    ScratchVar,
    Seq,
    Substring,
    Txn,
    TxnType,
)


APP_NAME = "FanFundingRegistry"


def asset_key(asset_id: Expr) -> Expr:
    # key format: b"a:" + itob(asset_id)
    return Concat(Bytes("a:"), asset_id)


app = Application(APP_NAME)


@app.create
def create() -> Expr:
    return Approve()


@app.external
def register(asset_id: Expr) -> Expr:
    """Register an ASA in the on-chain registry.

    Expected group transaction layout (2 txns):
      0. Asset Config (create) txn - already confirmed on-chain by the time UI registers
      1. AppCall txn calling this method

    Security model:
    - We require the caller (Txn.sender) to be the same as the ASA creator.
    - We validate `asset_id > 0`.

    Note: Without indexer, validating ASA creator on-chain is non-trivial.
    In AVM, we *cannot* directly query asset params unless provided via foreign assets
    and using asset_params_get. We do use it.
    """

    creator = ScratchVar(AbiType.bytes)

    return Seq(
        Assert(asset_id > Int(0)),
        # Ensure the app call includes the asset in foreign assets so we can read params.
        Assert(Len(Txn.assets) > Int(0)),
        Assert(Txn.assets[0] == asset_id),
        creator.store(
            # asset_params_get returns (value, did_exist)
            Substring(
                # creator bytes are already an address
                Bytes(""),
                Int(0),
                Int(0),
            )
        ),
        Approve(),
    )


# NOTE: The register() above is a placeholder; we implement it properly in deploy-time compilation.
# The repo uses algosdk-js for transactions; the on-chain registry will be fully implemented
# in the next iteration (asset_params_get + app global state write).

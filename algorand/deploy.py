"""Deploy the FanFunding registry app to Algorand TestNet.

This script compiles the PyTeal contract and deploys it.

Auth
- Uses a funded deployer account mnemonic in env var DEPLOYER_MNEMONIC.

Env
- ALGOD_SERVER, ALGOD_TOKEN (optional), ALGOD_PORT (optional)
- DEPLOYER_MNEMONIC

Output
- Writes `algorand/app.json` with the created appId.

Note
- This is intended for production/test deployments, not for runtime browser usage.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from dotenv import load_dotenv

from algosdk import account, mnemonic
from algosdk.v2client.algod import AlgodClient


def get_algod() -> AlgodClient:
    server = os.getenv("ALGOD_SERVER", "https://testnet-api.algonode.cloud")
    token = os.getenv("ALGOD_TOKEN", "")
    port = os.getenv("ALGOD_PORT", "")
    return AlgodClient(token, server, port)


def main() -> None:
    load_dotenv()

    m = os.getenv("DEPLOYER_MNEMONIC")
    if not m:
        raise SystemExit("DEPLOYER_MNEMONIC missing")

    sk = mnemonic.to_private_key(m)
    addr = account.address_from_private_key(sk)

    algod = get_algod()
    sp = algod.suggested_params()

    # Import inside main so requirements are optional until you deploy
    from pyteal import compileTeal, Mode
    from contract_v1 import approval_program, clear_program

    approval = compileTeal(approval_program(), mode=Mode.Application, version=8)
    clear = compileTeal(clear_program(), mode=Mode.Application, version=8)

    # Compile programs
    approval_compiled = algod.compile(approval)["result"]
    clear_compiled = algod.compile(clear)["result"]

    from algosdk.future import transaction

    txn = transaction.ApplicationCreateTxn(
        sender=addr,
        sp=sp,
        on_complete=transaction.OnComplete.NoOpOC,
        approval_program=transaction.base64.b64decode(approval_compiled),
        clear_program=transaction.base64.b64decode(clear_compiled),
        global_schema=transaction.StateSchema(num_uints=0, num_byte_slices=50),
        local_schema=transaction.StateSchema(num_uints=0, num_byte_slices=0),
    )

    stxn = txn.sign(sk)
    txid = algod.send_transaction(stxn)
    res = transaction.wait_for_confirmation(algod, txid, 4)

    app_id = res.get("application-index")
    if not app_id:
        raise SystemExit("Deploy failed: missing application-index")

    out = Path(__file__).resolve().parent / "app.json"
    out.write_text(json.dumps({"appId": int(app_id)}, indent=2))

    print(f"Deployed appId={app_id} to TestNet")


if __name__ == "__main__":
    main()

"""TEAL v8 stateful app for on-chain NFT registry.

Storage:
- global key: b"a:" + itob(asset_id) => creator address bytes

Methods (NoOp calls):
- register(asset_id)  (arg0 = b"register", arg1 = itob(asset_id))
- get_creator(asset_id) is implemented as a read via application global state.
  (Algorand apps can't return values from NoOp to callers without ABI extras; the
  UI reads global state via Indexer/algod.

Security:
- Requires Txn.sender == asset_params_get(AssetCreator, asset_id)
- Requires Asset is passed as foreign asset (Txn.assets[0] == asset_id)

This avoids note-prefix indexing and makes the registry canonical on-chain.
"""

from __future__ import annotations

from pyteal import (
    Approve,
    Assert,
    Bytes,
    Concat,
    Cond,
    Expr,
    Global,
    If,
    Int,
    Itob,
    Len,
    OnComplete,
    Reject,
    Seq,
    Subroutine,
    TealType,
    Txn,
    TxnType,
    App,
    AssetParam,
)


PREFIX = Bytes("a:")


@Subroutine(TealType.bytes)
def key_for_asset(asset_id: Expr) -> Expr:
    return Concat(PREFIX, Itob(asset_id))


def approval_program() -> Expr:
    asset_id = Int(0)
    creator = Bytes("")

    # Basic router by first arg
    return Cond(
        [Txn.application_id() == Int(0), Approve()],
        [Txn.on_completion() == OnComplete.DeleteApplication, Reject()],
        [Txn.on_completion() == OnComplete.UpdateApplication, Reject()],
        [Txn.on_completion() == OnComplete.CloseOut, Approve()],
        [Txn.on_completion() == OnComplete.OptIn, Approve()],
        [Txn.on_completion() == OnComplete.ClearState, Approve()],
        [Txn.on_completion() == OnComplete.NoOp,
         Seq(
             Assert(Txn.type_enum() == TxnType.ApplicationCall),
             Assert(Len(Txn.application_args()) >= Int(2)),
             Cond(
                 [Txn.application_args()[0] == Bytes("register"),
                  Seq(
                      asset_id := App.btoi(Txn.application_args()[1]),
                      Assert(asset_id > Int(0)),
                      Assert(Len(Txn.assets()) >= Int(1)),
                      Assert(Txn.assets()[0] == asset_id),
                      (creator := AssetParam.creator(asset_id).value()),
                      Assert(AssetParam.creator(asset_id).hasValue()),
                      Assert(Txn.sender() == creator),
                      App.globalPut(key_for_asset(asset_id), creator),
                      Approve(),
                  )],
                 [Int(1), Reject()],
             ),
         )],
    )


def clear_program() -> Expr:
    return Approve()

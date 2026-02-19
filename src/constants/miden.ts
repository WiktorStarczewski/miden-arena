/** Miden testnet faucet for native MIDEN token */
export const MIDEN_FAUCET_ID = "mtst1aqmat9m63ctdsgz6xcyzpuprpulwk9vg_qruqqypuyph";

/** 1 MIDEN = 10^6 units */
export const MIDEN_DECIMALS = 6;

/** 10 MIDEN stake per player */
export const STAKE_AMOUNT = 10_000_000n;

/** 15 MIDEN to fund session wallet (10 stake + 5 buffer) */
export const FUND_AMOUNT = 15_000_000n;

/** Block offset for P2IDE recall height */
export const RECALL_BLOCK_OFFSET = 200;

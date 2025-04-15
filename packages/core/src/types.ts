/** Basic interface for objects that can be reliably converted to a string. */
export interface Stringifiable {
  toString(): string;
}

/**
 * Represents the unique identifier for each supported DEX/Bridge aggregator.
 */
export enum AggId {
  // Meta-Aggregators (Order matches src/index.ts imports)
  LIFI = "LIFI",
  SOCKET = "SOCKET",
  SQUID = "SQUID",
  RANGO = "RANGO",
  UNIZEN = "UNIZEN",
  ROCKETX = "ROCKETX", // Currently commented out in src/index.ts

  // Passive Liquidity Aggregators (Order matches src/index.ts imports)
  ONE_INCH = "ONE_INCH",
  ZERO_X = "ZERO_X",
  PARASWAP = "PARASWAP",
  ODOS = "ODOS",
  KYBERSWAP = "KYBERSWAP",
  OPENOCEAN = "OPENOCEAN",
  FIREBIRD = "FIREBIRD",
  BEBOP = "BEBOP", // Currently commented out in src/index.ts

  // JIT / Intent-Based / RFQ (Order partially matches src/index.ts commented imports)
  // TODO: Implement full support for gasless/intent types
  DEBRIDGE = "DEBRIDGE",
  COWSWAP = "COWSWAP",
  HASHFLOW = "HASHFLOW",
  AIRSWAP = "AIRSWAP",
  ONE_INCH_FUSION = "ONE_INCH_FUSION",
  PARASWAP_DELTA = "PARASWAP_DELTA",
  UNIZEN_GASLESS = "UNIZEN_GASLESS",
}

/** Supported blockchain types. */
export enum ChainType {
  EVM = "EVM",
  COSMOS = "COSMOS",
  SOLANA = "SOLANA",
  SUI = "SUI",
  APTOS = "APTOS",
}

/** Supported protocol types. */
export enum ProtocolType {
  DEX = "DEX",
  CEX = "CEX",
  OTC = "OTC",
  AGGREGATOR = "AGGREGATOR",
  BRIDGE = "BRIDGE",
}

/** Supported step types. */
export enum StepType {
  SWAP = "SWAP",
  BRIDGE = "BRIDGE",
  CROSS_CHAIN_SWAP = "CROSS_CHAIN_SWAP", // swap + bridge or bridge + swap
  CONTRACT_CALL = "CONTRACT_CALL",
  TRANSFER = "TRANSFER", // eg. fee payment, rerouting...
}

/** Standardized status codes for swap operations. */
export enum OpStatus {
  WAITING = "WAITING",
  PENDING = "PENDING",
  DONE = "DONE",
  FAILED = "FAILED",
  SUCCESS = "SUCCESS",
  NEEDS_GAS = "NEEDS_GAS",
  ONGOING = "ON_GOING", // Consistent casing
  PARTIAL_SUCCESS = "PARTIAL_SUCCESS",
  NOT_FOUND = "NOT_FOUND",
}

/** Specifies the desired output format for data serialization. */
export enum SerializationMode {
  JSON = "JSON",
  CSV = "CSV",
  TABLE = "TABLE",
}

/** Controls how swap results should be presented or filtered. */
export enum DisplayMode {
  // full transaction request with estimates
  ALL = "ALL",
  BEST = "BEST",
  // only built transaction
  ALL_COMPACT = "ALL_COMPACT", // { nonce, value, to, data } json or nonce,value,to,data csv
  BEST_COMPACT = "BEST_COMPACT", // same as above, array
  // ranked transaction request with estimates
  RANK = "RANK",
}

/** Tuple type representing basic token information: [address, symbol, decimals] */
export type TokenInfoTuple = [address: string, symbol: string, decimals?: number];

/**
 * Defines the structure for token information, including address, chain ID, symbol, and decimals.
 */
export interface IToken {
  /** The contract address of the token. */
  chainId: number;
  address?: string;
  name: string;
  symbol?: string;
  decimals: number;
  priceUsd?: string;
  logo?: string; // svg or uri
}

/** Details about the specific tool (protocol/DEX) used in a swap step. */
export interface IProtocol {
  id: string;
  name: string;
  description?: string;
  type?: ProtocolType;
  logo?: string; // svg or uri
}

/**
 * Represents the input token and amount for a swap operation.
 * Includes the payer address, which is the source of the funds.
 */
export interface IInput {
  /** The token to be swapped. */
  token: IToken;
  /** The amount of the input token to swap, in its smallest unit (e.g., wei). */
  amount: string; // Amount in smallest unit (e.g., wei)
  /** The address sending the input tokens (and potentially initiating the transaction). */
  payer: string;
}

/**
 * Represents the desired output token for a swap operation.
 * Optionally includes the receiver address if different from the payer.
 */
export interface IOutput {
  /** The desired output token. */
  token: IToken;
  /**
   * The address that will receive the output tokens.
   * Defaults to the `payer` address from {@link IInput} if not provided.
   */
  receiver?: string;
  /** Optional: Chain ID for the output token, used for cross-chain swaps. Defaults to input chain ID if not provided. */
  chainId?: number;
}

/**
 * Encapsulates all parameters required for a BTR Swap operation.
 * This includes input/output details, slippage tolerance, preferred aggregators, and optional settings.
 */
export interface IBtrSwapParams {
  /** Input token details, amount, and payer address. */
  input: IInput;
  /** Output token details and optional receiver address/chain ID. */
  output: IOutput;
  /**
   * Maximum allowed slippage percentage in basis points (e.g., 50 for 0.5%).
   * Defaults to a value from `@/constants` if not provided.
   */
  maxSlippage?: number;
  /**
   * An array of aggregator IDs to query.
   * If empty or undefined, all supported aggregators may be queried.
   */
  aggIds?: AggId[];
  /** Optional: A unique identifier for tracking or associating the request. */
  requestId?: string;
  /** Internal flag to indicate if parameters have already been processed/overloaded. */
  _overloaded?: boolean;
  /** Optional: Allows specifying the gas price to use for the transaction (implementation depends on the wallet/signer). */
  gasPrice?: string;
  /** Optional: Specifies if the transaction should be gasless (requires EIP-712/1271 signatures and aggregator support). */
  gasless?: boolean;
  /** Optional: Specific fee address for BTR platform fees. */
  feeAddress?: string;
  /** Optional: Referrer address for tracking or fee sharing. */
  referrer?: string;
}

/**
 * Represents a single step within a multi-step swap transaction (e.g., approve, then swap).
 */
export interface IStep {
  /** A descriptive name or type for the step (e.g., "approve", "swap", "bridge"). */
  type: string;
  /** The chain ID where this step occurs. */
  chainId: number;
  /** Input token for this step. */
  fromToken: IToken;
  /** Output token for this step. */
  toToken: IToken;
  /** Estimated amount of input token for this step. */
  fromAmount?: string;
  /** Estimated amount of output token for this step. */
  toAmount?: string;
  /** Estimated gas cost for this step in native currency units. */
  gasCost?: string;
  /** Estimated time for this step in seconds. */
  timeEstimate?: number;
  /** Optional: Detailed breakdown of fees for this step. */
  fees?: any; // TODO: Standardize fee structure
  /** Optional: Underlying tool or protocol used for this step (e.g., "uniswap", "connext"). */
  tool?: string;
}

/**
 * Contains global estimates for the entire swap operation, aggregating data from individual steps.
 */
export interface IGlobalEstimates {
  /** Estimated amount of the output token received, in its smallest unit. */
  toAmount: string;
  /** Estimated total gas cost in native currency units. */
  gasCost?: string;
  /** Estimated total fee amount (platform + LP fees) in USD or native currency. */
  feeCost?: string;
  /** Estimated total time for the entire swap in seconds. */
  timeEstimate?: number;
}

/**
 * Represents the structure of a transaction request, suitable for sending to an Ethereum provider (like ethers.js).
 * Includes essential fields like `to`, `data`, and `value`.
 */
export interface ITransactionRequest {
  /** The target contract address for the transaction. */
  to: string;
  /** The encoded transaction data (including function signature and arguments). */
  data: string;
  /** The amount of native currency (e.g., ETH, MATIC) to send with the transaction, in wei. */
  value: string;
  /** Optional: The gas price to use for the transaction. */
  gasPrice?: string;
  /** Optional: The gas limit to set for the transaction. */
  gasLimit?: string;
  /** Optional: The specific `from` address (usually the payer). */
  from?: string;
}

/**
 * Extends {@link ITransactionRequest} to include swap-specific estimates and details.
 * This is the standard format returned by `getTransactionRequest` in {@link BaseAggregator}.
 */
export interface ITransactionRequestWithEstimate extends ITransactionRequest {
  /** The aggregator that generated this transaction request. */
  aggId: AggId;
  /** Detailed steps involved in the transaction. */
  steps: IStep[];
  /** Global estimates for the entire swap. */
  globalEstimates: IGlobalEstimates;
  /** The original swap parameters used to generate this request. */
  originalParams: IBtrSwapParams;
  /** Latency in milliseconds for the aggregator to generate this transaction request. */
  latencyMs?: number;
}

/**
 * Parameters required for checking the status of a cross-chain transaction.
 */
export interface IStatusParams {
  /** The hash of the transaction initiated on the source chain. */
  txHash: string;
  /** The chain ID of the source chain. */
  fromChainId: number;
  /** The chain ID of the destination chain. */
  toChainId: number;
}

/**
 * Standardized response structure for transaction status checks.
 */
export interface IStatusResponse {
  /** The current status of the transaction (e.g., PENDING, DONE, FAILED). */
  status: OpStatus;
  /** Optional: The hash of the transaction on the destination chain, if completed. */
  destTxHash?: string;
  /** Optional: A message providing more details about the status or any errors. */
  message?: string;
  /** Optional: Link to a block explorer for the source transaction. */
  srcExplorerUrl?: string;
  /** Optional: Link to a block explorer for the destination transaction. */
  destExplorerUrl?: string;
}

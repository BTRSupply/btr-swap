/** Basic interface for objects that can be reliably converted to a string. */
export interface Stringifiable {
  toString(): string;
}

/** Tuple type representing basic token information: [address, symbol, decimals] */
export type TokenInfoTuple = [address: string, symbol: string, decimals?: number];

/** Common token representation used across different aggregators. */
export interface IToken {
  chainId: string | number;
  address?: string;
  name: string;
  symbol: string;
  decimals: number;
  logoURI?: string;
  priceUSD?: string;
}

/** Represents a blockchain transaction request, compatible with ethers.js/viem structures. */
export type TransactionRequest = {
  aggregatorId?: string;
  to?: string;
  from?: string;
  nonce?: bigint | string | Stringifiable;
  gasLimit?: bigint | string | Stringifiable;
  gasPrice?: bigint | string | Stringifiable;
  data?: Uint8Array | string;
  value?: bigint | string | Stringifiable;
  chainId?: number;
  type?: number;
  accessList?: any;
  maxPriorityFeePerGas?: bigint | string | Stringifiable;
  maxFeePerGas?: bigint | string | Stringifiable;
  customData?: Record<string, any>;
};

/** Enumeration of supported DEX aggregators. */
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
  ZERO_X_V2 = "ZERO_X_V2",
  PARASWAP_DELTA = "PARASWAP_DELTA",
  UNIZEN_GASLESS = "UNIZEN_GASLESS",
}

/** Supported blockchain types. */
export enum ChainType {
  EVM = "evm",
  Cosmos = "cosmos",
  Solana = "solana",
  Sui = "sui",
  Aptos = "aptos",
}

/** Represents a custom contract call to be potentially included in a swap route. */
export interface ICustomContractCall {
  toAddress?: string;
  callData: string;
  gasLimit?: string;
  inputPos?: number;
}

/** Core parameters required for fetching a swap quote or transaction. */
export interface ISwapperParams {
  aggregatorId?: string | string[];
  input: string;
  inputChainId: number;
  inputDecimals: number;
  inputSymbol?: string;
  output: string;
  outputChainId?: number;
  outputDecimals: number;
  outputSymbol?: string;
  amountWei: string | number | bigint | Stringifiable;
  payer: string;
  testPayer?: string;
  receiver?: string;
  project?: string;
  integrator?: string;
  referrer?: string;
  maxSlippage?: number;
  customContractCalls?: ICustomContractCall[];
  denyBridges?: string[];
  denyExchanges?: string[];
  receiveGasOnDestination?: boolean;
}

/** Extends the base TransactionRequest with swap-specific estimates and details. */
export interface ITransactionRequestWithEstimate extends TransactionRequest {
  estimatedExchangeRate?: string | number;
  estimatedOutput?: string | number;
  estimatedOutputWei?: Stringifiable | string | bigint;
  estimatedGas?: string | number;
  estimatedSlippage?: string | number;
  steps?: ISwapStep[];
  approvalAddress?: string;
  gasEstimate?: ICostEstimate;
}

/** Represents a fee cost associated with a swap (e.g., protocol fee). */
export interface IFeeCost {
  name: string;
  description?: string;
  percentage: string;
  token: IToken;
  amount?: string;
  amountUSD: string;
  included: boolean;
}

/** Represents a gas cost component of a swap. */
export interface IGasCost {
  type: string;
  price?: string;
  estimate?: string;
  limit?: string;
  amount: string;
  amountUSD?: string;
  token: IToken;
}

/** Represents the estimated outcome and costs of a swap step or the entire swap. */
export interface IEstimate {
  fromAmount?: string;
  toAmount?: string;
  toAmountMin?: string;
  approvalAddress?: string;
  feeCosts?: IFeeCost[];
  gasCosts?: IGasCost[];
  gasEstimate?: string;
}

/** Details about the specific tool (protocol/DEX) used in a swap step. */
export interface IToolDetails {
  key: string;
  logoURI: string;
  name: string;
}

/** Represents a single step within a complex swap route (e.g., swap, bridge). */
export interface ISwapStep {
  id?: string;
  type: string;
  description?: string;
  fromToken?: IToken;
  toToken?: IToken;
  fromAmount?: string;
  toAmount?: string;
  fromChain?: number;
  toChain?: number;
  fromAddress?: string;
  toAddress?: string;
  tool: string;
  toolDetails?: IToolDetails;
  estimate?: IEstimate;
  slippage?: number;
}

/** Consolidated gas and fee estimates for an entire swap transaction. */
export interface ICostEstimate {
  totalGasCostUsd: number;
  totalGasCostWei: bigint;
  totalFeeCostUsd: number;
  totalFeeCostWei: bigint;
}

/** Parameters required by the `addEstimatesToTransactionRequest` utility function. */
export interface IGlobalEstimate {
  steps?: ISwapStep[];
  tr: ITransactionRequestWithEstimate;
  inputAmountWei: bigint;
  outputAmountWei: bigint;
  inputDecimals: number;
  outputDecimals: number;
  approvalAddress: string;
  costEstimate: ICostEstimate;
}

/** Parameters for fetching the status of a transaction. */
export interface IStatusParams {
  AggIds: string[];
  transactionId: string;
  fromChainId?: string;
  toChainId?: string;
  txHash?: string;
}

/** Standardized status codes for swap operations. */
export enum OperationStatus {
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

/** Response structure for transaction status requests. */
export interface IStatusResponse {
  id: string;
  status: OperationStatus;
  txHash?: string;
  receivingTx?: string;
  sendingTx?: string;
  substatus?: string;
  substatusMessage?: string;
}

import type { TransactionRequest } from "./types";
import config from "./config";
import { AggId, IStatusParams, IStatusResponse, IBtrSwapParams } from "./types";

import { MAX_SLIPPAGE_BPS } from "./constants";
import { notImplemented, validateParams, withLatency } from "./utils";
import type { ITransactionRequestWithEstimate } from "./types";

/**
 * Base class for all DEX/Bridge aggregators.
 * Provides common functionality such as configuration loading, parameter validation,
 * chain support checks, and standardized method signatures for quoting and swapping.
 * Specific aggregators should extend this class and implement the abstract methods.
 * @see {@link https://btr.supply/docs} for more details on the BTR Swap architecture.
 */
export abstract class BaseAggregator {
  /** Unique identifier for the aggregator (e.g., "lifi", "socket"). */
  public readonly id: AggId;
  /** API key, if required by the aggregator's service. Read from config. */
  public readonly apiKey: string;
  /** Base URL for the aggregator's API. Read from config. */
  public readonly baseApiUrl: string;
  /** Default integrator identifier used in API requests. Read from config or defaults to "astrolab". */
  public readonly integrator: string;
  /** Optional referrer address for fee sharing or tracking. Read from config. */
  public readonly referrer?: string | `0x${string}`;
  /** Optional fee percentage in basis points (e.g., 50 for 0.5%) applied by BTR. Read from config. */
  public readonly feeBps: number = 0;

  /** Mapping of chain IDs to the aggregator's primary router contract address for that chain. */
  public routerByChainId: { [chainId: number]: string } = {};
  /** Mapping of chain IDs to the alias used by the aggregator's API (e.g., "eth", "1", "polygon"). */
  public aliasByChainId: { [chainId: number]: string | number } = {};
  /** Mapping of chain IDs to the required approval (spender) address for token allowances. Often the same as the router. */
  public approvalAddressByChainId: { [chainId: number]: string } = {};
  /** Mapping of chain IDs to signature receiver addresses for EIP-712/1271 gasless signatures, specific to the aggregator's contracts. */
  public signatureReceiverByChainId: { [chainId: number]: string } = {};

  /**
   * Initializes common properties for an aggregator instance.
   * Reads configuration values like API root, API key, integrator ID, referrer, and fee BPS
   * from the global configuration.
   * @param aggId - The unique identifier for this aggregator (e.g., `AggId.LIFI`).
   * @throws {Error} If configuration is missing or incomplete (e.g., missing `apiRoot`) for the specified `aggId`.
   */
  constructor(aggId: AggId) {
    this.id = aggId;
    // Get configuration from config.ts
    const aggregatorConfig = config[this.id];

    if (!aggregatorConfig) {
      throw new Error(`No configuration found for aggregator ID: ${this.id}`);
    }
    if (!aggregatorConfig.apiRoot) {
      throw new Error(`[${this.id}] Missing base API URL`);
    }
    // Initialize properties from config
    this.baseApiUrl = aggregatorConfig.apiRoot;
    this.apiKey = aggregatorConfig.apiKey ?? "";
    this.integrator = aggregatorConfig.integrator ?? "astrolab";
    this.referrer = String(aggregatorConfig.referrer ?? "");
    this.feeBps = aggregatorConfig.feeBps ?? 0;
  }

  /**
   * Overloads, validates, and sets default values for BTR Swap parameters.
   * - Ensures basic parameter validity (addresses, chain IDs, amounts) using `validateParams`.
   * - Sets default `output.chainId` to `input.chainId` for same-chain swaps if not provided.
   * - Sets default `receiver` to `payer` if not provided.
   * - Ensures the current aggregator's ID is included in `aggIds`.
   * - Sets default `maxSlippage` to `MAX_SLIPPAGE_BPS` (from `../constants`) if not provided.
   * - Marks the parameters as overloaded to prevent redundant processing.
   *
   * Subclasses may override this to add aggregator-specific validation or defaults,
   * but should typically call `super.overloadParams(p)` first.
   *
   * @param p - The input {@link IBtrSwapParams}.
   * @returns The validated and potentially modified {@link IBtrSwapParams}.
   * @throws {Error} If basic parameter validation fails via `validateParams`.
   */
  protected overloadParams = (p: IBtrSwapParams): IBtrSwapParams => {
    if (p.overloaded) return p;
    // Restore validation check
    if (!validateParams(p)) {
      throw new Error(`[${this.id}] Invalid quote parameters: ${JSON.stringify(p)}`);
    }
    p.output.chainId ||= p.input.chainId; // default to monochain swap
    p.receiver ||= p.payer; // default to paying address
    p.aggIds = p.aggIds
      ? p.aggIds.includes(this.id)
        ? p.aggIds
        : [...p.aggIds, this.id]
      : [this.id];
    p.maxSlippage ||= MAX_SLIPPAGE_BPS; // default to 5%
    p.overloaded = true;
    return p;
  };

  /**
   * Gets the base API root URL for a specific chain.
   * The default implementation returns the `baseApiUrl` stored in the instance.
   * Subclasses should override this if the aggregator uses different base URLs per chain
   * (e.g., subdomains like `polygon.api.aggregator.xyz`).
   * Ensures the chain is supported before returning.
   * @param chainId - The chain ID for which to get the API root.
   * @returns The base API root URL string for the specified chain.
   * @throws {Error} If the chain ID is not supported by this aggregator (checked via `ensureChainSupported`).
   */
  protected getApiRoot(chainId: number): string {
    this.ensureChainSupported(chainId);
    return this.baseApiUrl;
  }

  /**
   * Abstract method to convert standardized {@link IBtrSwapParams} into the format
   * expected by the specific aggregator's API for quote or transaction requests.
   * Must be implemented by subclasses.
   * @param params - Standardized BTR Swap parameters.
   * @returns An object containing parameters formatted for the aggregator's API, or `undefined` if conversion is not possible.
   */
  protected abstract convertParams(params: IBtrSwapParams): Record<string, any> | undefined;

  /**
   * Abstract method to fetch a price quote from the aggregator's API.
   * This typically involves calling an endpoint like `/quote` or `/price`.
   * The implementation should handle parameter conversion, API request, response parsing,
   * and basic validation of the quote response.
   * Must be implemented by subclasses.
   * @param params - Standardized BTR Swap parameters, typically processed by `overloadParams`.
   * @returns A promise resolving to the aggregator's specific quote response structure (e.g., `ILifiBestQuote`), or `undefined` if the quote fails.
   */
  public abstract getQuote(params: IBtrSwapParams): Promise<any | undefined>;

  /**
   * Abstract method to fetch the necessary transaction request data from the aggregator's API
   * to execute the swap. This might involve fetching a quote first and then using that
   * quote to build the transaction data (e.g., via a `/swap` or `/build-tx` endpoint).
   * The implementation should return a standardized {@link ITransactionRequestWithEstimate}.
   * Must be implemented by subclasses.
   * @param params - Standardized BTR Swap parameters, typically processed by `overloadParams`.
   * @returns A promise resolving to the formatted {@link ITransactionRequestWithEstimate}, including details like `to`, `data`, `value`, `steps`, and `globalEstimates`, or `undefined` if the request fails.
   */
  public abstract getTransactionRequest(
    params: IBtrSwapParams,
  ): Promise<ITransactionRequestWithEstimate | undefined>;

  /**
   * Fetches the transaction request using `getTransactionRequest` and measures the execution time.
   * Adds the measured latency in milliseconds to the `latencyMs` property of the returned transaction request.
   * @param params - Standard BTR Swap parameters.
   * @returns A promise resolving to the {@link ITransactionRequestWithEstimate} with added `latencyMs`, or `undefined` if `getTransactionRequest` fails.
   * @see {@link withLatency}
   */
  public async getTimedTr(
    params: IBtrSwapParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    const [tr, latencyMs] = await withLatency(() => this.getTransactionRequest(params));
    if (tr) {
      tr.latencyMs = latencyMs;
    }
    return tr;
  }

  /**
   * Fetches the status of a previously executed transaction from the aggregator's API.
   * This is primarily relevant for cross-chain swaps where status tracking is crucial.
   * The default implementation logs a warning and returns `undefined`, indicating it's not supported.
   * Subclasses supporting status checks (like LiFi, Socket) must override this method.
   * @param params - Parameters identifying the transaction, typically including `txHash` and chain IDs ({@link IStatusParams}).
   * @returns A promise resolving to a standardized {@link IStatusResponse} object, or `undefined` if status checking is not supported or the request fails.
   */
  public async getStatus(_params: IStatusParams): Promise<IStatusResponse | undefined> {
    console.warn(`[${this.id}] getStatus is not implemented.`);
    return undefined; // Default implementation: not supported
  }

  /**
   * Checks if a given chain ID is supported by this aggregator.
   * Support is determined by the presence of the chain ID in either the `routerByChainId`
   * or `aliasByChainId` mappings defined in the subclass constructor.
   * @param chainId - The chain ID to check.
   * @returns `true` if the chain is supported, `false` otherwise.
   */
  public isChainSupported(chainId: number): boolean {
    return chainId in this.routerByChainId || chainId in this.aliasByChainId;
  }

  /**
   * Ensures that a given chain ID is supported by this aggregator by calling `isChainSupported`.
   * @param chainId - The chain ID to check.
   * @throws {Error} if the chain ID is not supported by this aggregator.
   */
  public ensureChainSupported(chainId: number): void {
    if (!this.isChainSupported(chainId)) {
      throw new Error(`[${this.id}] Chain ${chainId} not supported`);
    }
  }

  /**
   * Handles errors encountered during aggregator operations (e.g., API requests, parameter conversion).
   * Logs the error message and optionally the stack trace to the console, prefixed with the aggregator ID and context.
   * Subclasses can override this to implement more specific error handling or reporting logic,
   * potentially re-throwing errors or returning specific error codes.
   * The default implementation does not re-throw the error.
   * @param error - The error object or value caught.
   * @param context - A string providing context about the operation where the error occurred (e.g., "getQuote", "getTransactionRequest").
   */
  public handleError(error: unknown, context: string): void {
    // Simple error handling with standard Error objects
    console.error(
      `[${this.id}] ${context} error:`,
      error instanceof Error ? error.message : String(error),
    );

    // Additional logging for debugging if needed
    if (error && typeof error === "object" && "stack" in error) {
      console.debug(`[${this.id}] Error stack:`, (error as Error).stack);
    }
    // throw error;
  }

  /**
   * Gets the primary router contract address for a given chain ID, if defined for this aggregator.
   * Retrieves the address from the `routerByChainId` map.
   * @param chainId - The chain ID.
   * @returns The router address as a string, or `undefined` if no router is defined for the chain.
   */
  public getRouterAddress(chainId: number): string | undefined {
    return this.routerByChainId[chainId];
  }

  /**
   * Gets the required approval (spender) address for token allowances on a specific chain ID.
   * It first checks the `approvalAddressByChainId` map. If no specific approval address is found,
   * it falls back to the router address for that chain obtained via `getRouterAddress`.
   * @param chainId - The chain ID.
   * @returns The approval address as a string, or `undefined` if neither a specific approval address nor a router address is defined for the chain.
   */
  public getApprovalAddress(chainId: number): string | undefined {
    // First check dedicated approval address
    if (chainId in this.approvalAddressByChainId) {
      return this.approvalAddressByChainId[chainId];
    }
    // Fallback to router address
    return this.getRouterAddress(chainId);
  }
}

/**
 * Base class for aggregators that are placeholders, experimental, or not yet fully implemented.
 * Provides default method implementations that throw a "not implemented" error using `notImplemented`.
 */
export abstract class UnimplementedAggregator extends BaseAggregator {
  /** Base URL for the aggregator's API (can be empty for unimplemented). */
  public baseApiUrl: string = "";

  /**
   * @inheritdoc
   * @throws {Error} Always throws "not implemented" error.
   */
  protected convertParams(_params: IBtrSwapParams): Record<string, any> | undefined {
    notImplemented("convertParams");
    return undefined;
  }

  /**
   * @inheritdoc
   * @throws {Error} Always throws "not implemented" error.
   */
  public async getQuote(_params: IBtrSwapParams): Promise<any | undefined> {
    notImplemented("getQuote");
    return undefined;
  }

  /**
   * @inheritdoc
   * @throws {Error} Always throws "not implemented" error.
   */
  public async getTransactionRequest(
    _params: IBtrSwapParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    notImplemented("getTransactionRequest");
    return undefined;
  }
}

/**
 * Abstract base class for JIT (Just-In-Time) / RFQ (Request-for-Quote) based aggregators
 * (e.g., CowSwap, Hashflow, AirSwap).
 * These typically involve off-chain order matching and may require specific signature handling.
 * Currently extends `UnimplementedAggregator` as full JIT support (signatures, order management)
 * is not yet standardized in the base class.
 * @see {@link UnimplementedAggregator}
 */
export abstract class JITAggregator extends UnimplementedAggregator {}

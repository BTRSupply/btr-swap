import {
  AggId,
  ISwapperParams,
  ITransactionRequestWithEstimate,
  IStatusParams,
  IStatusResponse,
} from "./types";

import c, { AggregatorConfig } from "@/config";
import { addresses } from "@/constants";
import { notImplemented } from "@/utils";
import { validateQuoteParams as validateBasicParams } from "@/utils";

/**
 * Base class for all DEX aggregators.
 * Provides common functionality and requires implementation of specific methods.
 */
export abstract class BaseAggregator {
  public readonly id: AggId; // Unique identifier for the aggregator
  public readonly apiKey: string; // API key, if required
  public readonly baseApiUrl: string; // Base URL for the aggregator's API
  public readonly integrator: string; // Default integrator/integrator ID
  public readonly referrer?: string | `0x${string}`; // Referrer address for fee sharing
  public readonly feeBps: number = 0; // Fee percentage in basis points (e.g., 50 for 0.5%)

  // Router addresses by chain ID, specific to the aggregator's contracts
  public routerByChainId: { [chainId: number]: string } = {};
  // Chain aliases used by the API (e.g., "eth", "1", "ethereum")
  public aliasByChainId: { [chainId: number]: string | number } = {};
  // Allowance addresses by chain ID, specific to the aggregator's contracts
  public approvalAddressByChainId: { [chainId: number]: string } = {};
  // Signature receiver addresses by chain ID for EIP 712/1271 gasless signatures, specific to the aggregator's contracts
  public signatureReceiverByChainId: { [chainId: number]: string } = {};

  constructor(aggregatorId: AggId) {
    this.id = aggregatorId;
    // Get configuration from config.ts
    const aggregatorConfig = c[this.id];

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
   * Validates quote parameters including chain support verification.
   * @param p - The swap parameters to validate
   * @returns true if parameters are valid
   * @throws {Error} If parameters are invalid or chains are not supported
   */
  public validateQuoteParams(p: ISwapperParams): ISwapperParams {
    // First validate basic parameter structure using utility function
    if (!validateBasicParams(p)) {
      throw new Error(`[${this.id}] Invalid input parameters`);
    }
    p.aggregatorId = this.id;
    p.outputChainId ||= p.inputChainId; // monochain swaps
    p.receiver ||= p.payer; // default receiver to payer
    for (const chainId of [p.inputChainId, p.outputChainId]) {
      if (!this.isChainSupported(chainId)) {
        throw new Error(`[${this.id}] Chain ${chainId} not supported`);
      }
    }
    const [input, output] = [
      addresses[p.inputChainId].tokens[p.input],
      addresses[p.outputChainId!].tokens[p.output],
    ];
    p.input = input[0];
    p.output = output[0];
    p.inputSymbol ||= input[1];
    p.outputSymbol ||= output[1];
    p.inputDecimals ||= input[2] ?? 18;
    p.outputDecimals ||= output[2] ?? 18;
    return p;
  }

  /**
   * Constructs the correct API root URL for a given chain ID based on the aggregator's structure.
   * @param chainId - The chain ID.
   * @returns The API root URL for the given chain
   * @throws {Error} If chain is not supported
   */
  protected getApiRoot(chainId: number): string {
    if (!this.isChainSupported(chainId)) {
      throw new Error(`[${this.id}] Chain ${chainId} not supported`);
    }
    return this.baseApiUrl;
  }

  /**
   * Converts standard swapper parameters into the format required by the specific aggregator's API.
   * @param params - Standard swapper parameters.
   * @returns Parameters formatted for the aggregator's /quote or /swap endpoint, or undefined if conversion fails.
   * @throws {Error} If required parameters are missing or invalid for the specific aggregator.
   */
  protected abstract convertParams(params: ISwapperParams): Record<string, any> | undefined;

  /**
   * Fetches a price quote from the aggregator's API.
   * This typically involves hitting a /quote or /price endpoint.
   * NB: Not all aggregators have a separate public quote endpoint.
   * Implementations should return undefined or throw if not applicable.
   * @param params - Standard swapper parameters.
   * @returns A promise resolving to the aggregator-specific quote data, or undefined if unavailable/not applicable.
   */
  public abstract getQuote(params: ISwapperParams): Promise<any | undefined>;

  /**
   * Fetches the final transaction request data from the aggregator's API.
   * This might involve a /swap, /trade, or /build-tx endpoint, potentially using data from a previous quote.
   * @param params - Standard swapper parameters.
   * @returns A promise resolving to the transaction request suitable for sending to an EVM node, including estimates, or undefined if an error occurs.
   */
  public abstract getTransactionRequest(
    params: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined>;

  /**
   * Fetches the status of a transaction previously submitted via this aggregator.
   * Not all aggregators support or require this.
   * @param params - Parameters identifying the transaction (e.g., tx hash, chain IDs).
   * @returns A promise resolving to the transaction status, or undefined if not supported/found.
   */
  public async getStatus(params: IStatusParams): Promise<IStatusResponse | undefined> {
    console.warn(`[${this.id}] getStatus is not implemented.`);
    return undefined; // Default implementation: not supported
  }

  /**
   * Checks if a given chain ID is supported by this aggregator.
   * A chain is considered supported if it has an entry in either routerByChainId or aliasByChainId.
   * @param chainId - The chain ID to check.
   * @returns True if the chain is supported, false otherwise.
   */
  public isChainSupported(chainId: number): boolean {
    return chainId in this.routerByChainId || chainId in this.aliasByChainId;
  }

  /**
   * Standardized error handling for aggregator API calls.
   * Subclasses can override this to add custom error handling.
   * @param error - The error that occurred.
   * @param context - A string describing where/how the error occurred.
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
   * Fetches the router address for a given chain ID.
   * @param chainId - The chain ID.
   * @returns The router address, or undefined if not found.
   */
  public getRouterAddress(chainId: number): string | undefined {
    return this.routerByChainId[chainId];
  }

  /**
   * Gets the approval address for a specific chain ID.
   * Defaults to the router address if not explicitly set.
   * @param chainId - The chain ID
   * @returns The approval address or undefined if not found
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
 * Base class for aggregators that are not yet implemented.
 * Provides default implementations that throw "not implemented" errors.
 */
export abstract class UnimplementedAggregator extends BaseAggregator {
  public baseApiUrl: string = "";

  /**
   * Gets the API root URL for a given chain ID.
   * @param chainId - The chain ID.
   * @returns The API root URL or undefined if not supported.
   */
  protected getApiRoot(chainId: number): string {
    notImplemented("getApiRoot");
  }

  /**
   * Converts standard parameters to aggregator-specific format.
   * @param params - Standard swapper parameters.
   * @returns Aggregator-specific parameters or undefined.
   */
  protected convertParams(params: ISwapperParams): Record<string, any> | undefined {
    notImplemented("convertParams");
  }

  /**
   * Gets a quote for the swap.
   * @param params - Standard swapper parameters.
   * @returns A promise resolving to the quote or undefined.
   */
  public async getQuote(params: ISwapperParams): Promise<any | undefined> {
    notImplemented("getQuote");
  }

  /**
   * Gets the transaction request for executing the swap.
   * @param params - Standard swapper parameters.
   * @returns A promise resolving to the transaction request or undefined.
   */
  public async getTransactionRequest(
    params: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    notImplemented("getTransactionRequest");
  }
}

/**
 * Currently ALL DISABLED due to permit/signature (EIP 712/1271) encoding dependency.
 */
export abstract class JITAggregator extends UnimplementedAggregator {}

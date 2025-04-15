import {
  IUnizenCrossQuoteResult,
  IUnizenQuoteParams,
  IUnizenQuoteResult,
  IUnizenToken,
} from "./types";

import { BaseAggregator } from "@/abstract";
import { MAX_SLIPPAGE_BPS } from "@/constants";
import {
  AggId,
  IBtrSwapParams,
  IProtocol,
  IStatusParams,
  ISwapStep,
  IToken,
  ITransactionRequestWithEstimate,
  ProtocolType,
  StepType,
} from "@/types";
import {
  addEstimatesToTr,
  buildQueryParams,
  emptyEstimate,
  fetchJson,
  formatError,
  mapKToKV,
} from "@/utils";

/**
 * Unizen Aggregator Implementation.
 * @see https://docs.unizen.io/api-get-started/single-chain-swap
 */
export class Unizen extends BaseAggregator {
  /**
   * Initializes the Unizen aggregator.
   * Sets up router addresses and aliases for supported chains.
   */
  constructor() {
    super(AggId.UNIZEN);
    this.routerByChainId = {
      1: "0xef58B643240178c2BC37681f8d4E50d7Ec37Ee22", // Ethereum
      10: "0xef58B643240178c2BC37681f8d4E50d7Ec37Ee22", // Optimism
      56: "0x42479c390270cBa049A2D10F63bF75d9D0B7a742", // BNB Chain
      130: "0x4039942b38241D62cA8460Ea54A096a5B3e2bf61", // Unichain
      137: "0xef58B643240178c2BC37681f8d4E50d7Ec37Ee22", // Polygon
      146: "0xef58B643240178c2BC37681f8d4E50d7Ec37Ee22", // Sonic
      250: "0x433dA70E79861C265E07953Dde9ce8629a57a589", // Fantom
      8453: "0xef58B643240178c2BC37681f8d4E50d7Ec37Ee22", // Base
      42161: "0xef58B643240178c2BC37681f8d4E50d7Ec37Ee22", // Arbitrum
      43314: "0xef58B643240178c2BC37681f8d4E50d7Ec37Ee22", // Avalanche
      80094: "0x433dA70E79861C265E07953Dde9ce8629a57a589", // Berachain
    };
    this.aliasByChainId = mapKToKV(this.routerByChainId);
    this.approvalAddressByChainId = this.routerByChainId;
  }

  /**
   * Generates the required headers for Unizen API requests.
   * Includes API key if provided.
   * @returns Record<string, string> - Headers object.
   */
  private getHeaders = (): Record<string, string> =>
    this.apiKey ? { "x-api-key": this.apiKey } : {};

  /**
   * Gets the base API URL for a given chain ID.
   * @param chainId - The chain ID.
   * @returns string - The API root URL for the chain.
   * @throws {Error} If the chain ID is not supported.
   */
  protected getApiRoot(chainId: number): string {
    this.ensureChainSupported(chainId);
    return `${this.baseApiUrl}/${this.aliasByChainId[chainId]}`;
  }

  /**
   * Helper function to make requests to the Unizen API.
   * Handles GET and POST requests with proper headers and query/body formatting.
   * @param endpoint - The API endpoint path (e.g., "quote/single").
   * @param params - Query parameters.
   * @param method - HTTP method (GET or POST).
   * @param body - Request body for POST requests.
   * @param chainId - The chain ID for the request.
   * @returns Promise<T> - Parsed JSON response.
   * @template T - Expected response type.
   * @throws {Error} If chainId is missing.
   */
  private apiRequest = async <T = any>(
    endpoint: string,
    params: Record<string, any>, // Make params required for clarity
    method: "GET" | "POST" = "GET",
    body?: any,
    chainId?: number, // Keep chainId optional for potential future use, but require it internally
  ): Promise<T> => {
    if (!chainId) {
      throw new Error("Chain ID is required for Unizen API requests");
    }

    const url = new URL(`${this.getApiRoot(chainId)}/${endpoint}`);
    const queryParams = {
      ...params,
      version: "v2",
      isGasless: false,
    };

    // Filter out undefined values before building query string
    const filteredParams = Object.fromEntries(
      Object.entries(queryParams).filter(([_, v]) => v !== undefined),
    );

    if (method === "GET") {
      url.search = buildQueryParams(filteredParams);
    }

    return fetchJson<T>(url, {
      method,
      headers: {
        ...this.getHeaders(),
        ...(method === "POST" && { "Content-Type": "application/json" }),
      },
      body: method === "POST" && body ? JSON.stringify(body) : undefined,
    });
  };

  /**
   * Type guard to check if a quote response is for a cross-chain swap.
   * @param quote - The quote response object.
   * @returns boolean - True if it's a cross-chain quote, false otherwise.
   */
  private isCrossChainQuote = (
    quote: IUnizenQuoteResult | IUnizenCrossQuoteResult,
  ): quote is IUnizenCrossQuoteResult => {
    return "srcTrade" in quote;
  };

  /**
   * Extracts common quote information (tokens, amounts) from either single or cross-chain quote response.
   * @param quote - The quote response object.
   * @returns Object containing input/output token and amount details.
   */
  private extractQuoteInfo = (quote: IUnizenQuoteResult | IUnizenCrossQuoteResult) => {
    if (this.isCrossChainQuote(quote)) {
      return {
        inputToken: quote.srcTrade.tokenFrom,
        outputToken: quote.dstTrade.tokenTo,
        inputAmount: quote.srcTrade.fromTokenAmount,
        outputAmount: quote.dstTrade.toTokenAmount,
      };
    } else {
      return {
        inputToken: quote.tokenFrom,
        outputToken: quote.tokenTo,
        inputAmount: quote.fromTokenAmount,
        outputAmount: quote.toTokenAmount,
      };
    }
  };

  /**
   * Generates the `excludedDexes` parameter based on BTR Swap blacklists.
   * @param p - BTR Swap parameters.
   * @returns Record<string, string[]> | undefined - Excluded dexes object for Unizen API or undefined if no blacklist.
   */
  private getExcludedDexesList = (p: IBtrSwapParams): Record<string, string[]> | undefined => {
    const denyList = p.exchangeBlacklist?.concat(p.bridgeBlacklist ?? []);
    if (!denyList?.length) return undefined;

    const result: Record<string, string[]> = {
      [p.input.chainId]: denyList,
      ...(p.output.chainId &&
        p.input.chainId !== p.output.chainId && { [p.output.chainId]: denyList }),
    };

    return result;
  };

  /**
   * Converts BTR Swap parameters to the format expected by the Unizen quote API.
   * @param p - BTR Swap parameters.
   * @returns IUnizenQuoteParams - Unizen API compatible quote parameters.
   */
  protected convertParams = (p: IBtrSwapParams): IUnizenQuoteParams => {
    const { input, output, inputAmountWei, payer, receiver, maxSlippage } = p;
    const excludedDexes = this.getExcludedDexesList(p);
    const slippage = (maxSlippage ?? MAX_SLIPPAGE_BPS) / 10000;
    return {
      chainId: String(input.chainId),
      fromTokenAddress: input.address!,
      toTokenAddress: output.address!,
      destinationChainId: String(p.output.chainId),
      amount: String(inputAmountWei),
      sender: payer,
      receiver: receiver ?? undefined,
      slippage,
      // priceImpactProtectionPercentage: slippage,
      isSplit: false,
      excludedDexes: excludedDexes,
      disableEstimate: false,
    };
  };

  /**
   * Checks if the BTR Swap parameters indicate a cross-chain swap.
   * @param p - BTR Swap parameters.
   * @returns boolean - True if it's a cross-chain swap, false otherwise.
   */
  private isCrossChainSwap = (p: IBtrSwapParams): boolean =>
    !!p.output.chainId && p.input.chainId !== p.output.chainId;

  /**
   * Fetches a quote from the Unizen API (handles both single and cross-chain).
   * @param p - BTR Swap parameters.
   * @returns Promise<IUnizenQuoteResult | IUnizenCrossQuoteResult | undefined> - The best quote found or undefined on error.
   */
  public async getQuote(
    p: IBtrSwapParams,
  ): Promise<IUnizenQuoteResult | IUnizenCrossQuoteResult | undefined> {
    try {
      const isCrossChain = this.isCrossChainSwap(p);
      const endpoint = isCrossChain ? "quote/cross" : "quote/single";
      const params = this.convertParams(p);

      const response = await this.apiRequest<IUnizenQuoteResult[] | IUnizenCrossQuoteResult[]>(
        endpoint,
        params,
        "GET",
        undefined,
        Number(p.input.chainId),
      );

      if (!response?.length) {
        throw formatError(
          `Empty ${isCrossChain ? "cross-chain " : ""}quote response from Unizen`,
          404,
          response,
        );
      }

      // Assume the API returns the best quote first
      return response[0];
    } catch (error) {
      this.handleError(
        error,
        `[Unizen] get${this.isCrossChainSwap(p) ? "CrossChain" : "SingleChain"}Quote`,
      );
      return undefined;
    }
  }

  /**
   * Parses Unizen token data into the standardized IToken format.
   * @param token - Token data from Unizen API.
   * @returns IToken - Standardized token information.
   */
  private parseUnizenToken = (token: IUnizenToken): IToken => ({
    ...token,
    address: token.contractAddress,
    logo: "", // Changed from logoURI to logo
  });

  /**
   * Builds a standardized ISwapStep object from Unizen quote data.
   * Calculates estimates for single-chain swaps.
   * @param type - The type of step (SWAP or BRIDGE).
   * @param description - A description for the step.
   * @param quote - The Unizen quote response.
   * @param quoteInfo - Extracted quote information (tokens, amounts).
   * @param payer - The payer address.
   * @returns ISwapStep - Standardized swap step object.
   */
  private buildStep = (
    type: StepType,
    description: string,
    quote: IUnizenQuoteResult | IUnizenCrossQuoteResult,
    quoteInfo: ReturnType<typeof this.extractQuoteInfo>,
    payer: string,
  ): ISwapStep => {
    // TODO: build estimates for cross-chain swaps
    const monoQuote = <IUnizenQuoteResult>quote;
    const gasCostWei = BigInt(monoQuote.gasPrice ?? 0) * BigInt(monoQuote.estimateGas ?? 0);
    const gasCostUsd = monoQuote.gasCostInUSD ?? 0;
    const feeCostWei = BigInt(monoQuote.toTokenAmountWithoutFee) - BigInt(monoQuote.toTokenAmount);
    const feeCostUsd =
      (Number(feeCostWei) / 10 ** monoQuote.tokenTo.decimals) * monoQuote.tokenTo.priceInUsd;
    const inputAmount = Number(quoteInfo.inputAmount) / 10 ** quoteInfo.inputToken.decimals;
    const outputAmount = Number(quoteInfo.outputAmount) / 10 ** quoteInfo.outputToken.decimals;
    const protocols = monoQuote.protocol.map((pr) => pr.name).join("→");
    return {
      type,
      description,
      input: this.parseUnizenToken(quoteInfo.inputToken),
      output: this.parseUnizenToken(quoteInfo.outputToken),
      inputChainId: quoteInfo.inputToken.chainId,
      outputChainId: quoteInfo.outputToken.chainId,
      payer,
      receiver: "", // Determine if receiver info is available/needed
      protocol: {
        id: protocols.toLowerCase(),
        name: protocols,
        logo: "",
        type: this.isCrossChainQuote(quote) ? ProtocolType.BRIDGE : ProtocolType.DEX,
      } as IProtocol,
      estimates: {
        ...emptyEstimate(),
        input: inputAmount,
        inputWei: quoteInfo.inputAmount,
        output: outputAmount,
        outputWei: quoteInfo.outputAmount,
        exchangeRate: outputAmount / inputAmount,
        slippage: quote.slippage ?? 0,
        priceImpact: quote.priceImpact ?? 0,
        feeToken: this.parseUnizenToken(monoQuote.tokenTo),
        feeCostWei,
        feeCostUsd,
        gasCostWei,
        gasCostUsd,
      },
    };
  };

  /**
   * Fetches transaction request data from Unizen to perform a swap.
   * For cross-chain, it gets data for the source chain transaction.
   * @param p - BTR Swap parameters.
   * @returns Promise<ITransactionRequestWithEstimate | undefined> - Formatted transaction request or undefined on error.
   */
  public async getTransactionRequest(
    p: IBtrSwapParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    p = this.overloadParams(p);
    try {
      const quote = await this.getQuote(p);
      if (!quote) {
        // getQuote handles logging the error, just return undefined
        return undefined;
      }

      const isCrossChain = this.isCrossChainQuote(quote);
      let transactionDetails: {
        target: string | undefined;
        data: string | undefined;
        value: bigint;
      };

      if (isCrossChain) {
        const data = quote.transactionData;
        if (!data?.srcCalls?.[0]) {
          throw formatError(
            "Invalid source transaction data from Unizen cross-chain quote",
            400,
            quote,
          );
        }
        transactionDetails = {
          target: data.srcCalls[0].targetExchange,
          data: data.srcCalls[0].data,
          value: quote.nativeValue ? BigInt(quote.nativeValue) : BigInt(0),
        };
      } else {
        const data = quote.transactionData;
        if (!data?.call?.[0]) {
          throw formatError("Invalid transaction data from Unizen single-chain quote", 400, quote);
        }
        transactionDetails = {
          target: data.call[0].targetExchange,
          data: data.call[0].data,
          value: quote.nativeValue ? BigInt(quote.nativeValue) : BigInt(0),
        };
      }

      if (!transactionDetails.target || !transactionDetails.data) {
        throw formatError("Missing target or data in transaction details", 400, quote);
      }

      const quoteInfo = this.extractQuoteInfo(quote);
      const steps: ISwapStep[] = isCrossChain
        ? [
            this.buildStep(
              StepType.CROSS_CHAIN_SWAP,
              `Unizen Cross-Chain Swap via ${(<IUnizenCrossQuoteResult>quote).tradeProtocol || "Bridge"}`,
              quote,
              quoteInfo,
              p.payer,
            ),
          ]
        : [
            this.buildStep(
              StepType.SWAP,
              `Unizen Swap via ${(quote as IUnizenQuoteResult).protocol.map((pr) => pr.name).join(", ")}`,
              quote,
              quoteInfo,
              p.payer,
            ),
          ];

      return addEstimatesToTr({
        to: transactionDetails.target,
        data: transactionDetails.data,
        value: transactionDetails.value,
        from: p.payer,
        chainId: Number(p.input.chainId),
        params: p,
        steps,
      });
    } catch (error) {
      this.handleError(error, "[Unizen] getTransactionRequest");
      return undefined;
    }
  }

  /**
   * Fetches the status of a Unizen transaction.
   * (Currently not implemented - returns placeholder)
   * @param _p - Status parameters (unused).
   * @returns Promise<any | undefined> - Placeholder undefined return.
   */
  public async getStatus(_p: IStatusParams): Promise<any | undefined> {
    console.warn("Unizen getStatus not implemented");
    return undefined;
  }

  /**
   * Helper to potentially fetch the correct target address based on version and chain.
   * (Currently returns router address - needs API verification if dynamic targets exist).
   * @param version - API version (unused).
   * @param chainId - Chain ID.
   * @returns Promise<string | undefined> - The target address or undefined.
   */
  private async getTargetAddress(version: string, chainId: number): Promise<string | undefined> {
    try {
      const response = await this.apiRequest<{ address: string }>(
        `approval/spender?contractVersion=${version}`,
        {}, // Pass empty object if no params besides version/isGasless
        "GET",
        undefined,
        chainId,
      );
      return response.address;
    } catch (e) {
      this.handleError(e, "[Unizen] getTargetAddress");
      return undefined;
    }
  }
}

export const unizenAggregator = new Unizen();

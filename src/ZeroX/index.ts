import { I0xQuoteResponse } from "./types";

import { BaseAggregator } from "@/abstract";
import { MAX_SLIPPAGE_BPS, nativeTokenAddress, zeroAddress } from "@/constants";
import { AggId, ISwapperParams, ITransactionRequestWithEstimate } from "@/types";
import {
  addEstimatesToTransactionRequest,
  buildQueryParams,
  formatError,
  emptyCostEstimate,
  fetchJson,
  mapKToKV,
  toBigInt,
} from "@/utils";

/**
 * 0x (ZeroX) Aggregator Implementation V2 with AllowanceHolder.
 * @see https://0x.org/docs/upgrading/upgrading_to_swap_v2
 */
export class ZeroX extends BaseAggregator {
  constructor() {
    super(AggId.ZERO_X);

    this.routerByChainId = {
      1: "0xdef1c0ded9bec7f1a1670819833240f027b25eff", // Ethereum
      10: "0xdef1c0ded9bec7f1a1670819833240f027b25eff", // Optimism
      56: "0xdef1c0ded9bec7f1a1670819833240f027b25eff", // BNB Chain
      137: "0xdef1c0ded9bec7f1a1670819833240f027b25eff", // Polygon
      324: "0xdef1c0ded9bec7f1a1670819833240f027b25eff", // zkSync Era
      8453: "0xdef1c0ded9bec7f1a1670819833240f027b25eff", // Base
      42161: "0xdef1c0ded9bec7f1a1670819833240f027b25eff", // Arbitrum
      43114: "0xdef1c0ded9bec7f1a1670819833240f027b25eff", // Avalanche
    };
    this.aliasByChainId = mapKToKV(this.routerByChainId);
    this.approvalAddressByChainId = this.routerByChainId;
  }

  /**
   * Returns headers for 0x API v2 requests
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "0x-version": "v2", // Required header for v2 API
    };

    if (this.apiKey) {
      headers["0x-api-key"] = this.apiKey;
    }

    return headers;
  }

  /**
   * Converts standard swapper parameters to 0x API v2 format
   */
  protected convertParams(p: ISwapperParams): Record<string, string | number | undefined> {
    this.validateQuoteParams(p);

    const queryParams: Record<string, string | number | undefined> = {
      chainId: p.inputChainId,
      sellToken: p.input === zeroAddress ? nativeTokenAddress : p.input,
      buyToken: p.output === zeroAddress ? nativeTokenAddress : p.output,
      sellAmount: p.amountWei.toString(),
      taker: p.payer ?? p.testPayer ?? undefined,
      slippageBps: p.maxSlippage ?? MAX_SLIPPAGE_BPS,
    };

    // Add fee parameters if available
    if (this.integrator) {
      queryParams.integrator = this.integrator;
    }

    if (this.referrer && this.feeBps > 0) {
      queryParams.swapFeeRecipient = this.referrer;
      queryParams.swapFeeBps = this.feeBps;
      queryParams.swapFeeToken = queryParams.buyToken as string;
    }

    // Add excluded sources if specified
    if (p.denyExchanges?.length) {
      queryParams.excludedSources = p.denyExchanges.join(",");
    }

    return queryParams;
  }

  /**
   * Gets a quote from the 0x API v2
   */
  public async getQuote(params: ISwapperParams): Promise<I0xQuoteResponse | undefined> {
    try {
      const apiRoot = this.getApiRoot(params.inputChainId);
      const queryParams = this.convertParams(params);

      // taker is required for quote endpoint
      if (!queryParams.taker) {
        throw new Error("[ZeroX] Taker address is required for quote");
      }

      const quoteUrl = `https://${apiRoot}/swap/allowance-holder/quote?${buildQueryParams(queryParams)}`;
      const response = await fetchJson<I0xQuoteResponse>(quoteUrl, { headers: this.getHeaders() });

      if (!response?.buyAmount || !response?.transaction?.to || !response?.transaction?.data) {
        throw formatError("Invalid quote response", 500, response);
      }

      return response;
    } catch (error) {
      this.handleError(error, "[ZeroX] getQuote");
      return undefined;
    }
  }

  /**
   * Fetches a transaction request from the 0x API v2
   */
  public async getTransactionRequest(
    params: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    try {
      if (!params.payer) {
        throw new Error("[ZeroX] Payer address is required");
      }

      // 1. Get quote from 0x API v2
      const quote = await this.getQuote(params);
      if (!quote) return undefined;

      // 2. Check for allowance issues
      if (quote.issues?.allowance) {
        console.warn(
          `[ZeroX] Allowance issue: ${quote.issues.allowance.token} needs approval for ${quote.issues.allowance.spender}`,
        );
      }

      // 3. Get approval address (from issues or router)
      const approvalAddress =
        quote.issues?.allowance?.spender || this.getApprovalAddress(params.inputChainId);
      if (!approvalAddress) {
        throw new Error("[ZeroX] No approval address available");
      }

      // 4. Calculate gas estimate
      const gasEstimate = emptyCostEstimate();
      if (quote.transaction.gasPrice && quote.transaction.gas) {
        gasEstimate.totalGasCostWei =
          BigInt(quote.transaction.gasPrice) * BigInt(quote.transaction.gas);
      }

      // 5. Build transaction with estimates
      return addEstimatesToTransactionRequest({
        tr: {
          from: params.payer,
          to: quote.transaction.to,
          data: quote.transaction.data,
          value: quote.transaction.value,
          gasLimit: quote.transaction.gas,
        },
        inputAmountWei: toBigInt(params.amountWei),
        outputAmountWei: toBigInt(quote.buyAmount),
        inputDecimals: params.inputDecimals,
        outputDecimals: params.outputDecimals,
        approvalAddress,
        costEstimate: gasEstimate,
        steps: this.buildSteps(quote),
      });
    } catch (error) {
      this.handleError(error, "[ZeroX] getTransactionRequest");
      return undefined;
    }
  }

  /**
   * Builds steps information from the quote response
   */
  private buildSteps(quote: I0xQuoteResponse): any[] {
    if (!quote.route?.fills?.length) return [];

    // Group fills by source
    const sourceMap = new Map<string, number>();
    for (const fill of quote.route.fills) {
      sourceMap.set(fill.source, (sourceMap.get(fill.source) || 0) + parseInt(fill.proportionBps));
    }

    // Create steps from sources
    return Array.from(sourceMap.entries()).map(([source, bps]) => ({
      type: "swap",
      tool: source,
      toolDetails: { key: source, name: source, logoURI: "" },
      portion: bps / 10000,
      fromToken: {
        address: quote.sellToken,
        symbol:
          quote.route.tokens.find(t => t.address.toLowerCase() === quote.sellToken.toLowerCase())
            ?.symbol || "",
      },
      toToken: {
        address: quote.buyToken,
        symbol:
          quote.route.tokens.find(t => t.address.toLowerCase() === quote.buyToken.toLowerCase())
            ?.symbol || "",
      },
      fromAmount: quote.sellAmount,
      toAmount: quote.buyAmount,
    }));
  }
}

/**
 * Singleton instance of the ZeroX aggregator
 */
export const zeroXAggregator = new ZeroX();

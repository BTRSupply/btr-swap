import { IRocketXQuoteRequest, IRocketXQuoteResponse } from "./types";

import { BaseAggregator } from "@/abstract";
import { MAX_SLIPPAGE_BPS, zeroAddress } from "@/constants";
import {
  AggId,
  ICostEstimate,
  IStatusParams,
  IStatusResponse,
  ISwapperParams,
  ITransactionRequestWithEstimate,
  TransactionRequest,
} from "@/types";
import { addEstimatesToTransactionRequest, formatError, fetchJson, mapKToKV } from "@/utils";

// RocketX implementation is incomplete due to complex API structure and missing buildTx equivalent

/**
 * RocketX aggregator implementation.
 * Fetches quotes but cannot build transactions yet.
 * @see https://docs.rocketx.exchange/rocketx-docs/developer/apis-and-sdks
 */
export class RocketX extends BaseAggregator {
  constructor() {
    super(AggId.ROCKETX);
    this.routerByChainId = {
      1: "", // Ethereum (dynamic router)
      10: "", // Optimism (dynamic router)
      56: "", // BNB Chain (dynamic router)
      137: "", // Polygon (dynamic router)
      146: "", // Sonic (dynamic router)
      250: "", // Fantom (dynamic router)
      324: "", // zkSync Era (dynamic router)
      8453: "", // Base (dynamic router)
      42161: "", // Arbitrum (dynamic router)
      43114: "", // Avalanche (dynamic router)
    };
    this.aliasByChainId = mapKToKV(this.routerByChainId);
    this.approvalAddressByChainId = {}; // dynamic (delegating to third party routers)
  }

  /**
   * Returns API headers for RocketX requests
   */
  private getHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new Error("[RocketX] Missing API key");
    }

    return {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
    };
  }

  /**
   * Converts standard swapper parameters to RocketX API format.
   * @param p - Standard swapper parameters.
   * @returns The payload object for the RocketX quote endpoint.
   * @throws {Error} If parameters or chains are invalid
   */
  protected convertParams(p: ISwapperParams): IRocketXQuoteRequest {
    this.validateQuoteParams(p);

    const {
      input,
      output,
      amountWei,
      payer,
      receiver,
      maxSlippage,
      inputChainId,
      outputChainId,
      inputDecimals,
      outputDecimals,
    } = p;

    // Validate chain support
    if (!this.isChainSupported(inputChainId)) {
      throw new Error(`Input chain ${inputChainId} not supported by RocketX`);
    }
    if (outputChainId && !this.isChainSupported(outputChainId)) {
      throw new Error(`Output chain ${outputChainId} not supported by RocketX`);
    }

    return {
      fromAddress: payer,
      fromToken: {
        address: input === zeroAddress ? zeroAddress : input,
        chainId: inputChainId,
        decimals: inputDecimals,
        symbol: "SRC", // Placeholder symbol
      },
      toToken: {
        address: output === zeroAddress ? zeroAddress : output,
        chainId: outputChainId ?? inputChainId,
        decimals: outputDecimals,
        symbol: "DST", // Placeholder symbol
      },
      fromAmount: amountWei.toString(),
      slippage: (maxSlippage ?? MAX_SLIPPAGE_BPS) / 100, // Convert BPS to percentage
      receiverAddress: receiver ?? payer,
    };
  }

  /**
   * Fetches a quote from the RocketX API.
   * @param p - The swapper parameters.
   * @returns A promise that resolves to the RocketX quote response, or undefined.
   */
  public async getQuote(p: ISwapperParams): Promise<IRocketXQuoteResponse | undefined> {
    try {
      // 1. Validate parameters and convert to RocketX format
      const quotePayload = this.convertParams(p);

      // 2. Verify API configuration
      if (!this.baseApiUrl) {
        throw new Error("[RocketX] Missing API Base URL");
      }

      // 3. Prepare request
      // RocketX API uses a single base URL for quotes
      const quoteUrl = `${this.baseApiUrl}/api/v1/rocketx/get/quotation`;
      const headers = this.getHeaders();

      // 4. Make API request
      const quoteResponse = await fetchJson<IRocketXQuoteResponse>(quoteUrl, {
        method: "POST",
        headers: headers,
        body: JSON.stringify(quotePayload),
      });

      // 5. Validate response
      if (!quoteResponse.success || !quoteResponse.result) {
        const errorMsg =
          quoteResponse.error?.message || quoteResponse.message || "RocketX quote request failed";
        const errorCode = quoteResponse.error?.code || quoteResponse.status || 500;
        throw formatError(errorMsg, errorCode, quoteResponse);
      }

      return quoteResponse;
    } catch (error) {
      this.handleError(error, "[RocketX] getQuote");
      return undefined;
    }
  }

  /**
   * Fetches a transaction request from the RocketX API.
   * NB: Returns a partial request as RocketX requires a separate buildTx step not implemented here.
   * @param p - The swapper parameters.
   * @returns A promise that resolves to a partial transaction request containing estimates, or undefined.
   */
  public async getTransactionRequest(
    p: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    try {
      // 1. Get quote
      const quoteResponse = await this.getQuote(p);
      if (!quoteResponse?.result) {
        throw new Error("[RocketX] Failed to get quote");
      }

      // 2. Extract data from quote
      const result = quoteResponse.result;
      const inputAmountWei = BigInt(result.fromAmount);
      const outputAmountWei = BigInt(result.toAmount);

      // 3. Calculate gas and fee estimates
      const totalGasCostWei = BigInt(result.estimatedGas ?? "0");
      const serviceFeeAmountWei = BigInt(result.serviceFee?.amount ?? "0");

      const gasEstimate: ICostEstimate = {
        totalGasCostUsd: 0,
        totalGasCostWei: totalGasCostWei,
        totalFeeCostUsd: 0,
        totalFeeCostWei: serviceFeeAmountWei,
      };

      // 4. Create base transaction (no data - requires buildTx)
      const tr: TransactionRequest = {
        from: p.payer,
        to: undefined, // Requires buildTx
        data: undefined, // Requires buildTx
      };

      // 5. Return estimate without full transaction data
      return addEstimatesToTransactionRequest({
        tr: tr,
        inputAmountWei,
        outputAmountWei,
        inputDecimals: p.inputDecimals,
        outputDecimals: p.outputDecimals,
        approvalAddress: zeroAddress, // Placeholder, RocketX needs buildTx
        costEstimate: gasEstimate,
        steps: [],
      });
    } catch (error) {
      this.handleError(error, "[RocketX] getTransactionRequest");
      return undefined;
    }
  }

  /**
   * Status checking not yet implemented for RocketX.
   * @param p - The status parameters.
   * @returns A promise that resolves to undefined as the feature is not implemented.
   */
  public async getStatus(p: IStatusParams): Promise<IStatusResponse | undefined> {
    this.handleError(
      new Error("Status checking not yet implemented for RocketX"),
      "[RocketX] getStatus",
    );
    return undefined;
  }
}

/**
 * Singleton instance of the RocketX aggregator.
 */
export const rocketXAggregator = new RocketX();

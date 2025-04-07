import { IParaSwapRoute, TransactionRequest } from "./types"; // Import types from the new file

import { BaseAggregator } from "@/abstract";
import { AggId, ICostEstimate, ISwapperParams, ITransactionRequestWithEstimate } from "@/types";
import {
  addEstimatesToTransactionRequest,
  buildQueryParams,
  emptyCostEstimate,
  formatError,
  fetchJson,
  mapKToKV,
} from "@/utils";

/**
 * Implementation of the ParaSwap aggregator.
 * Provides access to the ParaSwap API for token swaps and price quotes.
 * @see https://developers.paraswap.io/api/master
 */
export class ParaSwap extends BaseAggregator {
  constructor() {
    super(AggId.PARASWAP);
    this.routerByChainId = {
      // Augustus V6.2
      1: "0x6a000f20005980200259b80c5102003040001068", // Ethereum
      10: "0x6a000f20005980200259b80c5102003040001068", // Optimism
      56: "0x6a000f20005980200259b80c5102003040001068", // BNB Chain
      137: "0x6a000f20005980200259b80c5102003040001068", // Polygon
      250: "0x6a000f20005980200259b80c5102003040001068", // Fantom
      8453: "0x6a000f20005980200259b80c5102003040001068", // Base
      42161: "0x6a000f20005980200259b80c5102003040001068", // Arbitrum
      43114: "0x6a000f20005980200259b80c5102003040001068", // Avalanche
    };
    this.aliasByChainId = mapKToKV(this.routerByChainId); // ParaSwap uses chain ID as string alias
    this.approvalAddressByChainId = this.routerByChainId;
  }

  /**
   * Returns API headers for ParaSwap requests
   */
  private getHeaders(contentType = false): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }
    if (contentType) {
      headers["Content-Type"] = "application/json";
    }
    return headers;
  }

  /**
   * Converts swapper parameters to ParaSwap API format.
   * @param params - The swapper parameters
   * @param excludeRoute - Whether to exclude route information in the response
   * @returns Record of parameters formatted for ParaSwap API
   * @throws Error if chain is not supported
   */
  protected convertParams(params: ISwapperParams, excludeRoute = false): Record<string, any> {
    this.validateQuoteParams(params);

    return {
      network: params.inputChainId,
      side: "SELL",
      srcToken: params.input,
      destToken: params.output,
      amount: params.amountWei.toString(),
      userAddress: params.receiver ?? params.payer,
      integratorId: this.integrator,
      slippage: params.maxSlippage,
      deadline: Math.floor(Date.now() / 1000) + 300, // 5 minutes from now
      ignoreChecks: true,
      ignoreGasEstimate: true,
      otherExchangePrices: !excludeRoute,
    };
  }

  /**
   * Fetches price route from ParaSwap API.
   * @param params - The swapper parameters
   * @returns Promise resolving to price route, or undefined if unavailable
   */
  public async getQuote(params: ISwapperParams): Promise<IParaSwapRoute | undefined> {
    try {
      const url = `${this.getApiRoot(params.inputChainId)}/prices/?${buildQueryParams(this.convertParams(params, true))}`;
      const res = await fetchJson<{ priceRoute: IParaSwapRoute } | { message: string }>(url, {
        headers: this.getHeaders(),
      });

      if ("message" in res) throw formatError(res.message as string, 500, res);
      if (!res?.priceRoute) throw formatError("Invalid response", 500, res);

      return res.priceRoute;
    } catch (error) {
      this.handleError(error, "[ParaSwap] getQuote");
      return undefined;
    }
  }

  /**
   * Fetches a transaction request for a ParaSwap swap.
   * @param params - The swapper parameters
   * @returns Promise resolving to the transaction request with estimates, or undefined
   */
  public async getTransactionRequest(
    params: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    try {
      const priceRoute = await this.getQuote(params);
      if (!priceRoute) throw new Error("Failed to get quote");

      const routerAddress = this.getRouterAddress(params.inputChainId);
      if (!routerAddress) throw new Error(`No router for chain ${params.inputChainId}`);

      // Build transaction
      const buildParams = {
        ...this.convertParams(params),
        priceRoute,
        srcAmount: priceRoute.srcAmount,
        destAmount: priceRoute.destAmount,
        userAddress: params.payer,
        receiver: params.receiver,
        otherExchangePrices: false,
      };

      const url = `${this.getApiRoot(params.inputChainId)}/transactions/${params.inputChainId}`;
      const txRes = await fetchJson<TransactionRequest | { message: string }>(url, {
        method: "POST",
        headers: this.getHeaders(true),
        body: JSON.stringify(buildParams),
      });

      if ("message" in txRes) throw formatError(txRes.message as string, 500, txRes);
      if (!txRes?.data || !txRes?.to) throw formatError("Invalid response", 500, txRes);
      if (txRes.to.toLowerCase() !== routerAddress.toLowerCase())
        throw formatError(`Router mismatch: ${txRes.to} vs ${routerAddress}`, 500, txRes);

      // Build transaction with estimates
      const gasEstimate = {
        ...emptyCostEstimate(),
        totalGasCostUsd: parseFloat(priceRoute.gasCostUSD ?? "0"),
        totalGasCostWei: BigInt(priceRoute.gasCost ?? "0"),
      };

      return addEstimatesToTransactionRequest({
        tr: { ...txRes, from: params.payer },
        inputAmountWei: BigInt(priceRoute.srcAmount),
        outputAmountWei: BigInt(priceRoute.destAmount),
        inputDecimals: priceRoute.srcDecimals,
        outputDecimals: priceRoute.destDecimals,
        approvalAddress: routerAddress,
        costEstimate: gasEstimate,
        steps: [],
      });
    } catch (error) {
      this.handleError(error, "[ParaSwap] getTransactionRequest");
      return undefined;
    }
  }
}

/**
 * Singleton instance of the ParaSwap aggregator.
 */
export const paraSwapAggregator = new ParaSwap();

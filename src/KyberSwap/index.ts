import { IBuildResponse, IQuoteData } from "./types";

import { BaseAggregator } from "@/abstract";
import { MAX_SLIPPAGE_BPS, nativeTokenAddress, zeroAddress } from "@/constants";
import { AggId, ICostEstimate, ISwapperParams, ITransactionRequestWithEstimate } from "@/types";
import {
  addEstimatesToTransactionRequest,
  buildQueryParams,
  emptyCostEstimate,
  fetchJson,
  toBigInt,
  formatError,
} from "@/utils";

/**
 * Implements the swapper interface for KyberSwap.
 * @see https://docs.kyberswap.com/kyberswap-solutions/kyberswap-aggregator/aggregator-api-specification
 */
export class KyberSwap extends BaseAggregator {
  constructor() {
    super(AggId.KYBERSWAP);
    this.routerByChainId = {
      1: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // Ethereum (Universal Router)
      10: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // Optimism
      56: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // BNB Chain
      137: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // Polygon
      146: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // Sonic
      250: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // Fantom
      324: "0x3F95eF3f2eAca871858dbE20A93c01daF6C2e923", // zkSync Specific Router
      1101: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // Polygon zkEVM
      8453: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // Base
      42161: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // Arbitrum
      43114: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // Avalanche
      59144: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // Linea
      534352: "0x6131b5fae19ea4f9d964eac0408e4408b66337b5", // Scroll
    };
    this.aliasByChainId = {
      1: "ethereum",
      10: "optimism",
      56: "bsc",
      137: "polygon",
      146: "sonic",
      250: "fantom",
      324: "zksync",
      1101: "polygon-zkevm",
      8453: "base",
      42161: "arbitrum",
      43114: "avalanche",
      59144: "linea",
      534352: "scroll",
    };
    this.approvalAddressByChainId = this.routerByChainId;
  }

  /**
   * Constructs the KyberSwap API root URL for a given chain ID.
   * Overrides BaseAggregator.getApiRoot to add chain-specific path.
   * @throws {Error} If chain is not supported
   */
  protected getApiRoot(chainId: number): string {
    return `${super.getApiRoot(chainId)}/${this.aliasByChainId[chainId]}/api/v1`;
  }

  /**
   * Gets API headers for KyberSwap requests
   */
  private getHeaders(): Record<string, string> {
    return {
      "x-client-id": this.apiKey || this.integrator,
      "Content-Type": "application/json",
    };
  }

  /**
   * Converts standard swapper parameters to KyberSwap format.
   * @throws {Error} If parameters are invalid
   */
  protected convertParams(p: ISwapperParams): Record<string, string> {
    p = this.validateQuoteParams(p);
    const isNativeSell = p.input.toLowerCase() === zeroAddress;
    const isNativeBuy = p.output.toLowerCase() === zeroAddress;
    return {
      tokenIn: isNativeSell ? nativeTokenAddress : p.input,
      tokenOut: isNativeBuy ? nativeTokenAddress : p.output,
      amountIn: p.amountWei.toString(),
      gasInclude: "true",
    };
  }

  /**
   * Fetches a quote from the KyberSwap API.
   * @returns A promise resolving to the quote data
   * @throws {Error} If API request fails
   */
  public async getQuote(p: ISwapperParams): Promise<IQuoteData> {
    try {
      const routeParams = this.convertParams(p);
      const apiRoot = this.getApiRoot(p.inputChainId);
      const headers = this.getHeaders();

      const quoteUrl = `${apiRoot}/routes?${buildQueryParams(routeParams)}`;
      const quoteResponse = await fetchJson<IQuoteData>(quoteUrl, { headers });

      if (quoteResponse.code !== 0 || !quoteResponse.data?.routeSummary) {
        if (quoteResponse.message && typeof quoteResponse.message === "string") {
          throw formatError(quoteResponse.message, quoteResponse.code, quoteResponse);
        }
        throw formatError(
          quoteResponse.message || `KyberSwap quote failed with code ${quoteResponse.code}`,
          quoteResponse.code || 500,
          quoteResponse,
        );
      }

      return quoteResponse;
    } catch (error: unknown) {
      this.handleError(error, "[KyberSwap] getQuote");
      throw error;
    }
  }

  /**
   * Fetches a transaction request from the KyberSwap API.
   */
  public async getTransactionRequest(
    p: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    try {
      // 1. Get quote
      const quoteResponse = await this.getQuote(p);
      const routeSummary = quoteResponse.data.routeSummary;
      const expectedRouter = this.getRouterAddress(p.inputChainId);

      if (!expectedRouter) {
        throw new Error(`[KyberSwap] Router address not found for chain ${p.inputChainId}`);
      }

      // 2. Build transaction
      const apiRoot = this.getApiRoot(p.inputChainId);
      const buildTxUrl = `${apiRoot}/route/build`;
      const buildTxBody = {
        routeSummary,
        recipient: p.receiver ?? p.payer,
        sender: p.payer,
        slippageTolerance: p.maxSlippage ?? MAX_SLIPPAGE_BPS, // BPS
        source: this.apiKey || this.integrator,
      };

      const buildResponse = await fetchJson<IBuildResponse>(buildTxUrl, {
        method: "POST",
        body: JSON.stringify(buildTxBody),
        headers: this.getHeaders(),
      });

      if (buildResponse.code !== 0 || !buildResponse.data) {
        if (buildResponse.message && typeof buildResponse.message === "string") {
          throw formatError(buildResponse.message, buildResponse.code, buildResponse);
        }
        throw formatError(
          buildResponse.message || `KyberSwap build-tx failed with code ${buildResponse.code}`,
          buildResponse.code || 500,
          buildResponse,
        );
      }

      const txData = buildResponse.data;

      // 3. Verify router address
      if (txData.routerAddress.toLowerCase() !== expectedRouter.toLowerCase()) {
        throw new Error(
          `[KyberSwap] Router address mismatch. Expected ${expectedRouter}, got ${txData.routerAddress}`,
        );
      }

      // 4. Build transaction request
      const isNativeSell = p.input.toLowerCase() === zeroAddress;
      const tr = {
        aggregatorId: AggId.KYBERSWAP,
        approvalAddress: txData.routerAddress,
        from: p.payer,
        to: txData.routerAddress,
        data: txData.data,
        value: isNativeSell ? txData.amountIn : "0",
      };

      const gasEstimate: ICostEstimate = {
        ...emptyCostEstimate(),
        totalGasCostUsd: parseFloat(txData.gasUsd ?? "0"),
      };

      return addEstimatesToTransactionRequest({
        tr: tr as ITransactionRequestWithEstimate,
        inputAmountWei: toBigInt(txData.amountIn),
        outputAmountWei: toBigInt(txData.amountOut),
        inputDecimals: p.inputDecimals,
        outputDecimals: p.outputDecimals,
        approvalAddress: txData.routerAddress,
        costEstimate: gasEstimate,
        steps: [], // KyberSwap API doesn't provide detailed steps
      });
    } catch (error: unknown) {
      this.handleError(error, "[KyberSwap] getTransactionRequest");
      return undefined;
    }
  }
}

/**
 * Singleton instance of the KyberSwap aggregator.
 */
export const kyberSwapAggregator = new KyberSwap();

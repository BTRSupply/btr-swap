import { IOdosAssembleResponse, IOdosQuoteParams, IOdosQuoteResponse } from "./types";

import { BaseAggregator } from "@/abstract";
import { MAX_SLIPPAGE_BPS } from "@/constants";
import { AggId, ISwapperParams, ITransactionRequestWithEstimate } from "@/types";
import {
  addEstimatesToTransactionRequest,
  formatError,
  emptyCostEstimate,
  fetchJson,
  mapKToKV,
  toBigInt,
} from "@/utils";

/**
 * Odos Aggregator Implementation
 * @see https://docs.odos.xyz/product/sor/v2/api-reference
 */
export class Odos extends BaseAggregator {
  constructor() {
    super(AggId.ODOS);
    this.routerByChainId = {
      1: "0x19CeD9a5760383a7F39A542fCcf484bf1668fE70", // Ethereum
      10: "0x4A87236677542A0A0101799F335105e095644F26", // Optimism
      56: "0xC9aE4E6Ed580A6745791F675C10f579f1fc3CCC3", // BNB Chain
      137: "0x2dAc1708C936A04B05A8876C99a718F6507655F0", // Polygon
      324: "0x95142817185A49B040FACacb9096a8576AFD8570", // zkSync Era
      8453: "0xB31e1A6499198127154D474500A0140D7B98C518", // Base
      42161: "0x8f24ABF18c417B956b64385511698464EC19C98b", // Arbitrum
      43114: "0x6E913191760a784Ff05ED7059f3F9199AF76aA6A", // Avalanche
    };
    this.aliasByChainId = mapKToKV(this.routerByChainId);
    this.approvalAddressByChainId = this.routerByChainId;
  }

  /**
   * Returns API headers for Odos requests
   */
  private getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      ...(this.apiKey && { "x-api-key": this.apiKey }),
    };
  }

  /**
   * Converts standard swapper parameters to Odos API format.
   * @throws {Error} If parameters are invalid
   */
  protected convertParams(p: ISwapperParams): IOdosQuoteParams {
    p = this.validateQuoteParams(p);
    return {
      chainId: this.aliasByChainId[p.inputChainId],
      inputTokens: [
        {
          tokenAddress: p.input,
          amount: p.amountWei.toString(),
        },
      ],
      outputTokens: [
        {
          tokenAddress: p.output,
          proportion: 1,
        },
      ],
      userAddr: p.payer,
      slippageLimitPercent: (p.maxSlippage ?? MAX_SLIPPAGE_BPS) / 100,
      referralCode: Number(this.referrer) || 0,
      disableRFQs: true,
      compact: true,
    };
  }

  /**
   * Fetches a quote from the Odos API.
   * @param p - The swapper parameters
   * @returns Promise resolving to the quote response, or undefined if request fails
   */
  public async getQuote(p: ISwapperParams): Promise<IOdosQuoteResponse | undefined> {
    try {
      const quoteRequestBody = this.convertParams(p);
      const apiRoot = this.getApiRoot(p.inputChainId);

      const quoteResponse = await fetchJson<IOdosQuoteResponse>(`${apiRoot}/sor/quote/v2`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(quoteRequestBody),
      });

      if (!quoteResponse.pathId) {
        throw formatError("Quote response missing pathId", 400, quoteResponse);
      }

      return quoteResponse;
    } catch (error: unknown) {
      this.handleError(error, "[Odos] getQuote");
      return undefined;
    }
  }

  /**
   * Fetches a transaction request from the Odos API.
   * Uses the /sor/quote/v2 and /sor/assemble endpoints.
   * @param p - The swapper parameters
   * @returns Promise resolving to the transaction request with estimates, or undefined
   */
  public async getTransactionRequest(
    p: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    try {
      // 1. Get quote
      const quoteResponse = await this.getQuote(p);
      if (!quoteResponse) {
        throw new Error("Failed to get quote from Odos");
      }

      const chainId = p.inputChainId;
      const userAddr = p.payer ?? p.testPayer;
      const routerAddress = this.getRouterAddress(chainId);

      if (!routerAddress) {
        throw new Error(`No router address found for chain ${chainId}`);
      }

      // 2. Assemble transaction
      const apiRoot = this.getApiRoot(chainId);
      const assembleRequestBody = {
        userAddr,
        pathId: quoteResponse.pathId,
        simulate: false,
      };

      const swapData = await fetchJson<IOdosAssembleResponse>(`${apiRoot}/sor/assemble`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify(assembleRequestBody),
      });

      // 3. Validate response
      if (swapData.transaction?.to?.toLowerCase() !== routerAddress.toLowerCase()) {
        throw formatError(
          `Router address mismatch. Expected ${routerAddress}, got ${swapData.transaction?.to}`,
          500,
          swapData,
        );
      }

      if (!swapData.transaction || !swapData.outputTokens || !swapData.outputTokens[0]) {
        throw formatError("Missing critical transaction data", 500, swapData);
      }

      // 4. Build transaction request
      const tr = {
        aggregatorId: AggId.ODOS,
        from: swapData.transaction.from,
        to: swapData.transaction.to,
        data: swapData.transaction.data,
        value: swapData.transaction.value?.toString() || "0",
        approvalAddress: routerAddress,
      };

      return addEstimatesToTransactionRequest({
        tr: tr as ITransactionRequestWithEstimate,
        inputAmountWei: toBigInt(p.amountWei),
        outputAmountWei: toBigInt(swapData.outputTokens[0].amount),
        inputDecimals: p.inputDecimals,
        outputDecimals: p.outputDecimals,
        approvalAddress: routerAddress,
        costEstimate: emptyCostEstimate(),
        steps: [], // Odos doesn't provide steps
      });
    } catch (error: unknown) {
      this.handleError(error, "[Odos] getTransactionRequest");
      return undefined;
    }
  }
}

/**
 * Singleton instance of the Odos aggregator.
 */
export const odosAggregator = new Odos();

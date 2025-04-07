import { IFirebirdEncodeResponse, IFirebirdQuoteParams, IFirebirdQuoteResponse } from "./types";

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
 * Firebird Finance Aggregator Implementation
 * @see https://docs.firebird.finance/developer/api-specification
 */
export class Firebird extends BaseAggregator {
  constructor() {
    super(AggId.FIREBIRD);
    this.routerByChainId = {
      1: "0xe0C38b2a8D09aAD53f1C67734B9A95E43d5981c0",
      10: "0x0c6134Abc08A1EafC3E2Dc9A5AD023Bb08Da86C3",
      56: "0x92e4F29Be975C1B1eB72E77De24Dccf11432a5bd",
      137: "0xb31D1B1eA48cE4Bf10ed697d44B747287E785Ad4",
      250: "0xe0C38b2a8D09aAD53f1C67734B9A95E43d5981c0",
      324: "0xc593dcfD1E4605a6Cd466f5C6807D444414dBc97",
      42161: "0x0c6134Abc08A1EafC3E2Dc9A5AD023Bb08Da86C3",
      43114: "0xe0C38b2a8D09aAD53f1C67734B9A95E43d5981c0",
      8453: "0x20f0b18BDDe8e3dd0e42C173062eBdd05C421151",
    };
    this.aliasByChainId = mapKToKV(this.routerByChainId);
    this.approvalAddressByChainId = this.routerByChainId;
  }

  /**
   * Converts standard ISwapperParams to Firebird's API params.
   * @throws {Error} If parameters are invalid
   */
  protected convertParams(p: ISwapperParams): IFirebirdQuoteParams {
    p = this.validateQuoteParams(p);
    const isNativeSell = p.input === zeroAddress;
    const isNativeBuy = p.output === zeroAddress;
    return {
      chainId: Number(this.aliasByChainId[p.inputChainId]),
      from: isNativeSell ? nativeTokenAddress : p.input,
      to: isNativeBuy ? nativeTokenAddress : p.output,
      amount: p.amountWei.toString(),
      receiver: p.receiver ?? p.payer,
      slippage: (p.maxSlippage ?? MAX_SLIPPAGE_BPS) / 10000, // Convert BPS to decimal
      source: this.integrator,
      ref: p.referrer ?? this.referrer,
    };
  }

  /**
   * Fetches a quote from the Firebird API.
   * @returns A promise resolving to the Firebird quote response.
   */
  public async getQuote(p: ISwapperParams): Promise<IFirebirdQuoteResponse> {
    try {
      const quoteParams = this.convertParams(p);
      const queryParams = buildQueryParams(
        Object.fromEntries(Object.entries(quoteParams).filter(([, v]) => v !== undefined)),
      );

      const apiRoot = this.getApiRoot(p.inputChainId);
      const quoteUrl = `${apiRoot}/quote?${queryParams}`;

      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...(this.apiKey ? { "api-key": this.apiKey } : {}),
      };

      const quoteResponse = await fetchJson<IFirebirdQuoteResponse>(quoteUrl, { headers });

      if (!quoteResponse?.quoteData?.maxReturn) {
        throw formatError("Invalid quote response from Firebird", 500, quoteResponse);
      }

      return quoteResponse;
    } catch (error: unknown) {
      this.handleError(error, "[Firebird] getQuote");
      throw error;
    }
  }

  /**
   * Gets a transaction request for the Firebird swap.
   */
  public async getTransactionRequest(p: ISwapperParams): Promise<ITransactionRequestWithEstimate> {
    try {
      // 1. Get quote
      const quoteResponse = await this.getQuote(p);

      // 2. Encode transaction
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...(this.apiKey ? { "api-key": this.apiKey } : {}),
      };

      const encodeUrl = `${this.baseApiUrl}/encode`;
      const encodeResponse = await fetchJson<IFirebirdEncodeResponse>(encodeUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(quoteResponse),
      });

      if (!encodeResponse?.encodedData?.router || !encodeResponse?.encodedData?.data) {
        throw formatError("Invalid encode response from Firebird", 500, encodeResponse);
      }

      // 3. Build transaction request
      const { quoteData } = quoteResponse;
      const { encodedData } = encodeResponse;
      const isNativeSell = p.input.toLowerCase() === zeroAddress.toLowerCase();

      const tr = {
        aggregatorId: AggId.FIREBIRD,
        approvalAddress: encodedData.router,
        from: p.payer,
        to: encodedData.router,
        data: encodedData.data,
        value: isNativeSell ? p.amountWei.toString() : "0",
      };

      // 4. Add estimates and return
      return addEstimatesToTransactionRequest({
        tr: tr as ITransactionRequestWithEstimate,
        inputAmountWei: toBigInt(p.amountWei),
        outputAmountWei: toBigInt(quoteData.maxReturn.totalTo),
        inputDecimals: p.inputDecimals,
        outputDecimals: p.outputDecimals,
        approvalAddress: encodedData.router,
        costEstimate: emptyCostEstimate(),
        steps: [], // Firebird API doesn't provide steps
      });
    } catch (error: unknown) {
      this.handleError(error, "[Firebird] getTransactionRequest");
      throw error;
    }
  }
}

// Export singleton instance
export const firebirdAggregator = new Firebird();

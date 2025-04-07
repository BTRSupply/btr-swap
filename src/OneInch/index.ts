import { IOneInchQuoteApiResponse, IOneInchSwapApiResponse } from "./types";

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
 * Implementation of the 1inch aggregator for token swaps.
 * Provides access to the 1inch API for quotes and transaction building.
 * @see https://portal.1inch.dev/documentation/swap/swagger
 */
export class OneInch extends BaseAggregator {
  constructor() {
    super(AggId.ONE_INCH);
    this.routerByChainId = {
      1: "0x1111111254EEB25477B68fb85Ed929f73A960582", // Ethereum
      10: "0x1111111254EEB25477B68fb85Ed929f73A960582", // Optimism
      56: "0x1111111254EEB25477B68fb85Ed929f73A960582", // BNB Chain
      137: "0x1111111254EEB25477B68fb85Ed929f73A960582", // Polygon
      250: "0x1111111254EEB25477B68fb85Ed929f73A960582", // Fantom
      8453: "0x1111111254EEB25477B68fb85Ed929f73A960582", // Base
      42161: "0x1111111254EEB25477B68fb85Ed929f73A960582", // Arbitrum
      43114: "0x1111111254EEB25477B68fb85Ed929f73A960582", // Avalanche
    };
    this.aliasByChainId = mapKToKV(this.routerByChainId); // 1inch uses chain ID as string alias
    this.approvalAddressByChainId = this.routerByChainId;
  }

  /**
   * Constructs the 1inch API root URL for a given chain ID.
   * Overrides BaseAggregator.getApiRoot to add chain-specific path.
   * @throws {Error} If chain is not supported
   */
  protected getApiRoot(chainId: number): string {
    return `${super.getApiRoot(chainId)}/${chainId}`;
  }

  /**
   * Returns authentication headers for 1inch API requests
   */
  private getHeaders(): Record<string, string> {
    if (!this.apiKey) {
      throw new Error("[OneInch] Missing API key");
    }

    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  /**
   * Converts standard swapper parameters to 1inch API format.
   * @throws {Error} If parameters are invalid
   */
  protected convertParams(p: ISwapperParams): Record<string, any> {
    this.validateQuoteParams(p);

    const fromAddress = p.payer ?? p.testPayer;
    if (!fromAddress) throw new Error("[OneInch] Missing payer address");

    return {
      src: p.input === zeroAddress ? nativeTokenAddress : p.input,
      dst: p.output === zeroAddress ? nativeTokenAddress : p.output,
      amount: p.amountWei.toString(),
      from: fromAddress,
      ...(p.maxSlippage !== undefined && { slippage: p.maxSlippage / 100 }),
      ...(this.integrator && { referrer: this.integrator }),
      ...(this.referrer && this.feeBps > 0 && { fee: this.feeBps / 10000 }),
    };
  }

  /**
   * Fetches a quote from the 1inch API.
   * @throws {Error} If API request fails
   */
  public async getQuote(p: ISwapperParams): Promise<IOneInchQuoteApiResponse> {
    try {
      const url = `${this.getApiRoot(p.inputChainId)}/quote?${buildQueryParams({
        ...this.convertParams(p),
        includeGas: true,
      })}`;

      const response = await fetchJson<IOneInchQuoteApiResponse>(url, {
        headers: this.getHeaders(),
      });

      if (!response?.gas || !response?.dstAmount) {
        throw formatError("Invalid quote response", 500, response);
      }

      return response;
    } catch (error) {
      this.handleError(error, "[OneInch] getQuote");
      throw error;
    }
  }

  /**
   * Fetches a transaction request for a 1inch swap.
   */
  public async getTransactionRequest(
    p: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    try {
      const chainId = p.inputChainId;
      const apiRoot = this.getApiRoot(chainId);
      const headers = this.getHeaders();
      const approvalAddress = this.getApprovalAddress(chainId);

      if (!approvalAddress) throw new Error(`[OneInch] No approval address for chain ${chainId}`);

      // Prepare request parameters
      const baseParams = this.convertParams(p);
      const urls = {
        quote: `${apiRoot}/quote?${buildQueryParams({ ...baseParams, includeGas: true })}`,
        swap: `${apiRoot}/swap?${buildQueryParams({
          ...baseParams,
          slippage: (p.maxSlippage ?? MAX_SLIPPAGE_BPS) / 100,
          disableEstimate: true,
          receiver: p.receiver,
        })}`,
      };

      // Fetch data in parallel
      const [quote, swap] = await Promise.all([
        fetchJson<IOneInchQuoteApiResponse>(urls.quote, { headers }),
        fetchJson<IOneInchSwapApiResponse>(urls.swap, { headers }),
      ]);

      // Validate responses
      if (!quote?.gas || !swap?.tx || !swap?.dstAmount) {
        throw formatError("Invalid API response", 500, { quote, swap });
      }

      if (swap.tx.to?.toLowerCase() !== approvalAddress.toLowerCase()) {
        throw formatError(`Router mismatch: ${swap.tx.to} vs ${approvalAddress}`, 500, swap);
      }

      // Build transaction with estimates
      return addEstimatesToTransactionRequest({
        tr: { ...swap.tx, from: p.payer },
        inputAmountWei: toBigInt(p.amountWei),
        outputAmountWei: toBigInt(swap.dstAmount),
        inputDecimals: p.inputDecimals,
        outputDecimals: p.outputDecimals,
        approvalAddress,
        costEstimate: emptyCostEstimate(),
        steps: [],
      });
    } catch (error) {
      this.handleError(error, "[OneInch] getTransactionRequest");
      return undefined;
    }
  }
}

/**
 * Singleton instance of the OneInch aggregator.
 */
export const oneInchAggregator = new OneInch();

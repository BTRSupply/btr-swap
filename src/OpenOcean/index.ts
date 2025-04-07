import { IOpenOceanGasPriceResponse, IOpenOceanSwapResponse } from "./types";

import { BaseAggregator } from "@/abstract";
import { MAX_SLIPPAGE_BPS } from "@/constants";
import { AggId, ISwapperParams, ITransactionRequestWithEstimate } from "@/types";
import {
  addEstimatesToTransactionRequest,
  buildQueryParams,
  emptyCostEstimate,
  fetchJson,
  mapKToKV,
  toBigInt,
  formatError,
} from "@/utils";

/**
 * Implementation of the OpenOcean aggregator.
 * Provides access to the OpenOcean API for quotes and transaction building.
 * @see https://docs.openocean.finance/dev/openocean-api-3.0/api-reference
 */
export class OpenOcean extends BaseAggregator {
  constructor() {
    super(AggId.OPENOCEAN);
    // https://apis.openocean.finance/developer/developer-resources/contracts-of-chains
    this.routerByChainId = {
      1: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64", // Ethereum
      10: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64", // Optimism
      56: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64", // BSC
      137: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64", // Polygon
      146: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64", // Sonic
      250: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64", // Fantom
      324: "0x3137b605a638a7f6b87597b6f3aa6d98824a6e26", // zkSync Era
      1101: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64", // Polygon zkEVM
      8453: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64", // Base
      42161: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64", // Arbitrum
      43114: "0x6352a56caadc4f1e25cd6c75970fa768a3304e64", // Avalanche
    };
    this.aliasByChainId = mapKToKV(this.routerByChainId);
    this.approvalAddressByChainId = this.routerByChainId;
  }

  /**
   * Constructs the OpenOcean API root URL for a given chain ID.
   * Overrides BaseAggregator.getApiRoot to add chain-specific path.
   * @throws {Error} If chain is not supported
   */
  protected getApiRoot(chainId: number): string {
    return `${super.getApiRoot(chainId)}/${this.aliasByChainId[chainId]}`;
  }

  /**
   * Converts standard swapper parameters to OpenOcean API format.
   * @throws {Error} If parameters are invalid
   */
  protected convertParams(p: ISwapperParams): Record<string, string> {
    // Use the centralized validation method
    this.validateQuoteParams(p);

    const queryParams: Record<string, string> = {
      inTokenAddress: p.input,
      outTokenAddress: p.output,
      amount: p.amountWei.toString(),
      slippage: ((p.maxSlippage ?? MAX_SLIPPAGE_BPS) * 100).toString(), // Convert percentage to BPS
      account: p.testPayer || p.payer,
    };

    // Add referrer and fee if available
    if (this.referrer) {
      queryParams.referrer = this.referrer;

      if (this.feeBps > 0) {
        queryParams.fee = (this.feeBps / 10000).toString(); // Convert BPS to decimal
      }
    }

    return queryParams;
  }

  /**
   * Fetches a quote from the OpenOcean API.
   * NB: OpenOcean /swap endpoint provides both quote and transaction data.
   * Use getTransactionRequest instead.
   */
  public async getQuote(params: ISwapperParams): Promise<any | undefined> {
    try {
      // Just validate parameters but don't use the result
      this.convertParams(params);
      console.warn("[OpenOcean] getQuote is not applicable, use getTransactionRequest");
      return undefined;
    } catch (error) {
      this.handleError(error, "[OpenOcean] getQuote");
      return undefined;
    }
  }

  /**
   * Fetches current gas price from OpenOcean API for a specific chain.
   * @returns Gas price string or undefined if unavailable
   */
  private async _getGasPrice(chainId: number): Promise<string | undefined> {
    try {
      const apiRoot = this.getApiRoot(chainId);
      const response = await fetchJson<IOpenOceanGasPriceResponse>(`${apiRoot}/gas-price`);

      if (response.code !== 200 || !response.data) {
        throw new Error(`Failed to fetch gas price: ${response.message || "No data"}`);
      }

      const fastPrice = response.data.fast;

      // Handle both EIP-1559 and legacy gas price formats
      if (typeof fastPrice === "object" && fastPrice?.maxFeePerGas) {
        return fastPrice.maxFeePerGas.toString();
      }

      return fastPrice ? fastPrice.toString() : undefined;
    } catch (error) {
      // Don't throw, just log and proceed without gas price
      this.handleError(error, `[OpenOcean] _getGasPrice chain ${chainId}`);
      return undefined;
    }
  }

  /**
   * Fetches a transaction request for an OpenOcean swap.
   */
  public async getTransactionRequest(
    p: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    try {
      const { inputChainId, inputDecimals, outputDecimals } = p;
      const apiRoot = this.getApiRoot(inputChainId);

      // 1. Build Swap Request Parameters
      const queryParams = this.convertParams(p);

      // 2. Add Gas Price (optional)
      const gasPrice = await this._getGasPrice(inputChainId);
      if (gasPrice) {
        queryParams.gasPrice = gasPrice;
      }

      // 3. Fetch Swap Quote & Transaction Data
      const swapUrl = `${apiRoot}/swap?${buildQueryParams(queryParams)}`;
      console.log(`[OpenOcean] Fetching swap from ${swapUrl}`);

      const swapResponse = await fetchJson<IOpenOceanSwapResponse>(swapUrl);
      if (swapResponse.code !== 200 || !swapResponse.data) {
        throw formatError(
          swapResponse.message || "Failed to get swap data",
          swapResponse.code,
          swapResponse,
        );
      }

      const swapData = swapResponse.data;

      // 4. Get Approval Address
      const approvalAddress = this.getApprovalAddress(inputChainId);
      if (!approvalAddress) {
        throw new Error(`No approval address found for chain ${inputChainId}`);
      }

      // 5. Return Transaction with Estimates
      return addEstimatesToTransactionRequest({
        tr: {
          from: swapData.from,
          to: swapData.to,
          data: swapData.data,
          value: swapData.value ? BigInt(swapData.value) : 0n,
        } as ITransactionRequestWithEstimate,
        inputAmountWei: toBigInt(p.amountWei),
        outputAmountWei: toBigInt(swapData.outAmount),
        inputDecimals,
        outputDecimals,
        approvalAddress,
        costEstimate: emptyCostEstimate(),
        steps: [], // OpenOcean API doesn't provide detailed steps
      });
    } catch (error: unknown) {
      this.handleError(error, "[OpenOcean] getTransactionRequest");
      return undefined;
    }
  }
}

/**
 * Singleton instance of the OpenOcean aggregator.
 */
export const openOceanAggregator = new OpenOcean();

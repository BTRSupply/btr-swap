import { IOpenOceanSwapResponse } from "./types";

import { BaseAggregator } from "@/abstract";
import { nativeTokenAddress, zeroAddress } from "@/constants";
import {
  AggId,
  ICostEstimate,
  ISwapEstimate,
  IBtrSwapParams,
  ISwapStep,
  ITransactionRequestWithEstimate,
  ProtocolType,
  StepType,
} from "@/types";
import {
  addEstimatesToTr,
  buildQueryParams,
  emptyCostEstimate,
  fetchJson,
  formatError,
} from "@/utils";

/**
 * OpenOcean Aggregator Implementation.
 * @see https://docs.openocean.finance/api-sdk/api
 */
export class OpenOcean extends BaseAggregator {
  /**
   * Initializes the OpenOcean aggregator.
   * Sets up chain aliases. Router and approval addresses are dynamic.
   */
  constructor() {
    super(AggId.OPENOCEAN);
    // Router/Approval addresses seem dynamic or fetched, keeping maps empty
    this.routerByChainId = {};
    // API uses numeric chain IDs in path
    this.aliasByChainId = {
      1: "eth",
      10: "optimism",
      56: "bsc",
      100: "gnosis",
      137: "polygon",
      250: "fantom",
      8453: "base",
      34443: "mode",
      42161: "arbitrum",
      43114: "avax",
      59144: "linea",
    };
    this.approvalAddressByChainId = {};
  }

  /**
   * Gets the base API URL for a given chain ID for the OpenOcean API.
   * @param chainId - The chain ID.
   * @returns string - The API root URL for the chain.
   * @throws {Error} If the chain ID is not supported.
   */
  protected getApiRoot(chainId: number): string {
    this.ensureChainSupported(chainId);
    return `${this.baseApiUrl}/${this.aliasByChainId[chainId]}`;
  }

  /**
   * Converts BTR Swap parameters to the format expected by the OpenOcean swap API.
   * @param p - BTR Swap parameters.
   * @returns Record<string, any> - OpenOcean API compatible swap parameters.
   */
  protected convertParams(p: IBtrSwapParams): Record<string, any> {
    this.overloadParams(p);
    const { input, output, inputAmountWei, payer, receiver, maxSlippage } = p;
    return {
      // Use token address
      inTokenAddress: input.address === zeroAddress ? nativeTokenAddress : input.address,
      outTokenAddress: output.address === zeroAddress ? nativeTokenAddress : output.address,
      amount: inputAmountWei.toString(),
      // Use p.input.decimals / p.output.decimals
      inTokenDecimals: input.decimals,
      outTokenDecimals: output.decimals,
      slippage: (maxSlippage ?? 100) / 100, // Convert BPS to percentage points
      account: payer,
      recipient: receiver ?? undefined,
      gasPrice: "0", // Let API determine gas price
    };
  }

  /**
   * Minimal implementation for getQuote.
   * OpenOcean combines quote and swap in the `swap` endpoint used by `getTransactionRequest`.
   * This method returns undefined as a separate quote call is not typically needed.
   * @param _p - BTR Swap parameters (unused).
   * @returns Promise<undefined> - Always returns undefined.
   */
  public async getQuote(_p: IBtrSwapParams): Promise<any | undefined> {
    // This implementation doesn't need to fetch a quote as getTransactionRequest
    // handles the combined quote/swap call.
    // Return undefined or throw if a separate quote call is strictly needed elsewhere.
    console.warn("[OpenOcean] getQuote called, but getTransactionRequest is preferred.");
    return undefined;
  }

  /**
   * Internal helper to fetch the current gas price for a chain from OpenOcean API.
   * @param chainId - The chain ID.
   * @returns Promise<string | undefined> - The gas price as a string or undefined if fetch fails.
   */
  private async getGasPrice(chainId: number): Promise<string | undefined> {
    try {
      const apiRoot = this.getApiRoot(chainId);
      const response = await fetchJson<{ standard: string }>(`${apiRoot}/gas-price`);
      return response?.standard;
    } catch (error) {
      console.warn(`[OpenOcean] Failed to fetch gas price for chain ${chainId}:`, error);
      return undefined;
    }
  }

  /**
   * Fetches transaction request data from OpenOcean to perform a swap.
   * Calls the `/swap` endpoint which includes quote information.
   * @param p - BTR Swap parameters.
   * @returns Promise<ITransactionRequestWithEstimate | undefined> - Formatted transaction request or undefined on error.
   */
  public async getTransactionRequest(
    p: IBtrSwapParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    p = this.overloadParams(p);
    try {
      // Use p.input.chainId
      const chainId = Number(p.input.chainId);
      const apiRoot = this.getApiRoot(chainId);
      const queryParams = this.convertParams(p);
      const gasPrice = await this.getGasPrice(chainId);
      if (gasPrice) {
        queryParams.gasPrice = gasPrice;
      }
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
      const approveTo = swapData.to ?? this.getApprovalAddress(chainId);
      if (!approveTo) {
        throw new Error(`[OpenOcean] Could not determine approval address for chain ${chainId}`);
      }
      const inputAmount = Number(p.inputAmountWei) / 10 ** p.input.decimals;
      const outputAmount = Number(swapData.outAmount) / 10 ** p.output.decimals;
      const estimates: ICostEstimate & ISwapEstimate = {
        ...emptyCostEstimate(),
        gasCostWei: BigInt(swapData.estimatedGas || "0"),
        input: inputAmount,
        inputWei: p.inputAmountWei.toString(),
        output: outputAmount,
        outputWei: swapData.outAmount,
        exchangeRate: outputAmount / inputAmount,
        // TODO: add gas/fee estimates
      };

      const steps: ISwapStep[] = [
        {
          type: StepType.SWAP,
          description: "Swap via OpenOcean",
          input: p.input,
          output: p.output,
          inputChainId: chainId,
          outputChainId: chainId, // Assuming same chain swap
          protocol: {
            id: "openocean",
            name: "OpenOcean",
            logo: "",
            type: ProtocolType.AGGREGATOR,
          },
          estimates,
        },
      ];

      return addEstimatesToTr({
        ...swapData,
        from: p.payer,
        chainId: chainId,
        params: p,
        steps,
      });
    } catch (error: unknown) {
      this.handleError(error, "[OpenOcean] getTransactionRequest");
      return undefined;
    }
  }
}

export const openOceanAggregator = new OpenOcean();

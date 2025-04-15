import { BaseAggregator } from "@/abstract";
import { nativeTokenAddress, zeroAddress } from "@/constants";
import {
  AggId,
  IBtrSwapParams,
  ICostEstimate,
  ISwapEstimate,
  ISwapStep,
  ITransactionRequestWithEstimate,
  ProtocolType,
  StepType,
  TransactionRequest,
} from "@/types";
import {
  addEstimatesToTr,
  buildQueryParams,
  emptyEstimate,
  fetchJson,
  formatError,
  mapKToKV,
  toBigInt,
} from "@/utils";

/**
 * KyberSwap Aggregator Implementation.
 * @see https://docs.kyberswap.com/Aggregator/aggregator-api-specification
 */
export class KyberSwap extends BaseAggregator {
  /**
   * Initializes the KyberSwap aggregator.
   * Sets up router addresses and aliases for supported chains.
   */
  constructor() {
    super(AggId.KYBERSWAP);
    this.routerByChainId = {
      1: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5",
      10: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5",
      56: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5",
      137: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5",
      250: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5",
      42161: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5",
      43114: "0x6131B5fae19EA4f9D964eAc0408E4408b66337b5",
    };
    this.aliasByChainId = mapKToKV(this.routerByChainId);
    this.approvalAddressByChainId = this.routerByChainId;
  }

  /**
   * Generates the required headers for KyberSwap API requests.
   * Includes the client ID (integrator name or default).
   * @returns Record<string, string> - Headers object.
   */
  protected getHeaders = (): Record<string, string> => ({
    "x-client-id": this.integrator || "btr-swap-sdk",
  });

  /**
   * Helper function to make requests to the KyberSwap API.
   * Handles GET and POST requests with proper headers and query/body formatting.
   * @param url - The API endpoint URL.
   * @param params - Query parameters for GET requests.
   * @param method - HTTP method (GET or POST).
   * @param body - Request body for POST requests.
   * @returns Promise<T> - Parsed JSON response.
   * @template T - Expected response type.
   */
  private apiRequest = async <T = any>(
    url: string | URL,
    params?: Record<string, any>,
    method: "GET" | "POST" = "GET",
    body?: any,
  ): Promise<T> => {
    const fetchOptions: RequestInit = {
      method,
      headers: this.getHeaders(),
      body: method === "POST" && body ? JSON.stringify(body) : undefined,
    };

    let finalUrl = url;
    if (method === "GET" && params) {
      const urlObj = new URL(url);
      urlObj.search = buildQueryParams(params);
      finalUrl = urlObj.toString();
    }

    return fetchJson<T>(finalUrl, fetchOptions);
  };

  /**
   * Gets the base API URL for a given chain ID.
   * @param chainId - The chain ID.
   * @returns string - The API root URL for the chain.
   * @throws {Error} If the chain ID is not supported.
   */
  protected getApiRoot(chainId: number): string {
    this.ensureChainSupported(chainId);
    return `${this.baseApiUrl}/v1/${this.aliasByChainId[chainId]}`;
  }

  /**
   * Converts BTR Swap parameters to the format expected by KyberSwap API.
   * Handles native token addressing and slippage format.
   * @param p - BTR Swap parameters.
   * @returns Record<string, any> - KyberSwap API compatible parameters.
   */
  protected convertParams = (p: IBtrSwapParams): Record<string, any> => {
    const isNativeSell = p.input.address === zeroAddress;
    const isNativeBuy = p.output.address === zeroAddress;
    return {
      tokenIn: isNativeSell ? nativeTokenAddress : p.input.address!,
      tokenOut: isNativeBuy ? nativeTokenAddress : p.output.address!,
      amountIn: p.inputAmountWei.toString(),
      to: p.receiver ?? p.payer,
      slippageTolerance: (p.maxSlippage ?? 50).toString(),
      clientData: `{"source":"${this.integrator || "btr-swap-sdk"}"}`,
      gasInclude: "1",
      saveGas: "0",
    };
  };

  /**
   * Processes the raw transaction request data from KyberSwap and formats it.
   * Calculates estimates and structures swap steps.
   * @param tx - Partial transaction request data.
   * @param params - Original BTR Swap parameters.
   * @param routeSummary - Summary data from the KyberSwap API response.
   * @returns ITransactionRequestWithEstimate - Formatted transaction request with estimates.
   */
  private processTransactionRequest = (
    tx: Partial<TransactionRequest>,
    params: IBtrSwapParams,
    routeSummary: any,
  ): ITransactionRequestWithEstimate => {
    const inputAmount = Number(params.inputAmountWei) / 10 ** params.input.decimals;
    const outputAmount = Number(routeSummary?.amountOut) / 10 ** params.output.decimals;
    const estimates: ICostEstimate & ISwapEstimate = {
      ...emptyEstimate(),
      gasCostWei: toBigInt(routeSummary?.gasLeft ?? "0"),
      input: inputAmount,
      inputWei: params.inputAmountWei.toString(),
      output: outputAmount,
      outputWei: routeSummary?.amountOut ?? "0",
      exchangeRate: outputAmount / inputAmount,
    };

    const chainId = Number(params.input.chainId);
    const steps: ISwapStep[] = [
      {
        type: StepType.SWAP,
        description: "Swap via KyberSwap",
        input: params.input,
        output: params.output,
        inputChainId: chainId,
        outputChainId: Number(params.output.chainId || params.input.chainId),
        protocol: {
          id: "kyberswap",
          name: "KyberSwap",
          logo: "",
          type: ProtocolType.AGGREGATOR,
        },
        estimates,
      },
    ];

    return addEstimatesToTr({
      ...tx,
      params: params,
      steps: steps,
    });
  };

  /**
   * KyberSwap does not have a separate quote endpoint.
   * This method warns and returns undefined.
   * Use `getTransactionRequest` instead.
   * @param _p - BTR Swap parameters (unused).
   * @returns Promise<undefined> - Always returns undefined.
   */
  public async getQuote(_p: IBtrSwapParams): Promise<any | undefined> {
    console.warn("[KyberSwap] getQuote not implemented, use getTransactionRequest.");
    return undefined;
  }

  /**
   * Fetches transaction request data from KyberSwap to perform a swap.
   * @param p - BTR Swap parameters.
   * @returns Promise<ITransactionRequestWithEstimate | undefined> - The formatted transaction request or undefined if an error occurs.
   */
  public async getTransactionRequest(
    p: IBtrSwapParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    p = this.overloadParams(p);
    try {
      const isNativeSell = p.input.address === zeroAddress;
      const isNativeBuy = p.output.address === zeroAddress;

      const queryParams = {
        tokenIn: isNativeSell ? nativeTokenAddress : p.input.address!,
        tokenOut: isNativeBuy ? nativeTokenAddress : p.output.address!,
        amountIn: p.inputAmountWei.toString(),
        to: p.receiver ?? p.payer,
        saveGas: "0",
        gasInclude: "1",
        slippageTolerance: (p.maxSlippage ?? 50).toString(),
        clientData: `{"source":"${this.integrator || "btr-swap-sdk"}"}`,
      };

      const apiRoot = this.getApiRoot(Number(p.input.chainId));
      const url = `${apiRoot}/route/encode`;

      // Use generic response type if specific one is missing
      const swapData = await this.apiRequest</*IKyberSwapSwapDataResponse*/ any>(url, queryParams);

      const encodedSwapData = swapData?.data?.encodedSwapData;
      const routeSummary = swapData?.data?.routeSummary;
      const routerAddress = swapData?.data?.routerAddress;

      if (!encodedSwapData || !routeSummary || !routerAddress) {
        throw formatError("Invalid response from KyberSwap API", 500, swapData);
      }

      const expectedRouter = this.getRouterAddress(Number(p.input.chainId));
      if (!expectedRouter) {
        throw new Error(`[KyberSwap] Router address not found for chain ${p.input.chainId}`);
      }
      if (expectedRouter.toLowerCase() !== routerAddress.toLowerCase()) {
        console.warn(
          `[KyberSwap] Router address mismatch: Expected ${expectedRouter}, Got ${routerAddress}`,
        );
      }

      const tx: Partial<TransactionRequest> = {
        approveTo: routerAddress,
        from: p.payer,
        to: routerAddress,
        data: encodedSwapData,
        value: isNativeSell ? p.inputAmountWei.toString() : "0",
        chainId: Number(p.input.chainId),
      };

      return this.processTransactionRequest(tx, p, routeSummary);
    } catch (error) {
      this.handleError(error, "[KyberSwap] getTransactionRequest");
      return undefined;
    }
  }
}

export const kyberSwapAggregator = new KyberSwap();

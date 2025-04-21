import { IRangoFee, IRangoPath, IRangoQuoteParams, IRangoRoute, IRangoSwapResponse } from "./types";

import { BaseAggregator } from "../abstract";
import { zeroAddress } from "../constants";
import {
  AggId,
  IBtrSwapParams,
  ICostEstimate,
  IProtocol,
  ISwapStep,
  IToken,
  ITransactionRequestWithEstimate,
  ProtocolType,
  StepType,
  TransactionRequest,
} from "../types";
import {
  addEstimatesToTr,
  buildQueryParams,
  emptyCostEstimate,
  emptyEstimate,
  fetchJson,
  formatError,
} from "../utils";

/**
 * Rango Aggregator Implementation.
 * @see https://docs.rango.exchange/api-integration/basic-api-single-step/sample-transactions
 */
export class Rango extends BaseAggregator {
  /**
   * Initializes the Rango aggregator.
   * Sets up chain aliases for supported chains.
   * Note: Rango uses dynamic router addresses depending on the specific route.
   */
  constructor() {
    super(AggId.RANGO);
    this.routerByChainId = {};
    this.aliasByChainId = {
      1: "ETH",
      10: "OPTIMISM",
      56: "BSC",
      100: "GNOSIS",
      137: "POLYGON",
      250: "FANTOM",
      8453: "BASE",
      42161: "ARBITRUM",
      43114: "AVAX_CCHAIN",
    };
    this.approvalAddressByChainId = {}; // dynamic (delegating to third party routers)
  }

  /**
   * Formats a token into the asset string format expected by Rango API.
   * @param chainId - Chain ID of the token.
   * @param tokenAddress - Address of the token (use zeroAddress for native).
   * @param symbol - Symbol of the token.
   * @returns string - Rango asset string (e.g., "ETH.ETH", "BSC.USDT--0x...).
   */
  private formatRangoAsset = (chainId: number, tokenAddress: string, symbol: string): string => {
    const chain = this.aliasByChainId[chainId];
    return tokenAddress === zeroAddress
      ? `${chain}.${symbol}` // Native token
      : `${chain}.${symbol}--${tokenAddress}`; // Token with address
  };

  /**
   * Generates the required headers for Rango API requests.
   * Includes API key if provided.
   * @returns Record<string, string> - Headers object.
   */
  protected getHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    ...(this.apiKey && { "X-Rango-Id": this.apiKey }),
  });

  /**
   * Helper function to make requests to the Rango API.
   * Handles GET and POST requests with API key and query/body formatting.
   * @param endpoint - The API endpoint path (e.g., "swap").
   * @param params - Query parameters for GET requests.
   * @param method - HTTP method (GET or POST).
   * @param body - Request body for POST requests.
   * @returns Promise<T> - Parsed JSON response.
   * @template T - Expected response type.
   */
  private apiRequest = async <T = any>(
    endpoint: string,
    params?: Record<string, any>,
    method: "GET" | "POST" = "GET",
    body?: any,
  ): Promise<T> => {
    const url = new URL(`${this.baseApiUrl}/${endpoint}`);

    if (this.apiKey && params) params.apiKey = this.apiKey;

    if (method === "GET" && params) {
      url.search = buildQueryParams(
        Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined)),
      );
      return fetchJson<T>(url, { method, headers: this.getHeaders() });
    }

    return fetchJson<T>(url, {
      method,
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
  };

  /**
   * Converts BTR Swap parameters to the format expected by the Rango quote/swap API.
   * @param p - BTR Swap parameters.
   * @returns IRangoQuoteParams - Rango API compatible quote parameters.
   */
  protected convertParams = (p: IBtrSwapParams): IRangoQuoteParams => {
    const fromAddress = p.payer ?? p.testPayer;
    const referrerAddress = p.payer;
    const referrerCode = p.referrer ?? this.referrer;
    return {
      // Access token details from p.input and p.output
      from: this.formatRangoAsset(Number(p.input.chainId), p.input.address!, p.input.symbol!),
      to: this.formatRangoAsset(Number(p.output.chainId), p.output.address!, p.output.symbol!),
      amount: p.inputAmountWei.toString(),
      fromAddress,
      toAddress: p.receiver ?? fromAddress,
      slippage: (p.maxSlippage! / 100).toString(),
      chainId: p.input.chainId.toString(), // Use input chain ID
      ...(referrerAddress && { referrerAddress }),
      referrerFee: "0",
      ...(referrerCode && { referrerCode }),
      disableEstimate: false,
    };
  };

  /**
   * Parses Rango token data into the standardized IToken format.
   * @param token - Token data from Rango API.
   * @returns IToken - Standardized token information.
   */
  private parseToken = (token: any): IToken => ({
    address: token.address ?? "",
    decimals: token.decimals ?? 18,
    symbol: token.symbol ?? "",
    chainId: token.chainId ?? "1",
    name: token.name ?? token.symbol ?? "",
    logo: token.image ?? "",
    priceUsd: token.usdPrice ?? "0",
  });

  /**
   * Parses Rango path steps and route data into the standardized ISwapStep format.
   * @param paths - Array of path steps from Rango API route.
   * @param route - Full route object from Rango API.
   * @returns ISwapStep[] - Array of standardized swap steps.
   */
  private parseSteps = (paths: IRangoPath[], route: IRangoRoute): ISwapStep[] => {
    const steps = paths.map((path) => {
      const inputToken = this.parseToken(path.from);
      const outputToken = this.parseToken(path.to);
      const inputAmount = Number(path.inputAmount) / 10 ** inputToken.decimals;
      const outputAmount = Number(path.expectedOutput) / 10 ** outputToken.decimals;
      const exchangeRate = inputAmount > 0 ? outputAmount / inputAmount : 0;
      return {
        id: path.swapper?.id || "???",
        type: path.swapperType?.toUpperCase() === "DEX" ? StepType.SWAP : StepType.BRIDGE,
        description: path.swapper?.title || "Swap",
        input: inputToken,
        output: outputToken,
        inputChainId: parseInt(path.from.chainId || "1", 10),
        outputChainId: parseInt(path.to.chainId || "1", 10),
        payer: "", // Needs to be filled if available
        receiver: "", // Needs to be filled if available
        protocol: {
          name: path.swapper?.title || "???",
          id: path.swapper?.id || "???",
          logo: path.swapper?.logo || "",
          type: path.swapperType?.toUpperCase() === "DEX" ? ProtocolType.DEX : ProtocolType.BRIDGE,
        } as IProtocol,
        estimates: {
          ...emptyEstimate(),
          input: inputAmount,
          inputWei: path.inputAmount,
          output: outputAmount,
          outputWei: BigInt(path.expectedOutput),
          exchangeRate,
          // TODO: add gas/fee estimates
        },
      };
    });
    // TODO: check if fee.length == steps.length in which case we can probably map them 1:1 instead of this
    steps[0].estimates = {
      ...steps[0].estimates,
      ...this.processCostEstimate(route.fee || []),
    };
    return steps;
  };

  /**
   * Processes Rango fee data into the standardized ICostEstimate format.
   * Calculates total gas and non-gas fees.
   * @param fees - Array of fee objects from Rango API route.
   * @returns ICostEstimate - Standardized cost estimate object.
   */
  private processCostEstimate = (fees: IRangoFee[]): ICostEstimate => {
    const costs = emptyCostEstimate();

    fees.forEach((fee) => {
      const isNetworkFee = fee.name === "Network Fee";
      const tokenPriceUsd = fee.token?.usdPrice || 0;
      const tokenDecimals = fee.token?.decimals || 18;
      // Ensure fee.amount is treated as string for BigInt conversion
      const amountStr = fee.amount ? fee.amount.toString() : "0";
      const amountWei = BigInt(amountStr);
      const amountNum = parseFloat(amountStr);
      const costUsd =
        tokenPriceUsd > 0 && tokenDecimals > 0
          ? (amountNum / 10 ** tokenDecimals) * tokenPriceUsd
          : 0;

      if (isNetworkFee) {
        costs.gasCostUsd += costUsd;
        costs.gasCostWei += amountWei;
      } else {
        costs.feeCostUsd += costUsd;
        costs.feeCostWei += amountWei;
      }
    });
    return costs;
  };

  /**
   * Processes the transaction details and parsed steps into a final estimate.
   * Attaches global estimates (calculated from steps) to the transaction.
   * @param tx - Partial transaction request details.
   * @param params - Original BTR Swap parameters.
   * @param steps - Parsed swap steps with individual estimates.
   * @returns ITransactionRequestWithEstimate - Formatted transaction request with global estimates.
   */
  private processTransactionRequest = (
    tx: Partial<TransactionRequest>, // Base transaction details
    params: IBtrSwapParams, // Original params
    steps: ISwapStep[], // Pre-parsed steps
  ): ITransactionRequestWithEstimate => {
    // Call the updated utility function with the correct structure
    return addEstimatesToTr({
      ...tx,
      params,
      steps,
    });
  };

  /**
   * Internal helper to fetch the full swap response from Rango.
   * Used by both getQuote and getTransactionRequest.
   * @param p - BTR Swap parameters.
   * @returns Promise<IRangoSwapResponse | undefined> - Full swap response or undefined on error.
   * @throws {Error} If the response is invalid or incomplete.
   */
  private async fetchSwapResponse(p: IBtrSwapParams): Promise<IRangoSwapResponse | undefined> {
    // No try/catch here; let callers handle errors
    const swapResponse = await this.apiRequest<IRangoSwapResponse>("swap", this.convertParams(p));
    // Basic validation of the response structure needed for both quote and tx
    if (!swapResponse?.route?.outputAmount) {
      throw formatError(
        "Invalid or incomplete Rango response (missing route or outputAmount)",
        500,
        swapResponse,
      );
    }
    return swapResponse;
  }

  /**
   * Fetches a quote (route details) from the Rango API.
   * Note: Rango's quote endpoint provides full transaction data, so this extracts the route part.
   * @param p - BTR Swap parameters.
   * @returns Promise<IRangoRoute | undefined> - The Rango route details or undefined on error.
   */
  public async getQuote(p: IBtrSwapParams): Promise<IRangoRoute | undefined> {
    p = this.overloadParams(p);
    try {
      const swapResponse = await this.fetchSwapResponse(p);
      // Already validated basic structure in helper
      return swapResponse?.route ?? undefined;
    } catch (error) {
      this.handleError(error, "[Rango] getQuote");
      return undefined;
    }
  }

  /**
   * Fetches transaction request data from Rango to perform a swap.
   * @param p - BTR Swap parameters.
   * @returns Promise<ITransactionRequestWithEstimate | undefined> - Formatted transaction request or undefined on error.
   */
  public async getTransactionRequest(
    p: IBtrSwapParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    p = this.overloadParams(p);
    try {
      const swapResponse = await this.fetchSwapResponse(p);

      if (!swapResponse?.route) {
        // fetchSwapResponse already checks route.outputAmount
        throw formatError("Invalid Rango response (missing route)", 500, swapResponse);
      }

      // Validate fields specific to transaction request after getting response
      if (!swapResponse?.tx?.txTo || !swapResponse?.tx?.txData) {
        throw formatError(
          "Invalid Rango response for transaction (missing tx data)",
          500,
          swapResponse,
        );
      }

      // Parse steps once
      const steps = this.parseSteps(swapResponse.route.path || [], swapResponse.route);

      // Route existence already checked in helper
      return addEstimatesToTr({
        // Base TransactionRequest fields
        to: swapResponse.tx.txTo,
        data: swapResponse.tx.txData,
        value: swapResponse.tx.value ? BigInt(swapResponse.tx.value) : 0n,
        from: p.payer,
        approveTo:
          swapResponse.tx.approveTo ||
          this.getApprovalAddress(p.input.chainId) ||
          swapResponse.tx.txTo,
        // Ensure chainId is number | undefined for TransactionRequest type
        chainId: Number(p.input.chainId),
        aggId: this.id,
        params: p,
        steps,
      });
    } catch (error) {
      this.handleError(error, "[Rango] getTransactionRequest");
      return undefined;
    }
  }
}

export const rangoAggregator = new Rango();

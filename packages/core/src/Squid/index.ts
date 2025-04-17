import {
  IQuoteParams,
  ISquidAction,
  ISquidCustomCall,
  ISquidQuoteResponse,
  IStatusParams as ISquidStatusParams,
  ISquidToken,
  ISquidTransactionStatus,
  SquidCallType,
} from "./types";

import { BaseAggregator } from "@/abstract";
import { IStatusResponse, OpStatus } from "@/types";
import {
  AggId,
  ChainType,
  IBtrSwapParams,
  ICustomContractCall,
  IStatusParams,
  ISwapStep,
  IToken,
  ITransactionRequestWithEstimate,
  ProtocolType,
  StepType,
} from "@/types";
import {
  addEstimatesToTr,
  buildQueryParams,
  emptyEstimate,
  fetchJson,
  formatError,
  mapKToKV,
} from "@/utils";

/**
 * Squid Aggregator Implementation.
 * @see https://docs.squidrouter.com/api-and-sdk-integration/api
 */
export class Squid extends BaseAggregator {
  /**
   * Initializes the Squid aggregator.
   * Sets up router addresses and aliases for supported chains.
   */
  constructor() {
    super(AggId.SQUID);
    this.routerByChainId = {
      1: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
      10: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
      56: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
      137: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
      250: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
      314: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
      1284: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
      2222: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
      5000: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
      8453: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
      42161: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
      42220: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
      43114: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
      59144: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
      534352: "0xce16F69375520ab01377ce7B88f5BA8C48F8D666",
    };
    this.aliasByChainId = mapKToKV(this.routerByChainId);
    this.approvalAddressByChainId = this.routerByChainId;
  }

  /**
   * Generates the required headers for Squid API requests.
   * Includes integrator ID and optionally the Accept header.
   * @param includeAccept - Whether to include the Accept: application/json header.
   * @returns Record<string, string> - Headers object.
   */
  private getHeaders = (includeAccept = false): Record<string, string> => ({
    "Content-Type": "application/json",
    "x-integrator-id": this.integrator,
    ...(includeAccept && { accept: "application/json" }),
    // ...(this.apiKey && { "api-key": this.apiKey }),
  });

  /**
   * Helper function to make requests to the Squid API.
   * Handles GET and POST requests with proper headers and query/body formatting.
   * @param endpoint - The API endpoint path (e.g., "route").
   * @param method - HTTP method (GET or POST).
   * @param params - Query parameters for GET requests.
   * @param body - Request body for POST requests.
   * @returns Promise<T> - Parsed JSON response.
   * @template T - Expected response type.
   */
  private apiRequest = async <T = any>(
    endpoint: string,
    method: "GET" | "POST" = "GET",
    params?: Record<string, any>,
    body?: any,
  ): Promise<T> => {
    const url = new URL(`${this.baseApiUrl}/${endpoint}`);

    if (method === "GET" && params) {
      url.search = buildQueryParams(params);
    }

    return fetchJson<T>(url, {
      method,
      headers: this.getHeaders(method === "GET"),
      body: method === "POST" && body ? JSON.stringify(body) : undefined,
    });
  };

  /**
   * Generates a postHook custom call structure for Squid API.
   * Used for including custom contract interactions after the swap.
   * @param call - Custom contract call details.
   * @param outputToken - Address of the token expected after the swap.
   * @returns ISquidCustomCall - Formatted custom call object for Squid API.
   */
  private generateHook = (call: ICustomContractCall, outputToken: string): ISquidCustomCall => ({
    chainType: ChainType.EVM,
    callType: SquidCallType.FULL_TOKEN_BALANCE,
    target: call.toAddress!,
    value: "0",
    callData: call.callData,
    payload: { tokenAddress: outputToken, inputPos: call.inputPos ?? 0 },
    estimatedGas: call.gasLimit ?? "20000",
  });

  /**
   * Converts BTR Swap parameters to the format expected by Squid API quote endpoint.
   * @param p - BTR Swap parameters.
   * @returns IQuoteParams - Squid API compatible quote parameters.
   */
  protected convertParams = (p: IBtrSwapParams): IQuoteParams => ({
    enableBoost: true,
    fromToken: p.input.address!,
    fromChain: p.input.chainId.toString(),
    toToken: p.output.address!,
    toChain: (p.output.chainId ?? p.input.chainId).toString(),
    fromAddress: p.payer ?? p.testPayer!,
    fromAmount: p.inputAmountWei.toString(),
    toAddress: p.receiver ?? p.payer,
    slippage: p.maxSlippage! / 100,
    slippageConfig: { autoMode: 1 },
    quoteOnly: false,
    receiveGasOnDestination: p.sendGas ?? false,
    // integrator: this.integrator,
    postHook: p.customContractCalls?.length
      ? {
          chainType: ChainType.EVM,
          calls: p.customContractCalls.map((c) => this.generateHook(c, p.output.address!)),
        }
      : undefined,
  });

  /**
   * Parses Squid token data into the standardized IToken format.
   * @param token - Token data from Squid API.
   * @returns IToken - Standardized token information.
   */
  private parseToken = (token?: ISquidToken): IToken => ({
    address: token?.address ?? "",
    decimals: token?.decimals ?? 0,
    symbol: token?.symbol ?? "",
    chainId: parseInt(token?.chainId ?? "0"),
    name: token?.name ?? "",
    logo: token?.logoURI ?? "",
    priceUsd: token?.usdPrice?.toString() ?? "0",
  });

  /**
   * Parses Squid swap/bridge actions into the standardized ISwapStep format.
   * @param steps - Array of actions from Squid API route estimate.
   * @returns ISwapStep[] - Array of standardized swap steps.
   */
  private parseSteps = (steps?: ISquidAction[]): ISwapStep[] => {
    if (!steps?.length) return [];

    return steps.map((step) => {
      const inputAmountWei = BigInt(step.fromAmount ?? "0");
      const inputAmount = Number(inputAmountWei) / 10 ** (step.fromToken?.decimals ?? 0);
      const outputAmountWei = BigInt(step.toAmount ?? "0");
      const outputAmount = Number(outputAmountWei) / 10 ** (step.toToken?.decimals ?? 0);

      return {
        id: step.type || "",
        type:
          step.type === "SWAP"
            ? StepType.SWAP
            : step.type === "BRIDGE_CALL"
              ? StepType.BRIDGE
              : StepType.TRANSFER,
        description: step.description || step.provider || "",
        input: this.parseToken(step.fromToken),
        output: this.parseToken(step.toToken),
        inputChainId: parseInt(step.fromChain),
        outputChainId: parseInt(step.toChain ?? step.fromChain),
        payer: "",
        receiver: "",
        protocol: {
          id: step.provider?.toLowerCase().replace(" ", "-") || "",
          name: step.provider || "",
          logo: step.logoURI,
          type: step.type === "SWAP" ? ProtocolType.DEX : ProtocolType.BRIDGE,
        },
        estimates: {
          ...emptyEstimate(),
          inputWei: inputAmountWei,
          outputWei: outputAmountWei,
          input: inputAmount,
          output: outputAmount,
          exchangeRate: outputAmount / inputAmount,
        },
      };
    });
  };

  /**
   * Calculates the total gas and fee costs from the Squid route estimate.
   * Sums up costs from different tokens/sources.
   * @param estimate - Estimate object from Squid API quote response.
   * @returns Object containing total gas and fee costs in USD and Wei.
   */
  private calculateCosts = (estimate: ISquidQuoteResponse["route"]["estimate"]) => {
    const gasCostUsd = estimate.gasCosts.reduce(
      (sum, c) => sum + parseFloat(c.amountUsd || "0"),
      0,
    );

    const gasCostWei = estimate.gasCosts.reduce(
      (sum, c) => sum + BigInt(c.amount || "0"),
      BigInt(0),
    );

    const feeCostUsd = estimate.feeCosts.reduce(
      (sum, c) => sum + parseFloat(c.amountUsd || "0"),
      0,
    );

    const feeCostWei = estimate.feeCosts.reduce(
      (sum, c) => sum + BigInt(c.amount || "0"),
      BigInt(0),
    );

    return { gasCostUsd, gasCostWei, feeCostUsd, feeCostWei };
  };

  /**
   * Validates the output amount from a Squid quote response.
   * Ensures the final output amount is positive and valid.
   * @param quote - Squid API quote response.
   * @returns boolean - True if the output is valid, false otherwise.
   */
  private isValidOutput = (quote: ISquidQuoteResponse): boolean => {
    if (!quote.route?.estimate?.toAmount) return false;

    const outputAmount = BigInt(quote.route.estimate.toAmount);
    if (outputAmount <= 0n) return false;

    if (!quote.route.estimate.actions?.length) return false;

    const lastAction = quote.route.estimate.actions.slice(-1)[0];
    return !!lastAction.toAmount && BigInt(lastAction.toAmount) > 0n;
  };

  /**
   * Fetches a quote from the Squid API.
   * @param p - BTR Swap parameters.
   * @returns Promise<ISquidQuoteResponse | undefined> - The Squid quote response or undefined on error.
   */
  public async getQuote(p: IBtrSwapParams): Promise<ISquidQuoteResponse | undefined> {
    p = this.overloadParams(p);
    try {
      return await this.apiRequest<ISquidQuoteResponse>(
        "route",
        "POST",
        undefined,
        this.convertParams(p),
      );
    } catch (error) {
      this.handleError(error, "[Squid] getQuote");
      return undefined;
    }
  }

  /**
   * Fetches transaction request data from Squid to perform a swap.
   * Includes processing the quote and formatting the transaction.
   * @param p - BTR Swap parameters.
   * @returns Promise<ITransactionRequestWithEstimate | undefined> - Formatted transaction request or undefined on error.
   */
  public async getTransactionRequest(
    p: IBtrSwapParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    p = this.overloadParams(p);
    try {
      const quote = await this.getQuote(p);

      if (!quote?.route?.transactionRequest) {
        throw formatError("No transaction request found in Squid quote", 400, quote);
      }

      if (!this.isValidOutput(quote)) {
        throw formatError("Squid quote has invalid or zero output amount", 400, quote);
      }

      const tr = quote.route.transactionRequest;
      const steps = this.parseSteps(quote.route.estimate.actions);

      // TODO: if the estimate.gasCosts and estimate.feeCosts arrays map to the steps, we should apply the costs to the steps
      steps[0].estimates = {
        ...steps[0].estimates,
        ...this.calculateCosts(quote.route.estimate),
      };
      tr.to ||= tr.targetAddress || tr.target; // squid v1 polyfill
      tr.value ||= 0n;
      tr.approveTo ||= this.getApprovalAddress(p.input.chainId) || tr.to;

      return addEstimatesToTr({
        ...tr,
        gasLimit: tr.gasLimit ? BigInt(tr.gasLimit.toString()) : undefined,
        from: p.payer,
        chainId: Number(p.input.chainId),
        params: p,
        steps,
      });
    } catch (error) {
      this.handleError(error, "[Squid] getTransactionRequest");
      return undefined;
    }
  }

  /**
   * Maps Squid transaction status strings to standardized OpStatus enum.
   * @param status - Squid transaction status string.
   * @returns OpStatus - Standardized operation status.
   */
  private mapSquidStatusToOpStatus = (status: string): OpStatus => {
    switch (status.toUpperCase()) {
      case "SUCCESS":
      case "DONE":
        return OpStatus.DONE;
      case "FAILED":
        return OpStatus.FAILED;
      case "PENDING":
        return OpStatus.PENDING;
      case "ONGOING":
      case "ON_GOING":
        return OpStatus.ONGOING;
      default:
        return OpStatus.WAITING;
    }
  };

  /**
   * Parses the raw status response from Squid API into the standardized IStatusResponse format.
   * @param status - Raw status response from Squid API.
   * @returns IStatusResponse - Standardized status response.
   */
  private parseTransactionStatus = (status: ISquidTransactionStatus): IStatusResponse => ({
    id: status.id,
    status: this.mapSquidStatusToOpStatus(status.squidTransactionStatus),
    txHash: status.toChain.transactionUrl,
    receivingTx: status.toChain.transactionUrl,
    sendingTx: status.fromChain.transactionUrl,
    substatus: status.status,
    substatusMessage: status.error?.message ?? "",
  });

  /**
   * Fetches the status of a transaction from the Squid API.
   * @param params - Parameters including transaction ID and potentially chain IDs/hashes.
   * @returns Promise<IStatusResponse | undefined> - Standardized status response or undefined on error.
   */
  public async getStatus(params: IStatusParams): Promise<IStatusResponse | undefined> {
    try {
      if (!params.txId && !params.txHash) {
        throw new Error("Transaction ID or hash is required for Squid status check");
      }

      const squidParams: ISquidStatusParams = {
        transactionId: params.txId || params.txHash || "",
        fromChainId: params.inputChainId,
        toChainId: params.outputChainId,
        integrator: this.integrator,
      };

      const data = await this.apiRequest<ISquidTransactionStatus>("status", "GET", squidParams);

      return this.parseTransactionStatus(data);
    } catch (error) {
      this.handleError(error, "[Squid] getStatus");
      return undefined;
    }
  }
}

export const squidAggregator = new Squid();

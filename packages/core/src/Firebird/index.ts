import { IFirebirdEncodedData, IFirebirdEncodeResponse, IFirebirdQuoteResponse } from "./types";

import { BaseAggregator } from "../abstract";
import { nativeTokenAddress, zeroAddress } from "../constants";
import {
  AggId,
  IBtrSwapParams,
  ISwapStep,
  ITransactionRequestWithEstimate,
  ProtocolType,
  StepType,
  TransactionRequest,
} from "../types";
import {
  addEstimatesToTr,
  buildQueryParams,
  emptyEstimate,
  fetchJson,
  formatError,
  mapKToKV,
} from "../utils";

/**
 * Firebird Aggregator Implementation.
 * @see https://docs.firebird.finance/developer/api-specification
 */
export class Firebird extends BaseAggregator {
  /**
   * Initializes the Firebird aggregator.
   * Sets up router addresses and aliases for supported chains.
   */
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
    this.aliasByChainId = mapKToKV(this.routerByChainId, (k) => k.toString());
    this.approvalAddressByChainId = this.routerByChainId;
  }

  /**
   * Converts BTR Swap parameters to the format expected by the Firebird API.
   * @param p - BTR Swap parameters.
   * @returns Record<string, any> - Firebird API compatible parameters.
   * @throws {Error} If parameters are invalid
   */
  protected convertParams(p: IBtrSwapParams): Record<string, any> {
    const isNativeSell = p.input.address === zeroAddress;
    const isNativeBuy = p.output.address === zeroAddress;
    return {
      chainId: Number(p.input.chainId),
      from: isNativeSell ? nativeTokenAddress : p.input.address!,
      to: isNativeBuy ? nativeTokenAddress : p.output.address!,
      amount: p.inputAmountWei.toString(),
      receiver: p.receiver ?? p.payer,
      slippage: (p.maxSlippage ?? 50) / 10000,
      source: p.integrator || this.integrator,
      ref: p.referrer ?? this.referrer,
    };
  }

  /**
   * Helper function to make requests to the Firebird API.
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
      headers: {
        "content-type": "application/json",
        ...(this.apiKey ? { "api-key": this.apiKey } : {}),
      },
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
   * Fetches a quote from the Firebird /quote endpoint.
   * @param p - BTR Swap parameters.
   * @returns A promise resolving to the Firebird quote response.
   */
  public async getQuote(p: IBtrSwapParams): Promise<IFirebirdQuoteResponse | undefined> {
    p = this.overloadParams(p);
    try {
      const quoteParams = this.convertParams(p);
      const apiRoot = this.getApiRoot(Number(p.input.chainId));
      const quoteUrl = `${apiRoot}/quote`;

      const quoteResponse = await this.apiRequest<IFirebirdQuoteResponse>(quoteUrl, quoteParams);

      if (!quoteResponse?.quoteData?.maxReturn) {
        throw formatError("Invalid quote response from Firebird", 500, quoteResponse);
      }

      return quoteResponse;
    } catch (error: unknown) {
      this.handleError(error, "[Firebird] getQuote");
      return undefined;
    }
  }

  /**
   * Fetches transaction request data from Firebird to perform a swap.
   * Involves fetching a quote and then encoding the transaction data.
   * @param p - BTR Swap parameters.
   * @returns Promise<ITransactionRequestWithEstimate | undefined> - Formatted transaction request or undefined on error.
   */
  public async getTransactionRequest(
    p: IBtrSwapParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    p = this.overloadParams(p);
    try {
      const isNativeSell = p.input.address === zeroAddress;
      const quote = await this.getQuote(p);
      if (!quote?.quoteData)
        throw new Error("Invalid quote response from Firebird (missing quoteData)");

      const encodeParams = quote;

      const apiRoot = this.getApiRoot(Number(p.input.chainId));
      const encodeResponse = await this.apiRequest<IFirebirdEncodeResponse>(
        `${apiRoot}/encode`,
        undefined,
        "POST",
        encodeParams,
      );

      if (!encodeResponse?.encodedData) {
        throw formatError("Invalid encode response from Firebird", 500, encodeResponse);
      }
      const { encodedData } = encodeResponse;

      const tx: Partial<TransactionRequest> = {
        approveTo: encodedData.router,
        from: p.payer,
        to: encodedData.router,
        data: encodedData.data,
        value: isNativeSell ? encodedData.value : "0",
        chainId: Number(p.input.chainId),
      };

      return this.processTransactionRequest(tx, p, quote, encodedData);
    } catch (error: unknown) {
      this.handleError(error, "[Firebird] getTransactionRequest");
      return undefined;
    }
  }

  /**
   * Gets the base API URL for a given chain ID for the Firebird API.
   * @param chainId - The chain ID.
   * @returns string - The API root URL for the chain.
   * @throws {Error} If the chain ID is not supported.
   */
  protected getApiRoot(chainId: number): string {
    if (!this.aliasByChainId[chainId]) throw new Error(`Unsupported chain: ${chainId}`);
    return `${this.baseApiUrl}/${this.aliasByChainId[chainId]}`;
  }

  /**
   * Processes the Firebird quote and encoded data to create a transaction request structure.
   * Calculates estimates based on the quote and formats the swap step.
   * @param tx - Partial transaction request data from the encode endpoint.
   * @param params - Original BTR Swap parameters.
   * @param quote - Quote response from the Firebird API.
   * @param _encodedData - Encoded data response (currently unused in estimate calculation).
   * @returns ITransactionRequestWithEstimate - Formatted transaction request with estimates.
   */
  private processTransactionRequest = (
    tx: Partial<TransactionRequest>,
    params: IBtrSwapParams,
    quote: IFirebirdQuoteResponse,
    _encodedData: IFirebirdEncodedData,
  ): ITransactionRequestWithEstimate => {
    const outputAmountWei = quote.quoteData?.maxReturn?.totalTo ?? "0";
    const inputAmount = Number(params.inputAmountWei) / 10 ** params.input.decimals;
    const outputAmount = Number(outputAmountWei) / 10 ** params.output.decimals;
    const steps: ISwapStep[] = [
      {
        type: StepType.SWAP,
        description: "Firebird Swap",
        input: params.input,
        output: params.output,
        inputChainId: Number(params.input.chainId),
        outputChainId: Number(params.output.chainId || params.input.chainId),
        protocol: {
          id: "firebird",
          name: "Firebird",
          logo: "",
          type: ProtocolType.AGGREGATOR,
        },
        estimates: {
          ...emptyEstimate(),
          input: inputAmount,
          inputWei: params.inputAmountWei.toString(),
          output: outputAmount,
          outputWei: outputAmountWei,
          exchangeRate: outputAmount / inputAmount,
        },
      },
    ];

    return addEstimatesToTr({
      ...tx,
      params: params,
      steps: steps,
    });
  };
}

export const firebirdAggregator = new Firebird();

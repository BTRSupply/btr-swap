import { ICowSwapQuote, ICowSwapQuoteResponse } from "./types";

import { JITAggregator } from "../abstract";
import { zeroAddress } from "../constants";
import { AggId, IStatusResponse, TransactionRequest } from "../types";
import {
  IBtrSwapParams,
  IStatusParams,
  ISwapStep,
  IToken,
  ITransactionRequestWithEstimate,
  ProtocolType,
  StepType,
} from "../types";
import {
  addEstimatesToTr,
  emptyEstimate,
  fetchJson,
  formatError,
  toBigInt,
  weiToString,
} from "../utils";

/**
 * CoW Protocol (CowSwap) Aggregator Implementation.
 * NB: Native token swaps are currently disabled as they require an EVM library.
 * @see https://docs.cow.fi/cow-protocol/reference/apis/
 */
export class CowSwap extends JITAggregator {
  private static readonly GPV2_VAULT_RELAYER_ADDRESS = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";
  private static readonly APP_DATA_HASH =
    "0xf249b3db926aa5b5a1b18f3fec86b9cc99b9a8a99ad7e8034242d2838ae97422";

  public quoteOnly = true; // CowSwap needs an extra signature step

  /**
   * Initializes the CowSwap aggregator.
   * Sets up chain aliases and vault relayer addresses for supported chains.
   */
  constructor() {
    super(AggId.COWSWAP);
    this.routerByChainId = {
      1: "0xCowSwapGPv2", // Placeholder - CowSwap uses off-chain signing
      100: "0xCowSwapGPv2",
    };
    this.aliasByChainId = { 1: "mainnet", 100: "xdai" };
    // Approval is to the Vault, which might vary or be fetched dynamically
    this.approvalAddressByChainId = {
      1: CowSwap.GPV2_VAULT_RELAYER_ADDRESS,
      100: CowSwap.GPV2_VAULT_RELAYER_ADDRESS,
    };
  }

  /**
   * Constructs the CowSwap API root URL for a given chain ID.
   * @param chainId - The chain ID.
   * @returns The API root URL string.
   * @throws {Error} if the chain is not supported.
   */
  protected getApiRoot(chainId: number): string {
    this.ensureChainSupported(chainId);
    return `${this.baseApiUrl}/${this.aliasByChainId[chainId]}`;
  }

  /**
   * Helper function to make requests to the CowSwap API.
   * @param endpoint - API endpoint path (e.g., "quote").
   * @param method - HTTP method (GET or POST).
   * @param body - Request body for POST requests.
   * @param chainId - The chain ID for the request.
   * @returns Promise<T> - Parsed JSON response.
   * @template T - Expected response type.
   * @throws {Error} If the chain is unsupported or the request fails.
   */
  private async callApi<T = any>(
    endpoint: string,
    method: string = "GET",
    body?: any,
    chainId: number = 1,
  ): Promise<T> {
    const apiRoot = this.getApiRoot(chainId);
    if (!apiRoot) {
      throw new Error(`[CowSwap] Chain ID ${chainId} not supported`);
    }

    const fullUrl = `${apiRoot}/api/v1/${endpoint}`;

    try {
      const res = await fetchJson<T>(fullUrl, {
        method: method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      // CowSwap specific error check (if applicable, based on their API structure)
      // Example: if (res.errorType) throw new Error(res.description);
      return res;
    } catch (e) {
      // Rethrow standard errors
      if (e instanceof Error) {
        throw new Error(`CowSwap API request failed: ${e.message}`);
      } else {
        throw new Error(`Unknown error during CowSwap API request: ${e}`);
      }
    }
  }

  /**
   * Converts BTR Swap parameters to the format expected by the CowSwap quote API.
   * @param p - BTR Swap parameters.
   * @returns Record<string, any> - CowSwap API compatible quote parameters.
   */
  protected convertParams = (p: IBtrSwapParams): Record<string, any> => {
    const {
      input, // IToken
      output, // IToken
      inputAmountWei,
      payer,
      receiver,
    } = p;

    const isNativeSell = input.address === zeroAddress;
    const isNativeBuy = output.address === zeroAddress;

    const baseQuote: Record<string, any> = {
      sellToken: isNativeSell ? "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" : input.address,
      buyToken: isNativeBuy ? "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE" : output.address,
      receiver: receiver ?? payer,
      from: payer,
      sellAmountBeforeFee: inputAmountWei.toString(),
      kind: "sell", // or "buy"
      partiallyFillable: false,
      signingScheme: "ethsign",
      // onchainOrder: false, // requires custom pre-sign approval
      // "buyTokenBalance": "erc20",
      // "sellTokenBalance": "erc20"
    };

    return baseQuote;
  };

  /**
   * Parses CowSwap token details into the standardized IToken format.
   * Uses placeholders for missing data like symbol or logo.
   * @param chainId - Chain ID of the token.
   * @param tokenAddress - Address of the token.
   * @param symbol - Optional token symbol.
   * @param decimals - Optional token decimals.
   * @returns IToken - Standardized token information.
   */
  private parseToken = (
    chainId: number,
    tokenAddress: string,
    symbol?: string,
    decimals?: number,
  ): IToken => ({
    address: tokenAddress,
    symbol: symbol || "???", // Placeholder symbol
    decimals: decimals || 18,
    chainId: chainId,
    name: symbol || "Unknown Token",
    logo: "", // Placeholder logo
  });

  /**
   * Parses CowSwap quote data into the standardized ISwapStep format.
   * CowSwap orders are treated as a single off-chain swap step.
   * @param p - Original BTR Swap parameters.
   * @param quote - Quote data from CowSwap API.
   * @returns ISwapStep[] - Array containing a single swap step representing the order.
   */
  private parseSteps = (p: IBtrSwapParams, quote: ICowSwapQuote): ISwapStep[] => {
    // CowSwap is effectively a single step off-chain order
    return [
      {
        id: "cowswap-order",
        type: StepType.SWAP,
        description: "CowSwap Order",
        input: p.input,
        output: p.output,
        inputChainId: Number(p.input.chainId),
        outputChainId: Number(p.output.chainId || p.input.chainId),
        payer: p.payer,
        receiver: p.receiver ?? p.payer,
        protocol: {
          id: AggId.COWSWAP,
          name: "CowSwap",
          logo: "",
          type: ProtocolType.DEX, // Or appropriate type
        },
        estimates: {
          ...emptyEstimate(),
          input: weiToString(p.inputAmountWei),
          inputWei: p.inputAmountWei.toString(),
          output: weiToString(quote.buyAmount || "0"),
          outputWei: quote.buyAmount || "0",
          feeCostWei: toBigInt(quote.feeAmount || "0"),
        },
      },
    ];
  };

  /**
   * Processes the CowSwap quote and parameters to create a transaction request structure.
   * Note: This doesn't contain actual on-chain transaction data, as CowSwap uses signatures.
   * The relevant quote data for signing is typically added to `customData` later.
   * @param quoteData - Quote data from CowSwap API.
   * @param params - Original BTR Swap parameters.
   * @param steps - Parsed swap steps.
   * @returns ITransactionRequestWithEstimate - Formatted transaction request structure with estimates.
   */
  private processTransactionRequest = (
    quoteData: ICowSwapQuote,
    params: IBtrSwapParams,
    steps: ISwapStep[],
  ): ITransactionRequestWithEstimate => {
    // Create the base transaction part (which is empty for CowSwap as it requires off-chain signing)
    const tx: Partial<TransactionRequest> = {
      aggId: this.id,
      chainId: Number(params.input.chainId),
      // No to, data, value for standard CowSwap flow (uses signature)
    };
    return addEstimatesToTr({
      ...tx,
      params,
      steps,
    });
  };

  /**
   * Fetches a quote from the CowSwap API.
   * @param p - BTR Swap parameters.
   * @returns Promise<ICowSwapQuoteResponse | undefined> - The CowSwap quote response or undefined on error.
   */
  public async getQuote(p: IBtrSwapParams): Promise<ICowSwapQuoteResponse | undefined> {
    p = this.overloadParams(p);
    try {
      const chainId = Number(p.input.chainId);
      const quoteRequest = this.convertParams(p);

      const response = await this.callApi<ICowSwapQuoteResponse>(
        "quote",
        "POST",
        quoteRequest,
        chainId,
      );

      if (!response?.quote?.buyAmount) {
        throw formatError("Invalid quote response from CowSwap", 400, response);
      }
      return response;
    } catch (error) {
      this.handleError(error, "[CowSwap] getQuote");
      return undefined;
    }
  }

  /**
   * CowSwap requires an off-chain signature, so this method primarily returns the quote data.
   * The actual "transaction" is the signed order message.
   */
  public async getTransactionRequest(
    p: IBtrSwapParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    p = this.overloadParams(p);
    try {
      const quoteResponse = await this.getQuote(p);
      if (!quoteResponse) {
        // getQuote handles error logging
        return undefined;
      }

      const steps = this.parseSteps(p, quoteResponse.quote);

      // Construct the object using processTransactionRequest
      const result = this.processTransactionRequest(quoteResponse.quote, p, steps);

      // Add the raw quote data needed for signing to customData
      result.customData = {
        ...result.customData,
        cowSwapQuote: quoteResponse.quote,
      };

      return result;
    } catch (error) {
      this.handleError(error, "[CowSwap] getTransactionRequest");
      return undefined;
    }
  }

  /**
   * Fetches the status of a CowSwap order.
   * (Currently not implemented)
   * @param _p - Status parameters (unused).
   * @returns Promise<IStatusResponse | undefined> - Always returns undefined.
   */
  public async getStatus(_p: IStatusParams): Promise<IStatusResponse | undefined> {
    // ... implementation ...
    return undefined; // Placeholder
  }
}

export const cowSwapAggregator = new CowSwap();

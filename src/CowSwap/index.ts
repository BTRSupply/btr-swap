import { ICowSwapQuoteResponse } from "./types";

import { JITAggregator } from "@/abstract";
import { addresses, MAX_SLIPPAGE_BPS, zeroAddress } from "@/constants";
import { AggId, ICostEstimate, ISwapperParams, ITransactionRequestWithEstimate } from "@/types";
import { addEstimatesToTransactionRequest, emptyCostEstimate, fetchJson, toBigInt } from "@/utils";

/**
 * Implementation of the CoW Protocol (CowSwap) aggregator.
 * NB: Native token swaps are currently disabled as they require an EVM library.
 * @see https://docs.cow.fi/cow-protocol/reference/apis/
 */
export class CowSwap extends JITAggregator {
  private static readonly GPV2_VAULT_RELAYER_ADDRESS = "0xC92E8bdf79f0507f65a392b0ab4667716BFE0110";
  private static readonly APP_DATA_HASH =
    "0xf249b3db926aa5b5a1b18f3fec86b9cc99b9a8a99ad7e8034242d2838ae97422";

  constructor() {
    super(AggId.COWSWAP);
    this.routerByChainId = {
      // GPV2_SETTLEMENT_ADDRESS
      1: "0x9008D19f58AAbD9eD0D60971565AA8510560ab41", // Ethereum
      100: "0x9008D19f58AAbD9eD0D60971565AA8510560ab41", // Gnosis Chain
    };
    this.aliasByChainId = {
      1: "", // Ethereum
      100: "xdai", // Gnosis
    };
    this.approvalAddressByChainId = this.routerByChainId;
  }

  /**
   * Constructs the CowSwap API root URL for a given chain ID.
   * @param chainId - The chain ID.
   * @returns The API root URL or undefined if the chain is not supported.
   */
  protected getApiRoot(chainId: number): string {
    if (this.isChainSupported(chainId)) {
      return `${this.aliasByChainId[chainId] ? `${this.aliasByChainId[chainId]}.` : ""}${this.baseApiUrl}`;
    }
    throw new Error(`[CowSwap] Chain ID ${chainId} not supported`);
  }

  /**
   * Helper to call the CowSwap API endpoints.
   * @param endpoint - API endpoint to call (e.g., "orders")
   * @param method - HTTP method
   * @param body - Optional request body
   * @param chainId - Chain ID (default: 1)
   * @returns API response
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
   * Fetches a transaction request for a CowSwap trade.
   * NB: For ERC20 tokens, returns approval info only. Native token swaps are disabled.
   * @param p - The swapper parameters.
   * @returns A promise resolving to the transaction request with estimates, or undefined.
   */
  public async getTransactionRequest(
    p: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    const { inputChainId, input, output, amountWei, payer, maxSlippage, testPayer } = p;

    if (!this.aliasByChainId[inputChainId]) {
      console.warn(`[CowSwap] Chain ${inputChainId} not supported.`);
      return undefined;
    }

    const userAddress = testPayer || payer;
    const slippageBps = maxSlippage || MAX_SLIPPAGE_BPS; // Convert percentage to BPS

    const isNativeSell = input === zeroAddress;
    const isNativeBuy = output === zeroAddress;

    const sellToken = isNativeSell ? addresses[inputChainId].tokens["WGAS"] : input;
    const buyToken = isNativeBuy ? addresses[inputChainId].tokens["WGAS"] : output;

    const quoteRequestBody = {
      sellToken: sellToken,
      buyToken: buyToken,
      receiver: userAddress,
      appData: CowSwap.APP_DATA_HASH,
      partiallyFillable: false,
      sellTokenBalance: "erc20",
      buyTokenBalance: "erc20",
      from: userAddress,
      signingScheme: isNativeSell ? "eip1271" : "eip712",
      onchainOrder: isNativeSell,
      kind: "sell",
      sellAmountBeforeFee: amountWei.toString(),
    };

    try {
      // 1. Fetch Quote
      const quoteResponse = await this.callApi<ICowSwapQuoteResponse>(
        "quote",
        "POST",
        quoteRequestBody,
        inputChainId,
      );
      const quote = quoteResponse.quote;

      if (quote.sellAmount === "0" && quote.buyAmount === "0" && !quote.partiallyFillable) {
        throw new Error(
          `Received potentially buggy quote (0 amounts). Refusing. Response: ${JSON.stringify(quoteResponse).substring(0, 100)}`,
        );
      }

      // The buyAmountBigInt variable is used for slippage calculation when handling native tokens
      // which is currently disabled, so it's commented out
      // const buyAmountBigInt = BigInt(quote.buyAmount);

      if (isNativeSell) {
        this.handleError(
          new Error(
            "[CowSwap] Native ETH orders disabled: Requires EVM library (e.g., ethers) to encode createOrder calldata, which is currently disallowed.",
          ),
          "[CowSwap] Native Sell Dependency Limitation",
        );
        return undefined;

        /* Native Sell Logic (Requires EVM Lib):
        // 3a. Prepare EthFlow Order Data & Calldata
        const orderData = {
          buyToken: buyToken,
          receiver: userAddress,
          sellAmount: sellAmountTotal,
          buyAmount: minBuyAmount.toString(), // Use slippage-adjusted minimum
          appData: APP_DATA_HASH,
          feeAmount: "0",
          validTo: quote.validTo,
          partiallyFillable: quote.partiallyFillable,
          quoteId: quoteId
        };
        const calldata = ethFlowInterface.encodeFunctionData("createOrder", [orderData]);

        const tx: Partial<ITransactionRequestWithEstimate> = {
          from: userAddress,
          to: ETH_FLOW_PROXY_ADDRESS,
          data: calldata,
          value: BigInt(sellAmountTotal),
        };
        */
      } else {
        // 3b. ERC20 Order: Return minimal info (estimate + approval)
        // No transaction request for ERC20, requires off-chain signing
        const tx: Partial<ITransactionRequestWithEstimate> = {};

        const inputAmountWei = toBigInt(amountWei);
        const outputAmountWei = toBigInt(quote.buyAmount); // Use quote amount before slippage

        // CowSwap gas is complex and paid by solvers, not directly by user tx
        // We return a zeroed estimate object.
        const gasEstimate: ICostEstimate = emptyCostEstimate();

        return addEstimatesToTransactionRequest({
          tr: tx as ITransactionRequestWithEstimate,
          inputAmountWei,
          outputAmountWei,
          inputDecimals: p.inputDecimals,
          outputDecimals: p.outputDecimals,
          approvalAddress: CowSwap.GPV2_VAULT_RELAYER_ADDRESS, // For ERC20 approvals
          costEstimate: gasEstimate,
        });
      }
    } catch (error) {
      this.handleError(error, "[CowSwap] getTransactionRequest");
      return undefined;
    }
  }
}

// Export singleton instance
export const cowSwapAggregator = new CowSwap();

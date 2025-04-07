import {
  IUnizenCrossChainTransactionData,
  IUnizenCrossQuoteResult,
  IUnizenQuoteResult,
  IUnizenTransactionData,
} from "./types";

import { BaseAggregator } from "@/abstract";
import { MAX_SLIPPAGE_BPS, zeroAddress } from "@/constants";
import { AggId, IStatusParams, ISwapperParams, ITransactionRequestWithEstimate } from "@/types";
import {
  addEstimatesToTransactionRequest,
  buildQueryParams,
  emptyCostEstimate,
  fetchJson,
  formatError,
  mapKToKV,
} from "@/utils";

/**
 * Unizen aggregator implementation.
 * API docs: https://docs.unizen.io/trade-api/api-reference
 */
export class Unizen extends BaseAggregator {
  constructor() {
    super(AggId.UNIZEN);
    this.routerByChainId = {
      1: "0xef58B643240178c2BC37681f8d4E50d7Ec37Ee22", // Ethereum
      10: "0xef58B643240178c2BC37681f8d4E50d7Ec37Ee22", // Optimism
      56: "0x42479c390270cBa049A2D10F63bF75d9D0B7a742", // BNB Chain
      130: "0x4039942b38241D62cA8460Ea54A096a5B3e2bf61", // Unichain
      137: "0xef58B643240178c2BC37681f8d4E50d7Ec37Ee22", // Polygon
      146: "0xef58B643240178c2BC37681f8d4E50d7Ec37Ee22", // Sonic
      250: "0x433dA70E79861C265E07953Dde9ce8629a57a589", // Fantom
      8453: "0xef58B643240178c2BC37681f8d4E50d7Ec37Ee22", // Base
      42161: "0xef58B643240178c2BC37681f8d4E50d7Ec37Ee22", // Arbitrum
      43314: "0xef58B643240178c2BC37681f8d4E50d7Ec37Ee22", // Avalanche
      80094: "0x433dA70E79861C265E07953Dde9ce8629a57a589", // Berachain
    };
    this.aliasByChainId = mapKToKV(this.routerByChainId);
    this.approvalAddressByChainId = this.routerByChainId;
  }

  private getHeaders = (): Record<string, string> =>
    this.apiKey ? { "x-api-key": this.apiKey } : {};

  private apiRequest = async <T = any>(
    endpoint: string,
    params?: Record<string, any>,
    method: "GET" | "POST" = "GET",
    body?: any,
    chainId?: number,
  ): Promise<T> => {
    if (!chainId) {
      throw new Error("Chain ID is required for Unizen API requests");
    }

    // Add version parameter to URL path
    const url = new URL(`${this.baseApiUrl}/${chainId}/${endpoint}`);

    // Add additional parameters like version to query parameters
    const queryParams = {
      ...(params || {}),
      version: "v2",
      isGasless: false,
    };

    if (method === "GET") {
      url.search = buildQueryParams(
        Object.fromEntries(Object.entries(queryParams).filter(([_, v]) => v !== undefined)),
      );
    }

    return fetchJson<T>(url, {
      method,
      headers: {
        ...this.getHeaders(),
        ...(method === "POST" && { "Content-Type": "application/json" }),
      },
      body: method === "POST" && body ? JSON.stringify(body) : undefined,
    });
  };

  private extractQuoteInfo = (quote: IUnizenQuoteResult | IUnizenCrossQuoteResult) => {
    const isCrossChain = "srcTrade" in quote;

    if (isCrossChain) {
      const crossQuote = quote as IUnizenCrossQuoteResult;
      return {
        inputToken: crossQuote.srcTrade.tokenFrom,
        outputToken: crossQuote.dstTrade.tokenTo,
        inputAmount: crossQuote.srcTrade.fromTokenAmount,
        outputAmount: crossQuote.dstTrade.toTokenAmount,
      };
    } else {
      const singleQuote = quote as IUnizenQuoteResult;
      return {
        inputToken: singleQuote.tokenFrom,
        outputToken: singleQuote.tokenTo,
        inputAmount: singleQuote.fromTokenAmount,
        outputAmount: singleQuote.toTokenAmount,
      };
    }
  };

  private getExcludedDexesList = (p: ISwapperParams): Record<string, string[]> | undefined => {
    const denyList = p.denyExchanges?.concat(p.denyBridges ?? []);
    if (!denyList?.length) return undefined;

    const result: Record<string, string[]> = {
      [p.inputChainId]: denyList,
      ...(p.outputChainId && { [p.outputChainId]: denyList }),
    };

    return Object.keys(result).length ? result : undefined;
  };

  protected convertParams = (p: ISwapperParams): Record<string, any> => {
    this.validateQuoteParams(p);
    const { input, output, amountWei, payer, receiver, maxSlippage, inputChainId, outputChainId } =
      p;
    const excludedDexes = this.getExcludedDexesList(p);

    return {
      fromTokenAddress: input === zeroAddress ? zeroAddress : input,
      chainId: String(inputChainId),
      toTokenAddress: output === zeroAddress ? zeroAddress : output,
      destinationChainId: outputChainId ? String(outputChainId) : undefined,
      amount: String(amountWei),
      sender: payer,
      receiver: receiver ?? undefined,
      slippage: (maxSlippage ?? MAX_SLIPPAGE_BPS) / 10000, // Convert BPS to decimal
      isSplit: false,
      excludedDexes: excludedDexes ? JSON.stringify(excludedDexes) : undefined,
    };
  };

  private isCrossChainSwap = (p: ISwapperParams): boolean =>
    !!p.outputChainId && p.inputChainId !== p.outputChainId;

  private async getTargetAddress(version: string, chainId: number): Promise<string | undefined> {
    try {
      const response = await this.apiRequest<{ address: string }>(
        `approval/spender?contractVersion=${version}`,
        undefined,
        "GET",
        undefined,
        chainId,
      );
      return response.address;
    } catch (e) {
      this.handleError(e, "[Unizen] getTargetAddress");
      return undefined;
    }
  }

  public async getQuote(
    p: ISwapperParams,
  ): Promise<IUnizenQuoteResult | IUnizenCrossQuoteResult | undefined> {
    try {
      const isCrossChain = this.isCrossChainSwap(p);
      const quotes = isCrossChain
        ? await this.getCrossChainQuote(p)
        : await this.getSingleChainQuote(p);

      return quotes?.[0]; // Return the best quote
    } catch (error) {
      this.handleError(error, "[Unizen] getQuote");
      return undefined;
    }
  }

  private async getSingleChainQuote(p: ISwapperParams): Promise<IUnizenQuoteResult[] | undefined> {
    try {
      const params = this.convertParams(p);
      // Remove chainId from params as it's now in the URL path
      const { chainId, ...restParams } = params;

      const response = await this.apiRequest<IUnizenQuoteResult[]>(
        "quote/single",
        restParams,
        "GET",
        undefined,
        p.inputChainId,
      );

      if (!response?.length) {
        throw formatError("Empty quote response from Unizen", 404, response);
      }

      return response;
    } catch (error) {
      this.handleError(error, "[Unizen] getSingleChainQuote");
      return undefined;
    }
  }

  private async getCrossChainQuote(
    p: ISwapperParams,
  ): Promise<IUnizenCrossQuoteResult[] | undefined> {
    try {
      if (!p.outputChainId) {
        throw new Error("Output chain ID required for cross-chain swap");
      }

      const params = this.convertParams(p);
      // Remove chainId from params as it's now in the URL path
      const { chainId, ...restParams } = params;

      const response = await this.apiRequest<IUnizenCrossQuoteResult[]>(
        "quote/cross",
        restParams,
        "GET",
        undefined,
        p.inputChainId,
      );

      if (!response?.length) {
        throw formatError("Empty cross-chain quote response from Unizen", 404, response);
      }

      return response;
    } catch (error) {
      this.handleError(error, "[Unizen] getCrossChainQuote");
      return undefined;
    }
  }

  private async getSwapData(
    p: ISwapperParams,
    quoteId: string,
    isCrossChain: boolean,
  ): Promise<IUnizenTransactionData | IUnizenCrossChainTransactionData | undefined> {
    try {
      const endpoint = isCrossChain ? "swap/cross" : "swap/single";

      const params = this.convertParams(p);
      // Remove chainId from params as it's now in the URL path
      const { chainId, ...restParams } = params;

      const swapParams = {
        ...restParams,
        quoteId,
      };

      const response = await this.apiRequest<
        IUnizenTransactionData | IUnizenCrossChainTransactionData
      >(endpoint, swapParams, "GET", undefined, p.inputChainId);

      return response;
    } catch (error) {
      this.handleError(
        error,
        `[Unizen] getSwapData (${isCrossChain ? "cross-chain" : "single-chain"})`,
      );
      return undefined;
    }
  }

  private parseUnizenToken = (token: any) => ({
    address: token.contractAddress,
    decimals: token.decimals,
    symbol: token.symbol,
    chainId: token.chainId,
    name: token.name,
    logoURI: "",
  });

  private processTransactionRequest = (
    tr: Partial<ITransactionRequestWithEstimate>,
    quote: IUnizenQuoteResult | IUnizenCrossQuoteResult,
  ): ITransactionRequestWithEstimate => {
    if (!tr.to || !tr.data) throw new Error("Incomplete transaction request");

    tr.aggregatorId = this.id;
    const quoteInfo = this.extractQuoteInfo(quote);

    // Extract protocol information
    const protocols =
      "srcTrade" in quote
        ? quote.srcTrade.protocol.concat(quote.dstTrade.protocol)
        : quote.protocol;

    const protocolNames = protocols.map(p => p.name).join(", ");
    const bridgeName = "srcTrade" in quote ? quote.tradeProtocol : undefined;

    const steps =
      "srcTrade" in quote
        ? [
            {
              type: "cross-chain-swap",
              description: `Unizen Cross-Chain Swap via ${bridgeName || "Bridge"}`,
              fromToken: this.parseUnizenToken(quoteInfo.inputToken),
              toToken: this.parseUnizenToken(quoteInfo.outputToken),
              fromAmount: quoteInfo.inputAmount,
              toAmount: quoteInfo.outputAmount,
              fromChain: quoteInfo.inputToken.chainId,
              toChain: quoteInfo.outputToken.chainId,
              tool: "unizen",
              toolDetails: {
                key: "unizen",
                name: "Unizen",
                logoURI: "",
              },
              protocols: protocols.map(p => ({
                name: p.name,
                part: p.percentage,
                logoURI: p.logo || "",
                routes: p.route.map(r => ({ address: r })),
              })),
              fromAddress: tr.to,
              // Include bridge info if available
              ...(bridgeName && {
                via:
                  "srcTrade" in quote
                    ? {
                        name: quote.providerInfo?.name || bridgeName,
                        logoURI: quote.providerInfo?.logo || "",
                      }
                    : undefined,
              }),
            },
          ]
        : [
            {
              type: "swap",
              description: `Unizen Swap via ${protocolNames}`,
              fromToken: this.parseUnizenToken(quoteInfo.inputToken),
              toToken: this.parseUnizenToken(quoteInfo.outputToken),
              fromAmount: quoteInfo.inputAmount,
              toAmount: quoteInfo.outputAmount,
              fromChain: quoteInfo.inputToken.chainId,
              toChain: quoteInfo.outputToken.chainId,
              tool: "unizen",
              toolDetails: {
                key: "unizen",
                name: "Unizen",
                logoURI: "",
              },
              protocols: protocols.map(p => ({
                name: p.name,
                part: p.percentage,
                logoURI: p.logo || "",
                routes: p.route.map(r => ({ address: r })),
              })),
              fromAddress: tr.to,
            },
          ];

    return addEstimatesToTransactionRequest({
      tr: tr as ITransactionRequestWithEstimate,
      steps,
      inputAmountWei: BigInt(quoteInfo.inputAmount),
      outputAmountWei: BigInt(quoteInfo.outputAmount),
      inputDecimals: quoteInfo.inputToken.decimals,
      outputDecimals: quoteInfo.outputToken.decimals,
      approvalAddress: tr.to,
      costEstimate: emptyCostEstimate(),
    });
  };

  public async getTransactionRequest(
    p: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    try {
      const quote = await this.getQuote(p);
      if (!quote) {
        throw formatError("Failed to get quote from Unizen", 400);
      }

      const isCrossChain = "srcTrade" in quote;
      const uuid = isCrossChain
        ? (quote as IUnizenCrossQuoteResult).uuid
        : (quote as IUnizenQuoteResult).transactionData.info.uuid;

      // For single-chain swaps
      if (!isCrossChain) {
        const singleQuote = quote as IUnizenQuoteResult;
        const data = singleQuote.transactionData;
        if (!data) {
          throw formatError("Invalid transaction data from Unizen", 400, singleQuote);
        }

        return this.processTransactionRequest(
          {
            to: data.call[0]?.targetExchange,
            data: data.call[0]?.data,
            value: singleQuote.nativeValue ? BigInt(singleQuote.nativeValue) : BigInt(0),
            from: p.payer,
            chainId: parseInt(p.inputChainId.toString()),
          },
          quote,
        );
      }
      // For cross-chain swaps
      else {
        const crossQuote = quote as IUnizenCrossQuoteResult;
        const data = crossQuote.transactionData;
        if (!data || !data.srcCalls || data.srcCalls.length === 0) {
          throw formatError("Invalid source transaction data from Unizen", 400, crossQuote);
        }

        return this.processTransactionRequest(
          {
            to: data.srcCalls[0]?.targetExchange,
            data: data.srcCalls[0]?.data,
            value: crossQuote.nativeValue ? BigInt(crossQuote.nativeValue) : BigInt(0),
            from: p.payer,
            chainId: parseInt(p.inputChainId.toString()),
          },
          quote,
        );
      }
    } catch (error) {
      this.handleError(error, "[Unizen] getTransactionRequest");
      return undefined;
    }
  }

  public async getStatus(p: IStatusParams): Promise<any | undefined> {
    console.warn("Unizen getStatus not implemented");
    return undefined;
  }
}

export const unizenAggregator = new Unizen();

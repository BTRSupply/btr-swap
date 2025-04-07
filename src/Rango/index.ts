import { IRangoFee, IRangoPath, IRangoRoute, IRangoSwapResponse } from "./types";

import { BaseAggregator } from "@/abstract";
import { zeroAddress } from "@/constants";
import {
  AggId,
  ICostEstimate,
  ISwapperParams,
  IToken,
  ITransactionRequestWithEstimate,
} from "@/types";
import {
  addEstimatesToTransactionRequest,
  buildQueryParams,
  emptyCostEstimate,
  fetchJson,
  formatError,
} from "@/utils";

/**
 * Rango aggregator implementation
 * @see https://docs.rango.exchange/api-integration/basic-api-single-step/sample-transactions
 */
export class Rango extends BaseAggregator {
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

  private formatRangoAsset = (chainId: number, tokenAddress: string, symbol: string): string => {
    if (!this.isChainSupported(chainId)) throw new Error(`Unsupported chainId: ${chainId}`);
    const chain = this.aliasByChainId[chainId];
    return tokenAddress === zeroAddress
      ? `${chain}.${symbol}` // Native token
      : `${chain}.${symbol}--${tokenAddress}`; // Token
  };

  protected getHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    ...(this.apiKey && { "X-Rango-Id": this.apiKey }),
  });

  private apiRequest = async <T = any>(
    endpoint: string,
    params?: Record<string, any>,
    method: "GET" | "POST" = "GET",
    body?: any,
  ): Promise<T> => {
    const url = new URL(`${this.getApiRoot(params?.chainId)}/${endpoint}`);

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

  protected convertParams = (p: ISwapperParams): Record<string, string> => {
    p = this.validateQuoteParams(p);
    if (!p.inputSymbol || !p.outputSymbol) {
      throw new Error("Missing token symbols for Rango quote");
    }

    const fromAddress = p.payer ?? p.testPayer;
    const swapParams: Record<string, string> = {
      from: this.formatRangoAsset(p.inputChainId, p.input, p.inputSymbol),
      to: this.formatRangoAsset(p.inputChainId, p.output, p.outputSymbol),
      amount: p.amountWei.toString(),
      fromAddress,
      toAddress: p.receiver ?? fromAddress,
      slippage: (p.maxSlippage! / 100).toString(),
      chainId: p.inputChainId.toString(),
      ...(this.referrer && { referrer: this.referrer }),
      ...(p.referrer && { referrer: p.referrer }),
    };

    return swapParams;
  };

  private parseToken = (token: any): IToken => ({
    address: token.address ?? "",
    decimals: token.decimals ?? 18,
    symbol: token.symbol ?? "",
    chainId: parseInt(token.chainId ?? "1", 10),
    name: token.name ?? token.symbol ?? "",
    logoURI: token.image ?? "",
    priceUSD: token.usdPrice ?? 0,
  });

  private parseSteps = (paths: IRangoPath[]) =>
    paths.map(path => ({
      id: path.swapper?.id || "???",
      type: path.swapperType || "DEX",
      description: path.swapper?.title || "Swap",
      fromToken: this.parseToken(path.from),
      toToken: this.parseToken(path.to),
      fromAmount: path.inputAmount,
      fromChain: parseInt(path.from.chainId || "1", 10),
      toChain: parseInt(path.to.chainId || "1", 10),
      slippage: 0,
      estimate: {
        fromAmount: path.inputAmount,
        toAmount: path.expectedOutput,
        toAmountMin: path.expectedOutput,
        approvalAddress: "",
        gasCosts: [],
        feeCosts: [],
      },
      fromAddress: "",
      toAddress: "",
      tool: path.swapper?.id || "???",
      toolDetails: {
        key: path.swapper?.id || "???",
        name: path.swapper?.title || "???",
        logoURI: path.swapper?.logo || "",
      },
    }));

  private processCostEstimate = (fees: IRangoFee[]): ICostEstimate => {
    const costs = emptyCostEstimate();

    fees.forEach(fee => {
      const isNetworkFee = fee.name === "Network Fee";
      const tokenPriceUsd = fee.token?.usdPrice || 0;
      const tokenDecimals = fee.token?.decimals || 18;
      const amount = fee.amount ? parseFloat(fee.amount) : 0;
      const cost = (amount / 10 ** tokenDecimals) * tokenPriceUsd;

      if (isNetworkFee) {
        costs.totalGasCostUsd += cost;
        costs.totalGasCostWei += BigInt(amount);
      } else {
        costs.totalFeeCostUsd += cost;
        costs.totalFeeCostWei += BigInt(amount);
      }
    });

    return costs;
  };

  private processTransactionRequest = (
    tr: Partial<ITransactionRequestWithEstimate>,
    routeData: IRangoRoute,
  ): ITransactionRequestWithEstimate => {
    tr.aggregatorId = this.id;
    const steps = this.parseSteps(routeData.path || []);
    const firstStep = routeData.path?.[0];
    const lastStep = routeData.path?.[routeData.path?.length - 1];

    return addEstimatesToTransactionRequest({
      tr: tr as ITransactionRequestWithEstimate,
      steps,
      inputAmountWei: BigInt(firstStep?.inputAmount || "0"),
      outputAmountWei: BigInt(routeData.outputAmount),
      inputDecimals: firstStep?.from?.decimals || 18,
      outputDecimals: lastStep?.to?.decimals || 18,
      approvalAddress: tr.to as string,
      costEstimate: this.processCostEstimate(routeData.fee || []),
    });
  };

  /**
   * Rango implements getTransactionRequest directly
   */
  public async getQuote(p: ISwapperParams): Promise<IRangoRoute | undefined> {
    try {
      const swapResponse = await this.apiRequest<IRangoSwapResponse>("swap", this.convertParams(p));

      if (!swapResponse?.route) {
        throw formatError("Failed to fetch a valid quote from Rango", 400, swapResponse);
      }

      return swapResponse.route;
    } catch (error) {
      this.handleError(error, "[Rango] getQuote");
      return undefined;
    }
  }

  public async getTransactionRequest(
    p: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    try {
      const swapResponse = await this.apiRequest<IRangoSwapResponse>("swap", this.convertParams(p));

      if (
        !swapResponse?.tx?.txTo ||
        !swapResponse?.tx?.txData ||
        !swapResponse?.route?.outputAmount
      ) {
        throw formatError("Invalid or incomplete Rango response", 500, swapResponse);
      }

      return this.processTransactionRequest(
        {
          to: swapResponse.tx.txTo,
          data: swapResponse.tx.txData,
          value: swapResponse.tx.value ? BigInt(swapResponse.tx.value) : 0n,
          from: p.payer,
        },
        swapResponse.route,
      );
    } catch (error) {
      this.handleError(error, "[Rango] getTransactionRequest");
      return undefined;
    }
  }
}

export const rangoAggregator = new Rango();

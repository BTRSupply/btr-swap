import {
  ILifiBestQuote,
  ILifiGasSuggestionParams,
  ILifiSwapStep,
  ILifiToken,
  ILifiTransactionStatus,
} from "./types";

import { BaseAggregator } from "@/abstract";
import { AggId, IStatusResponse, OperationStatus } from "@/index";
import {
  IFeeCost,
  IGasCost,
  ICostEstimate,
  IStatusParams,
  ISwapperParams,
  IToken,
  ITransactionRequestWithEstimate,
  TransactionRequest,
} from "@/types";
import {
  addEstimatesToTransactionRequest,
  buildQueryParams,
  formatError,
  fetchJson,
  mapKToKV,
  weiToString,
} from "@/utils";

/**
 * LiFi aggregator implementation
 */
export class LiFi extends BaseAggregator {
  constructor() {
    super(AggId.LIFI);
    // Set up router addresses for supported chains
    this.routerByChainId = {
      1: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", // Ethereum
      10: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", // Optimism
      56: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", // BNB Chain
      100: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", // Gnosis Chain
      137: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", // Polygon
      250: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", // Fantom
      8453: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", // Base
      59144: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", // Linea
      42161: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", // Arbitrum
      43114: "0x1231DEB6f5749EF6cE6943a275A1D3E7486F4EaE", // Avalanche
    };
    // https://docs.li.fi/li.fi-api/li.fi-api/requesting-supported-chains
    this.aliasByChainId = mapKToKV(this.routerByChainId);
    this.approvalAddressByChainId = this.routerByChainId;
  }

  /**
   * Calculates a gas estimate from costs arrays
   */
  private processCostEstimate = (gasCosts: IGasCost[], feeCosts: IFeeCost[]): ICostEstimate => ({
    totalGasCostUsd: gasCosts.reduce((sum, cost) => sum + parseFloat(cost.amountUSD || "0"), 0),
    totalGasCostWei: gasCosts.reduce((sum, cost) => sum + BigInt(cost.amount || "0"), BigInt(0)),
    totalFeeCostUsd: feeCosts.reduce((sum, cost) => sum + parseFloat(cost.amountUSD || "0"), 0),
    totalFeeCostWei: feeCosts.reduce((sum, cost) => sum + BigInt(cost.amount || "0"), BigInt(0)),
  });

  private getHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    ...(this.apiKey && { "X-API-Key": this.apiKey }),
  });

  protected convertParams = (p: ISwapperParams): Record<string, any> => {
    p = this.validateQuoteParams(p);
    return {
      fromChain: p.inputChainId,
      fromToken: p.input,
      fromAddress: p.payer,
      fromAmount: weiToString(p.amountWei),
      toChain:
        this.aliasByChainId[p.outputChainId ?? p.inputChainId] ||
        (p.outputChainId ?? p.inputChainId).toString(),
      toToken: p.output,
      toAddress: p.receiver ?? p.payer,
      integrator: p.integrator || this.integrator,
      order: "RECOMMENDED",
      ...(p.maxSlippage && { slippage: p.maxSlippage / 10000 }),
      ...((this.referrer || p.referrer) && { referrer: p.referrer ?? this.referrer }),
      ...(p.denyBridges?.length && { denyBridges: p.denyBridges.join(",") }),
      ...(p.denyExchanges?.length && { denyExchanges: p.denyExchanges.join(",") }),
    };
  };

  private apiRequest = async <T = any>(
    endpoint: string,
    params?: Record<string, any>,
    method: "GET" | "POST" = "GET",
    body?: any,
  ): Promise<T> => {
    const url = new URL(`${this.baseApiUrl}/${endpoint}`);

    if (method === "GET" && params) {
      url.search = buildQueryParams(
        Object.fromEntries(Object.entries(params).filter(([_, v]) => v !== undefined)),
      );
    }

    return fetchJson<T>(url, {
      method,
      headers: this.getHeaders(),
      body: method === "POST" && body ? JSON.stringify(body) : undefined,
    });
  };

  private parseToken = (token: ILifiToken): IToken => ({
    address: token.address ?? "",
    decimals: token.decimals,
    symbol: token.symbol,
    chainId: token.chainId ?? 1,
    name: token.name,
    logoURI: token.logoURI,
    priceUSD: token.priceUSD,
  });

  private parseSteps = (steps: ILifiSwapStep[]) =>
    steps.map(step => ({
      id: step.id,
      type: step.type,
      description: "",
      fromToken: this.parseToken(step.action.fromToken),
      toToken: this.parseToken(step.action.toToken),
      fromAmount: step.action.fromAmount,
      fromChain: step.action.fromChainId,
      toChain: step.action.toChainId,
      slippage: step.action.slippage,
      estimate: {
        fromAmount: step.estimate.fromAmount,
        toAmount: step.estimate.toAmount,
        toAmountMin: step.estimate.toAmountMin,
        approvalAddress: step.estimate.approvalAddress,
        gasCosts: step.estimate.gasCosts,
        feeCosts: step.estimate.feeCosts,
      },
      fromAddress: step.action.fromAddress,
      toAddress: step.action.toAddress,
      tool: step.tool,
      toolDetails: step.toolDetails,
    }));

  private processTransactionRequest = (
    tr: TransactionRequest,
    step: ILifiSwapStep,
    includedSteps: ILifiSwapStep[] = [step],
  ): ITransactionRequestWithEstimate => {
    if (!tr.to || !tr.data) throw new Error("Incomplete transaction request");

    tr.aggregatorId = this.id;
    const steps = this.parseSteps(includedSteps);
    const firstStep = steps[0];
    if (!firstStep) throw new Error("No valid steps found");

    const inputAmountWei = BigInt(firstStep.fromAmount ?? "0");
    const outputAmountWei = BigInt(step.estimate.toAmount);
    if (inputAmountWei === 0n || outputAmountWei === 0n)
      throw new Error("Step zero input or output amount detected");

    const approvalAddress =
      step.estimate.approvalAddress || this.getApprovalAddress(firstStep.fromChain);
    if (!approvalAddress)
      throw new Error(`No approval address found for chain ${firstStep.fromChain}`);

    return addEstimatesToTransactionRequest({
      tr,
      steps,
      inputAmountWei,
      outputAmountWei,
      inputDecimals: firstStep.fromToken?.decimals ?? 0,
      outputDecimals: steps[steps.length - 1]?.toToken?.decimals ?? 0,
      approvalAddress,
      costEstimate: this.processCostEstimate(
        step.estimate.gasCosts || [],
        step.estimate.feeCosts || [],
      ),
    });
  };

  private parseTransactionStatus = (status: ILifiTransactionStatus): IStatusResponse => ({
    id: status.transactionId || "",
    status:
      {
        DONE: OperationStatus.DONE,
        PENDING: OperationStatus.PENDING,
        FAILED: OperationStatus.FAILED,
        NOT_FOUND: OperationStatus.NOT_FOUND,
      }[status.status?.toUpperCase() ?? ""] ?? OperationStatus.PENDING,
    substatus: status.substatus,
    substatusMessage: status.substatusMessage,
    txHash: status.sending?.txHash,
    sendingTx: status.sending?.txHash,
    receivingTx: status.receiving?.txHash,
  });

  public async getQuote(p: ISwapperParams): Promise<ILifiBestQuote | undefined> {
    try {
      const response = await this.apiRequest<ILifiBestQuote>("quote", this.convertParams(p));
      return response;
    } catch (error) {
      this.handleError(error, "[LiFi] getQuote");
      return undefined;
    }
  }

  public async getTransactionRequest(
    p: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    try {
      const quote = await this.getQuote(p);
      if (!quote?.estimate || !quote?.transactionRequest) {
        throw formatError("Failed to get a valid quote from LiFi", 400, quote);
      }

      return this.processTransactionRequest(quote.transactionRequest, quote, [quote]);
    } catch (error) {
      this.handleError(error, "[LiFi] getTransactionRequest");
      return undefined;
    }
  }

  public async getStatus(p: IStatusParams): Promise<IStatusResponse | undefined> {
    try {
      if (!p.txHash) {
        throw new Error("Missing transaction hash for LiFi getStatus");
      }

      const statusResponse = await this.apiRequest<ILifiTransactionStatus>("status", {
        txHash: p.txHash,
      });

      if (!statusResponse?.status) {
        if (statusResponse?.sending?.txHash === p.txHash) {
          return { id: p.txHash, status: OperationStatus.PENDING };
        }
        throw formatError("Failed to get a valid status from LiFi", 404, statusResponse);
      }

      return this.parseTransactionStatus(statusResponse);
    } catch (error) {
      this.handleError(error, "[LiFi] getStatus");
      return undefined;
    }
  }

  public async gasSuggestion(p: ILifiGasSuggestionParams): Promise<unknown> {
    try {
      if (!p.fromChain || !p.toChain || !p.fromToken || !p.toToken)
        throw formatError("Missing required params", 400, p);

      return this.apiRequest<unknown>("gas", {
        fromChain: p.fromChain,
        toChain: p.toChain,
        fromToken: p.fromToken,
        toToken: p.toToken,
      });
    } catch (error) {
      this.handleError(error, "LiFi gasSuggestion");
      throw error;
    }
  }
}

// Export an instance of the class
export const lifiAggregator = new LiFi();

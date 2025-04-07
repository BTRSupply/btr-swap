import {
  ISquidAction,
  ISquidCustomCall,
  ISquidEstimate,
  ISquidQuoteResponse,
  ISquidToken,
  ISquidTransactionStatus,
  SquidCallType,
} from "./types";

import { BaseAggregator } from "@/abstract";
import { IStatusResponse, OperationStatus } from "@/index";
import {
  AggId,
  ChainType,
  ICustomContractCall,
  IStatusParams,
  ISwapperParams,
  ITransactionRequestWithEstimate,
} from "@/types";
import {
  addEstimatesToTransactionRequest,
  emptyCostEstimate,
  fetchJson,
  formatError,
  mapKToKV,
} from "@/utils";

export class Squid extends BaseAggregator {
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

  private getHeaders = (includeAccept = false): Record<string, string> => ({
    "Content-Type": "application/json",
    "x-integrator-id": this.integrator,
    ...(includeAccept && { accept: "application/json" }),
    ...(this.apiKey && { "api-key": this.apiKey }),
  });

  private apiRequest = async <T = any>(
    endpoint: string,
    params?: Record<string, any>,
    method: "GET" | "POST" = "GET",
    body?: any,
  ): Promise<T> => {
    const url = new URL(`${this.baseApiUrl}/${endpoint}`);

    if (method === "GET" && params) {
      const urlParams = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) urlParams.append(key, String(value));
      });
      url.search = urlParams.toString();
    }

    return fetchJson<T>(url, {
      method,
      headers: this.getHeaders(method === "GET"),
      body: method === "POST" && body ? JSON.stringify(body) : undefined,
    });
  };

  private generateHook = (call: ICustomContractCall, outputToken: string): ISquidCustomCall => ({
    chainType: ChainType.EVM,
    callType: SquidCallType.FULL_TOKEN_BALANCE,
    target: call.toAddress!,
    value: "0",
    callData: call.callData,
    payload: { tokenAddress: outputToken, inputPos: call.inputPos ?? 0 },
    estimatedGas: call.gasLimit ?? "20000",
  });

  protected convertParams = (p: ISwapperParams): Record<string, any> => {
    const baseParams = {
      enableBoost: true,
      fromToken: p.input,
      fromChain: p.inputChainId.toString(),
      toToken: p.output,
      toChain: (p.outputChainId ?? p.inputChainId).toString(),
      fromAddress: p.payer ?? p.testPayer,
      fromAmount: p.amountWei.toString(),
      toAddress: p.receiver ?? p.payer,
      slippage: p.maxSlippage! / 100,
      slippageConfig: { autoMode: 1 },
      quoteOnly: false,
      receiveGasOnDestination: p.receiveGasOnDestination ?? false,
      integrator: this.integrator,
    };

    return p.customContractCalls?.length
      ? {
          ...baseParams,
          postHook: {
            chainType: ChainType.EVM,
            calls: p.customContractCalls.map(c => this.generateHook(c, p.output)),
          },
        }
      : baseParams;
  };

  private parseToken = (token?: ISquidToken) => ({
    address: token?.address ?? "",
    decimals: token?.decimals ?? 0,
    symbol: token?.symbol ?? "",
    chainId: token?.chainId ?? "",
    name: token?.name ?? "",
    logoURI: token?.logoURI ?? "",
    priceUSD: token?.usdPrice?.toString() ?? "0",
  });

  private parseSteps = (actions?: ISquidAction[]) =>
    !actions
      ? []
      : actions.map(step => ({
          type: step.type,
          description: step.description,
          fromToken: this.parseToken(step.fromToken),
          toToken: this.parseToken(step.toToken),
          fromAmount: step.fromAmount ?? "0",
          toAmount: step.toAmount ?? "0",
          fromChain: parseInt(step.fromChain),
          toChain: parseInt(step.toChain ?? "0"),
          tool: step.provider,
          toolDetails: { key: step.provider, logoURI: "", name: step.provider },
        }));

  private processCostEstimate = (estimate: ISquidEstimate) => {
    const costs = emptyCostEstimate();

    if (estimate.gasCosts?.length) {
      costs.totalGasCostUsd = estimate.gasCosts
        .map(c => parseFloat(c.amountUsd === "" ? "0" : c.amountUsd))
        .reduce((a, b) => a + b, 0);

      costs.totalGasCostWei = estimate.gasCosts
        .map(c => (c.amount ? BigInt(c.amount) : BigInt(0)))
        .reduce((a, b) => a + b, BigInt(0));
    }

    if (estimate.feeCosts?.length) {
      costs.totalFeeCostUsd = estimate.feeCosts
        .map(c => parseFloat(c.amountUsd === "" ? "0" : c.amountUsd))
        .reduce((a, b) => a + b, 0);

      costs.totalFeeCostWei = estimate.feeCosts
        .map(c => (c.amount ? BigInt(c.amount) : BigInt(0)))
        .reduce((a, b) => a + b, BigInt(0));
    }

    return costs;
  };

  private processTransactionRequest = (
    tr: Partial<ITransactionRequestWithEstimate>,
    quoteData: ISquidQuoteResponse,
  ): ITransactionRequestWithEstimate => {
    if (!tr.to || !tr.data) throw new Error("Incomplete transaction request");
    tr.aggregatorId = this.id;

    const steps = this.parseSteps(quoteData.route?.estimate.actions);
    const fromToken = quoteData.route?.estimate.fromToken;
    const toToken = quoteData.route?.estimate.toToken;

    return addEstimatesToTransactionRequest({
      tr: tr as ITransactionRequestWithEstimate,
      steps,
      inputAmountWei: BigInt(quoteData.route?.estimate.fromAmount || "0"),
      outputAmountWei: BigInt(quoteData.route?.estimate.toAmount || "0"),
      inputDecimals: fromToken?.decimals ?? 18,
      outputDecimals: toToken?.decimals ?? 18,
      approvalAddress: quoteData.route?.transactionRequest?.targetAddress || tr.to,
      costEstimate: this.processCostEstimate(quoteData.route?.estimate ?? {}),
    });
  };

  public async getQuote(p: ISwapperParams): Promise<ISquidQuoteResponse | undefined> {
    try {
      const response = await this.apiRequest<ISquidQuoteResponse>("route", this.convertParams(p));

      if (!response?.route) {
        throw formatError("Failed to fetch a valid quote from Squid", 400, response);
      }

      return response;
    } catch (error) {
      this.handleError(error, "[Squid] getQuote");
      return undefined;
    }
  }

  public async getTransactionRequest(
    p: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    try {
      const quote = await this.getQuote(p);
      if (!quote?.route?.transactionRequest) {
        throw formatError("No transaction request found in Squid quote", 400, quote);
      }

      const txRequest = quote.route.transactionRequest;
      const routerAddress = this.getRouterAddress(p.inputChainId);

      if (routerAddress && txRequest.targetAddress !== routerAddress) {
        console.warn(
          `Squid router mismatch: expected ${routerAddress}, got ${txRequest.targetAddress}`,
        );
      }

      return this.processTransactionRequest(
        {
          to: txRequest.targetAddress,
          data: txRequest.data,
          value: txRequest.value ? BigInt(txRequest.value.toString()) : BigInt(0),
          from: p.payer,
          chainId: parseInt(p.inputChainId.toString()),
        },
        quote,
      );
    } catch (error) {
      this.handleError(error, "[Squid] getTransactionRequest");
      return undefined;
    }
  }

  public async getStatus(p: IStatusParams): Promise<IStatusResponse | undefined> {
    try {
      if (!p.txHash) {
        throw new Error("Transaction hash is required for Squid status check");
      }

      const response = await this.apiRequest<ISquidTransactionStatus>(
        `status?transactionId=${p.txHash}`,
      );

      return {
        id: p.txHash,
        status:
          {
            SUBMITTED: OperationStatus.PENDING,
            PENDING: OperationStatus.PENDING,
            EXECUTED: OperationStatus.PENDING,
            SUCCESS: OperationStatus.DONE,
            FAILED: OperationStatus.FAILED,
            REFUNDED: OperationStatus.FAILED,
            CANCELLED: OperationStatus.FAILED,
          }[response.status] || OperationStatus.PENDING,
        txHash: response.id,
        receivingTx: response.id,
        substatus: response.status,
        substatusMessage: response.error?.message || "",
      };
    } catch (error) {
      if (error instanceof Error && error.message?.includes("Transaction not found")) {
        return { id: p.txHash || "", status: OperationStatus.NOT_FOUND };
      }
      this.handleError(error, "[Squid] getStatus");
      return undefined;
    }
  }
}

export const squidAggregator = new Squid();

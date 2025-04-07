import {
  ISocketQuote,
  ISocketRoute,
  ISocketStatusData,
  ISocketSwapData,
  ISocketToken,
  ISocketUserTx,
} from "./types";

import { BaseAggregator } from "@/abstract";
import {
  AggId,
  ICostEstimate,
  IStatusParams,
  IStatusResponse,
  ISwapperParams,
  ITransactionRequestWithEstimate,
  OperationStatus,
} from "@/types";
import {
  addEstimatesToTransactionRequest,
  buildQueryParams,
  emptyCostEstimate,
  formatError,
  fetchJson,
  mapKToKV,
  toBigInt,
} from "@/utils";

/**
 * Socket Aggregator Implementation
 * @see https://docs.socket.tech/socket-api/introduction
 */
export class Socket extends BaseAggregator {
  constructor() {
    super(AggId.SOCKET);
    this.routerByChainId = {
      1: "0x3a23F943181408EAC424116Af7b7790c94Cb97a5", // Ethereum
      10: "0x3a23F943181408EAC424116Af7b7790c94Cb97a5", // Optimism
      56: "0x3a23F943181408EAC424116Af7b7790c94Cb97a5", // BNB Chain
      100: "0x3a23F943181408EAC424116Af7b7790c94Cb97a5", // Gnosis Chain
      137: "0x3a23F943181408EAC424116Af7b7790c94Cb97a5", // Polygon
      324: "0xaDdE7028e7ec226777e5dea5D53F6457C21ec7D6", // zkSync Era
      1101: "0x3a23F943181408EAC424116Af7b7790c94Cb97a5", // Polygon zkEVM
      8453: "0x3a23F943181408EAC424116Af7b7790c94Cb97a5", // Base
      59144: "0x3a23F943181408EAC424116Af7b7790c94Cb97a5", // Linea
      42161: "0x3a23F943181408EAC424116Af7b7790c94Cb97a5", // Arbitrum
      43114: "0x3a23F943181408EAC424116Af7b7790c94Cb97a5", // Avalanche
    };
    this.aliasByChainId = mapKToKV(this.routerByChainId);
    this.approvalAddressByChainId = this.routerByChainId;
  }

  private getHeaders = (): Record<string, string> => ({
    "Content-Type": "application/json",
    ...(this.apiKey && { "API-KEY": this.apiKey }),
  });

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

  private processCostEstimate = (route: ISocketRoute): ICostEstimate => {
    const costs = emptyCostEstimate();
    costs.totalFeeCostWei = BigInt(route.integratorFee.amount);

    route.userTxs?.forEach(tx => {
      if (tx.gasFees?.feesInUsd) {
        costs.totalGasCostUsd += tx.gasFees.feesInUsd;
      }
      if (tx.gasFees?.gasAmount) {
        try {
          costs.totalGasCostWei += BigInt(tx.gasFees.gasAmount);
        } catch (e) {
          // Ignoring invalid BigInt conversion errors to maintain processing
        }
      }
    });

    return costs;
  };

  protected convertParams = (
    p: ISwapperParams,
  ): Record<string, string | number | boolean | undefined> => {
    p = this.validateQuoteParams(p);
    const result: Record<string, string | number | boolean | undefined> = {
      fromChainId: p.inputChainId.toString(),
      toChainId: (p.outputChainId ?? p.inputChainId).toString(),
      fromTokenAddress: p.input,
      toTokenAddress: p.output,
      fromAmount: p.amountWei.toString(),
      userAddress: p.payer,
      recipient: p.receiver ?? p.payer,
      uniqueRoutesPerBridge: true,
      sort: "output",
      integrator: p.integrator || this.integrator,
    };

    if (p.maxSlippage) {
      const slippageValue = Math.min(Math.round(p.maxSlippage / 100), 1);
      result.defaultSwapSlippage = slippageValue;
      result.defaultBridgeSlippage = slippageValue;
    }

    return result;
  };

  private parseToken = (token: ISocketToken) => ({
    address: token.address,
    decimals: typeof token.decimals === "string" ? parseInt(token.decimals) : token.decimals,
    symbol: token.symbol,
    chainId: token.chainId,
    name: token.name,
    logoURI: token.logoURI,
    priceUSD: token.chainAgnosticId?.toString(),
  });

  private parseSteps = (route: ISocketRoute) => {
    if (!route.userTxs?.length) return [];

    return route.userTxs.map(tx => {
      const protocol = tx.protocol || {};
      return {
        id: route.routeId,
        type: tx.userTxType || "swap",
        description: protocol.displayName || "",
        fromToken: this.parseToken(tx.fromAsset),
        toToken: this.parseToken(tx.toAsset),
        fromAmount: tx.fromAmount,
        toAmount: tx.toAmount,
        fromChain: tx.chainId,
        toChain: tx.chainId,
        tool: protocol.name || "",
        toolDetails: {
          key: protocol.name || "",
          name: protocol.displayName || "",
          logoURI: protocol.icon || "",
        },
      };
    });
  };

  private processTransactionRequest = (
    tr: Partial<ITransactionRequestWithEstimate>,
    route: ISocketRoute,
    swapData: ISocketSwapData,
  ): ITransactionRequestWithEstimate => {
    if (!tr.to || !tr.data) throw new Error("Incomplete transaction request");

    tr.aggregatorId = this.id;
    const steps = this.parseSteps(route);
    const approvalAddress =
      swapData.approvalData?.allowanceTarget || this.getApprovalAddress(tr.chainId!) || tr.to;

    return addEstimatesToTransactionRequest({
      tr: tr as ITransactionRequestWithEstimate,
      steps,
      inputAmountWei: BigInt(route.fromAmount.toString()),
      outputAmountWei: BigInt(route.toAmount.toString()),
      inputDecimals: steps[0]!.fromToken!.decimals,
      outputDecimals: steps[0]!.toToken!.decimals,
      approvalAddress,
      costEstimate: this.processCostEstimate(route),
    });
  };

  public async getQuote(p: ISwapperParams): Promise<ISocketQuote | undefined> {
    try {
      const response = await this.apiRequest<{ result: ISocketQuote }>(
        "quote",
        this.convertParams(p),
      );
      if (!response.result?.routes?.[0]) {
        throw formatError("Failed to fetch a valid quote from Socket", 400, response);
      }
      return response.result;
    } catch (error) {
      this.handleError(error, "[Socket] getQuote");
      return undefined;
    }
  }

  public async getTransactionRequest(
    p: ISwapperParams,
  ): Promise<ITransactionRequestWithEstimate | undefined> {
    try {
      const quote = await this.getQuote(p);
      if (!quote?.routes?.[0]) {
        throw formatError("Failed to get a valid quote", 400, { quote });
      }

      const { result: swapData } = await this.apiRequest<{ result: ISocketSwapData }>(
        "build-tx",
        undefined,
        "POST",
        { route: quote.routes[0] },
      );

      if (swapData.txType !== "eth_sendTransaction") {
        throw formatError("Socket build-tx unsupported txType", 400, { swapData });
      }
      if (!swapData?.txTarget || !swapData?.txData) {
        throw formatError("Socket build-tx response missing target or data", 400, { swapData });
      }

      return this.processTransactionRequest(
        {
          to: swapData.txTarget,
          data: swapData.txData,
          value: swapData.value ? BigInt(swapData.value) : 0n,
          from: p.payer,
        },
        quote.routes[0],
        swapData,
      );
    } catch (error) {
      this.handleError(error, "[Socket] getTransactionRequest");
      return undefined;
    }
  }

  private parseTransactionStatus = (status: ISocketStatusData): IStatusResponse => ({
    id: status.sourceTx || "",
    status:
      {
        PENDING: OperationStatus.PENDING,
        CONFIRMED: OperationStatus.DONE,
        FAILED: OperationStatus.FAILED,
        NOT_FOUND: OperationStatus.NOT_FOUND,
      }[status?.sourceTxStatus?.toUpperCase()] || OperationStatus.PENDING,
    txHash: status.sourceTx,
    receivingTx: status.destinationTransactionHash,
    sendingTx: status.sourceTx,
    substatus: status.sourceTxStatus,
    substatusMessage: "",
  });

  public async getStatus(p: IStatusParams): Promise<IStatusResponse | undefined> {
    try {
      if (!p.txHash || p.fromChainId === undefined || p.toChainId === undefined) {
        throw new Error(
          "Missing required params for Socket getStatus (txHash, fromChainId, toChainId)",
        );
      }

      const fromChainNum = parseInt(p.fromChainId.toString(), 10);
      const toChainNum = parseInt(p.toChainId.toString(), 10);

      if (!this.isChainSupported(fromChainNum)) {
        throw new Error(`fromChainId ${p.fromChainId} is invalid or not supported by Socket`);
      }
      if (!this.isChainSupported(toChainNum)) {
        throw new Error(`toChainId ${p.toChainId} is invalid or not supported by Socket`);
      }

      const statusRes = await this.apiRequest<{
        result?: ISocketStatusData;
        error?: { message: string };
      }>("status", {
        transactionHash: p.txHash,
        fromChainId: p.fromChainId.toString(),
        toChainId: p.toChainId.toString(),
      });

      if (!statusRes.result) {
        if (statusRes.error?.message?.toLowerCase().includes("not found")) {
          return { id: p.txHash || "", status: OperationStatus.NOT_FOUND };
        }
        throw formatError("Failed to fetch status from Socket or invalid data", 500, statusRes);
      }

      return this.parseTransactionStatus(statusRes.result);
    } catch (error) {
      this.handleError(error, "[Socket] getStatus");
      return undefined;
    }
  }
}

export const socketAggregator = new Socket();

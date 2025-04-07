// import { rocketXAggregator } from "@/RocketX";
import { BaseAggregator } from "@/abstract";
import { firebirdAggregator } from "@/Firebird";
import { kyberSwapAggregator } from "@/KyberSwap";
import { lifiAggregator } from "@/LiFi";
import { odosAggregator } from "@/Odos";
import { oneInchAggregator } from "@/OneInch";
import { openOceanAggregator } from "@/OpenOcean";
import { paraSwapAggregator } from "@/ParaSwap";
import { rangoAggregator } from "@/Rango";
import { socketAggregator } from "@/Socket";
import { squidAggregator } from "@/Squid";
// import { bebopAggregator } from "@/Bebop";
// import { debridgeAggregator } from "@/DeBridge";
// import { cowSwapAggregator } from "@/CowSwap";
// import { hashflowAggregator } from "@/Hashflow";
// import { airSwapAggregator } from "@/AirSwap";
// import { oneInchFusionAggregator } from "@/OneInchFusion";
// import { zeroXv2Aggregator } from "@/ZeroXv2";
// import { paraSwapDeltaAggregator } from "@/ParaSwapDelta";
// import { unizenGaslessAggregator } from "@/UnizenGasless";
import { AggId, ISwapperParams, ITransactionRequestWithEstimate } from "@/types";
import { unizenAggregator } from "@/Unizen";
import { swapperParamsToString, transactionRequestToString, weiToString } from "@/utils";
import { zeroXAggregator } from "@/ZeroX";

/** Mapping of AggId to its corresponding Aggregator implementation instance. */
export const aggregatorById: { [key: string]: BaseAggregator } = {
  // Meta-Aggregators
  [AggId.SQUID]: squidAggregator,
  [AggId.LIFI]: lifiAggregator,
  [AggId.SOCKET]: socketAggregator,
  [AggId.RANGO]: rangoAggregator,
  [AggId.UNIZEN]: unizenAggregator,
  // [AggId.ROCKETX]: rocketXAggregator,

  // Passive liquidity aggregators
  [AggId.ONE_INCH]: oneInchAggregator,
  [AggId.ZERO_X]: zeroXAggregator,
  [AggId.PARASWAP]: paraSwapAggregator,
  [AggId.KYBERSWAP]: kyberSwapAggregator,
  [AggId.ODOS]: odosAggregator,
  [AggId.FIREBIRD]: firebirdAggregator,
  [AggId.OPENOCEAN]: openOceanAggregator,
  // [AggId.BEBOP]: bebopAggregator

  // JIT liquidity aggregators
  // [AggId.COWSWAP]: cowSwapAggregator,
  // [AggId.HASHFLOW]: hashflowAggregator,
  // [AggId.AIRSWAP]: airSwapAggregator,
  // [AggId.ONE_INCH_FUSION]: oneInchFusionAggregator,
  // [AggId.PARASWAP_DELTA]: paraSwapDeltaAggregator,
  // [AggId.ZERO_X_V2]: zeroXv2Aggregator,
};

/** List of aggregators supporting custom contract calls within a swap route. */
export const aggregatorsWithContractCalls = [AggId.LIFI, AggId.SOCKET, AggId.SQUID];
/** Default list of aggregators to query when none are specified and no custom calls are needed. */
export const defaultAggregators = [
  AggId.LIFI,
  AggId.SQUID,
  AggId.SOCKET,
  AggId.UNIZEN,
  AggId.RANGO,
];

/**
 * Fetches the transaction request and extracts only the `data` (calldata) field.
 * Useful for scenarios where only the calldata is needed without executing the transaction.
 * @param o - The swapper parameters.
 * @returns A promise resolving to the transaction calldata string, or an empty string if no data is found.
 */
export async function getCallData(o: ISwapperParams): Promise<string> {
  // Fetches the best transaction request and returns its data field.
  return (await getTransactionRequest(o))?.data?.toString() ?? "";
}

/**
 * Fetches transaction requests from multiple specified (or default) aggregators.
 * Filters out failed requests and sorts the successful ones by estimated exchange rate (best first).
 * @param o - The swapper parameters. `AggId` can be a string, an array, or omitted.
 * @returns A promise resolving to an array of successful transaction requests sorted by rate, or undefined if none succeed.
 * @throws {Error} If no viable routes are found from any queried aggregator.
 */
export async function getAllTransactionRequests(
  o: ISwapperParams,
): Promise<ITransactionRequestWithEstimate[] | undefined> {
  // Default aggregators based on whether custom calls are needed
  o.aggregatorId ??= o.customContractCalls?.length
    ? aggregatorsWithContractCalls
    : defaultAggregators;
  o.integrator ??= "astrolab"; // Default project identifier
  o.amountWei = weiToString(o.amountWei); // Ensure amount is string
  o.maxSlippage ||= 2_000; // Default to 20% slippage (pessimistic for testing/robustness)
  if (!(o.aggregatorId instanceof Array)) o.aggregatorId = [o.aggregatorId]; // Ensure AggId is array

  // Fetch quotes concurrently from all specified aggregators
  const trs = (
    await Promise.all(
      o.aggregatorId.map(
        async (aggregatorId): Promise<ITransactionRequestWithEstimate | undefined> => {
          const aggregator = aggregatorById[aggregatorId];
          if (!aggregator) {
            console.warn(`[Meta] Aggregator not found: ${aggregatorId}`);
            return undefined;
          }
          try {
            const tr = await aggregator.getTransactionRequest(o);
            if (tr) tr.aggregatorId ||= aggregatorId; // Tag the result with its source aggregator
            return tr;
          } catch (error) {
            // Log error from individual aggregator but don't fail the whole process
            console.error(`[${aggregatorId}] Error fetching transaction request:`, error);
            return undefined;
          }
        },
      ),
    )
  ).filter(Boolean) as ITransactionRequestWithEstimate[]; // Filter out undefined results (errors)

  if (trs.length === 0) {
    throw new Error(
      `No viable routes found for ${swapperParamsToString(o)} across aggregators: ${o.aggregatorId.join(", ")}`,
    );
  }

  // Sort routes by best estimated exchange rate (descending, higher is better)
  const sortedTrs = trs.sort((a, b) =>
    // Use optional chaining and nullish coalescing for safety
    (a?.estimatedExchangeRate ?? 0) < (b?.estimatedExchangeRate ?? 0) ? 1 : -1,
  );

  // Post-processing: Ensure `from` address is the actual payer (replace testPayer if used)
  sortedTrs.forEach(tr => {
    if (tr?.data) {
      tr.from = o.payer;
      // NB: Replacing address within calldata string is fragile and likely unnecessary.
      // The `from` field should be sufficient for signing/sending.
      // (tr.data as string)?.replace(tr.from!.substring(2), o.payer.substring(2));
    }
  });

  console.log(
    `${sortedTrs.length} routes found for ${swapperParamsToString(o)} (best: ${sortedTrs[0].aggregatorId}):\n${sortedTrs
      .map(tr => transactionRequestToString(tr))
      .join("\n")}`,
  );
  return sortedTrs;
}

/**
 * Gets the single best transaction request from the available aggregators based on estimated exchange rate.
 *
 * The result can be formatted for logging using transactionRequestToString().
 *
 * @param o - The swapper parameters.
 * @returns A promise resolving to the best transaction request, or undefined if none found.
 */
export const getTransactionRequest = async (
  o: ISwapperParams,
): Promise<ITransactionRequestWithEstimate | undefined> =>
  (await getAllTransactionRequests(o))?.[0];

// Re-export core types and utilities for easier library usage
export * from "@/abstract";
export * from "@/types";
export * from "@/utils";
// Export all aggregator implementations

// Meta-Aggregators
export * from "@/LiFi";
export * from "@/Rango";
export * from "@/Socket";
export * from "@/Squid";
export * from "@/Unizen";
// export * from "@/RocketX";

// Passive Liquidity Aggregators
export * from "@/Firebird";
export * from "@/KyberSwap";
export * from "@/Odos";
export * from "@/OneInch";
export * from "@/OpenOcean";
export * from "@/ParaSwap";
export * from "@/ZeroX";
// export * from "@/Bebop";

// JIT / Intent-Based (Not Implemented)
// export * from "@/CowSwap";
// export * from "@/Hashflow";
// export * from "@/AirSwap";

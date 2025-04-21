import { BaseAggregator } from "./abstract";
import config from "./config";
import { aggregatorsWithContractCalls, defaultAggregators, MAX_SLIPPAGE_BPS } from "./constants";
import { firebirdAggregator } from "./Firebird";
import { kyberSwapAggregator } from "./KyberSwap";
import { lifiAggregator } from "./LiFi";
import { odosAggregator } from "./Odos";
import { oneInchAggregator } from "./OneInch";
import { openOceanAggregator } from "./OpenOcean";
import { paraSwapAggregator } from "./ParaSwap";
import { rangoAggregator } from "./Rango";
import { socketAggregator } from "./Socket";
import { squidAggregator } from "./Squid";
import {
  DisplayMode,
  IBtrSwapCliParams,
  IBtrSwapParams,
  ITransactionRequestWithEstimate,
  SerializationMode,
  AggId,
} from "./types";
import { unizenAggregator } from "./Unizen";
import {
  compactTrs,
  getToken,
  getTrPerformance,
  getTrPerformanceTable,
  paramsToString,
  serialize,
  sortTrsByRate,
  toJSON,
} from "./utils";
import { zeroXAggregator } from "./ZeroX";

/** Mapping of AggId to its corresponding Aggregator implementation instance. */
export const aggregatorById: Partial<{ [key in AggId]: BaseAggregator }> = {
  // Meta-Aggregators
  [AggId.SQUID]: squidAggregator,
  [AggId.LIFI]: lifiAggregator,
  [AggId.SOCKET]: socketAggregator,
  [AggId.RANGO]: rangoAggregator,
  [AggId.UNIZEN]: unizenAggregator,

  // Passive liquidity aggregators
  [AggId.ONE_INCH]: oneInchAggregator,
  [AggId.ZERO_X]: zeroXAggregator,
  [AggId.PARASWAP]: paraSwapAggregator,
  [AggId.KYBERSWAP]: kyberSwapAggregator,
  [AggId.ODOS]: odosAggregator,
  [AggId.FIREBIRD]: firebirdAggregator,
  [AggId.OPENOCEAN]: openOceanAggregator,
};

/**
 * Fetches the best transaction request and extracts its calldata.
 * Useful for scenarios where only the transaction calldata is needed.
 * @param o - BTR Swap parameters.
 * @returns A promise resolving to the transaction calldata string, or an empty string if no data is found.
 */
export async function getCallData(o: IBtrSwapParams): Promise<string> {
  // Fetches the best transaction request and returns its data field.
  return (await getBestTransactionRequest(o))?.data?.toString() ?? "";
}

/**
 * Fetches transaction requests concurrently from multiple specified aggregators.
 * Sorts the successful results by the best estimated output amount (exchange rate).
 * Includes a timeout mechanism for each aggregator request.
 * @param o - BTR Swap parameters.
 * @returns Array of successful transaction requests sorted by rate, or undefined if none succeed.
 * @throws {Error} If no viable routes are found.
 */
export async function getAllTimedTr(
  params: IBtrSwapParams,
): Promise<ITransactionRequestWithEstimate[]> {
  const aggIds = params.aggIds ?? defaultAggregators;
  const filteredAggIds = aggIds.filter((id) => aggregatorById[id]);

  params.expiryMs ??= 5_000; // 5s timeout

  // Fetch quotes concurrently with timeout
  const trs = (
    await Promise.all(
      filteredAggIds.map(
        async (aggId: string): Promise<ITransactionRequestWithEstimate | undefined> => {
          const aggregator = aggregatorById[aggId as AggId];
          if (!aggregator) throw new Error(`Aggregator not found: ${aggId}`);

          try {
            const timeoutPromise = new Promise<undefined>((resolve) =>
              setTimeout(() => resolve(undefined), params.expiryMs),
            );

            const tr = await Promise.race([aggregator.getTimedTr(params), timeoutPromise]);
            if (tr && !tr.aggId) tr.aggId = aggregator.id;
            return tr;
          } catch (e) {
            console.error(`[${aggId}] Error retrieving tx`, e);
            return undefined;
          }
        },
      ),
    )
  ).filter(Boolean) as ITransactionRequestWithEstimate[];

  if (trs.length === 0) {
    throw new Error(
      `No viable routes found for ${paramsToString(params)} across aggregators: ${filteredAggIds.join(", ")}`,
    );
  }

  // Sort by best rate and ensure correct payer address
  const sortedTrs = sortTrsByRate(trs);
  sortedTrs.forEach((tr) => {
    if (tr?.data) tr.from = params.payer;
  });

  // Preserve original aggregator IDs
  const originalAggIds = [...filteredAggIds];
  params.aggIds = originalAggIds;
  return sortedTrs;
}

/**
 * Fetches the single best transaction request from the available aggregators.
 * It determines the "best" request based on the highest estimated output amount after fetching from all specified aggregators.
 * Uses `getAllTimedTr` internally.
 * @param o - BTR Swap parameters.
 * @returns A promise resolving to the best transaction request, or undefined if none found.
 */
export const getBestTransactionRequest = async (
  o: IBtrSwapParams,
): Promise<ITransactionRequestWithEstimate | undefined> => (await getAllTimedTr(o))?.[0];

// Export types and functions needed by the CLI and other consumers
export {
  compactTrs,
  config,
  defaultAggregators,
  DisplayMode,
  getToken,
  getTrPerformance,
  getTrPerformanceTable,
  MAX_SLIPPAGE_BPS,
  SerializationMode,
  serialize,
  toJSON,
  AggId,
};
export type { IBtrSwapCliParams, IBtrSwapParams, ITransactionRequestWithEstimate };

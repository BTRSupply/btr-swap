import {
  IGlobalEstimate,
  ICostEstimate,
  ISwapperParams,
  ITransactionRequestWithEstimate,
  Stringifiable,
} from "@/types";

/**
 * Creates a standardized error message for API errors
 * @param message - Base error message
 * @param statusCode - HTTP status code if available
 * @param responseData - Additional response data
 * @returns Formatted error message
 */
function formatApiErrorMessage(message: string, statusCode?: number, responseData?: any): string {
  let formattedMessage = message;

  if (statusCode) {
    formattedMessage += ` (HTTP ${statusCode})`;
  }

  if (responseData) {
    try {
      const dataStr =
        typeof responseData === "string"
          ? responseData.substring(0, 100)
          : JSON.stringify(responseData, null, 2).substring(0, 100);
      formattedMessage += `: ${dataStr}${dataStr.length > 100 ? "..." : ""}`;
    } catch (e) {
      formattedMessage += `: [${typeof responseData} data]`;
    }
  }

  return formattedMessage;
}

/**
 * Creates an Error with a formatted message that includes status code and response data
 * @param message - Base error message
 * @param statusCode - HTTP status code if available
 * @param responseData - Additional response data
 * @returns Error with formatted message
 */
export function formatError(message: string, statusCode?: number, responseData?: any): Error {
  return new Error(formatApiErrorMessage(message, statusCode, responseData));
}

/** Interface for fetch options (extends RequestInit). */
export type FetchOptions = RequestInit;

/**
 * Fetches JSON data from a URL with standardized error handling and type safety.
 * @param url - The URL to fetch.
 * @param options - Optional fetch options (RequestInit).
 * @param method - Optional HTTP method (defaults to GET).
 * @returns A promise that resolves to the parsed JSON data of type T.
 * @throws {Error} If the fetch fails, the response status is not ok, or JSON parsing fails.
 */
export async function fetchJson<T = unknown>(
  url: string | URL,
  options?: FetchOptions,
  method?: string,
): Promise<T> {
  const effectiveMethod = method || options?.method || "GET";
  const fetchOptions = { ...options, method: effectiveMethod };

  try {
    console.debug(`>>>req [${effectiveMethod}] ${url}`);
    const response = await fetch(url, fetchOptions);

    if (!response.ok) {
      let errorData: unknown;
      try {
        errorData = await response.json();
      } catch {
        errorData = await response.text().catch(() => "Could not read error response body");
      }
      throw formatError(
        `API error ${response.status} calling ${effectiveMethod} ${url}`,
        response.status,
        errorData,
      );
    }

    return (await response.json()) as T;
  } catch (error: unknown) {
    if (error instanceof Error) throw error;

    const message = error instanceof Error ? error.message : "Network error during fetch";
    throw new Error(`Error calling ${effectiveMethod} ${url}: ${message}`);
  }
}

/**
 * Creates a URL query string from a record of parameters.
 * Uses URLSearchParams and filters out null/undefined values.
 * Does not handle complex nested objects/arrays like the 'qs' library.
 * @param params - Object containing query parameters.
 * @returns A URL-encoded query string.
 */
export function buildQueryParams(
  params: Record<string, string | number | boolean | undefined | null>,
): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) {
      searchParams.append(key, String(value));
    }
  }
  return searchParams.toString();
}

/**
 * Converts a WEI value (string, number, bigint, or Stringifiable object) to a string.
 * Rounds numbers before converting to BigInt.
 * @param wei - The WEI value to convert.
 * @returns The WEI value as a string.
 */
export const weiToString = (wei: string | number | bigint | Stringifiable): string => {
  if (typeof wei === "string") return wei;
  if (typeof wei === "number") return BigInt(Math.round(wei)).toString();
  return wei.toString(); // For bigint and Stringifiable objects
};

/**
 * Rounds a WEI value and returns a compact string representation using exponential notation.
 * Useful for displaying large numbers concisely.
 * @param wei - The WEI value (number, string, or BigInt).
 * @returns A compact string representation (e.g., "1.23e18").
 */
export function compactWei(wei: number | string | bigint | Stringifiable): string {
  const numWei = typeof wei === "object" ? Number(wei.toString()) : Number(wei);
  const roundedWei = Math.round(numWei / 1e4) * 1e4;
  if (!isFinite(roundedWei)) return "0";
  return roundedWei.toExponential().replace(/\.0+e/, "e");
}

/**
 * Shortens an Ethereum address for display purposes.
 * @param address - The full Ethereum address string.
 * @param start - Number of characters to show after "0x". Defaults to 4.
 * @param end - Number of characters to show at the end. Defaults to 4.
 * @param sep - Separator string between start and end parts. Defaults to ".".
 * @returns The shortened address string (e.g., "0x1234.5678").
 */
export function shortenAddress(address: string, start = 4, end = 4, sep = "."): string {
  const safeStart = Math.max(0, start);
  const safeEnd = Math.max(0, end);
  if (2 + safeStart + safeEnd >= address.length) return address;
  return address.slice(0, 2 + safeStart) + sep + address.slice(-safeEnd);
}

/**
 * Converts swapper parameters into a human-readable string for logging/debugging.
 * @param o - The swapper parameters object.
 * @param callData - Optional transaction call data to include partially.
 * @returns A formatted string summarizing the swap details.
 */
export function swapperParamsToString(o: ISwapperParams, callData?: string): string {
  return `[${o.aggregatorId ?? "Meta"}] ${Number(o.amountWei) / 10 ** o.inputDecimals} ${o.inputSymbol} (${o.inputChainId}:${shortenAddress(o.input)}) → ${
    o.outputSymbol
  } (${o.outputChainId}:${shortenAddress(o.output)}) ${
    !callData ? "" : ` [data: ${callData.substring(0, 10)}...${callData.length}b]`
  }`;
}

/**
 * Converts a transaction request with estimate into a human-readable string for logging/debugging.
 * @param tr - The transaction request with estimate object
 * @returns A formatted string summarizing the transaction details
 */
export function transactionRequestToString(tr: ITransactionRequestWithEstimate): string {
  if (!tr) return "Empty transaction request";

  // Extract input/output symbols from steps if available
  const output = tr.steps?.[tr.steps.length - 1]?.toToken;

  return `[${tr.aggregatorId || "???"}] swapper: ${shortenAddress(tr.to || "???")} → ${tr.estimatedOutput!} ${output!.symbol || "???"} ${output!.address!} | Rate: ${Number(tr.estimatedExchangeRate).toFixed(6)} | Gas: $${
    tr.gasEstimate?.totalGasCostUsd?.toFixed(3) || "0"
  } | Fee: $${tr.gasEstimate?.totalFeeCostUsd?.toFixed(3) || "0"}${
    tr.steps?.length ? ` | Steps: ${tr.steps.length}` : ""
  }`;
}

/**
 * Populates estimate fields (output amounts, exchange rate, gas) onto a base transaction request.
 * @param o - Parameters including the base transaction, amounts, decimals, approval target, and gas estimate.
 * @returns The transaction request object populated with calculated estimates.
 */
export function addEstimatesToTransactionRequest(
  o: IGlobalEstimate,
): ITransactionRequestWithEstimate {
  // Calculate approximate human-readable amounts for rate calculation
  // Avoid division by zero if decimals are very small
  const inputExp = Math.max(o.inputDecimals - 6, 0);
  const outputExp = Math.max(o.outputDecimals - 6, 0);

  const inputAmountNum =
    Number(o.inputAmountWei / BigInt(10 ** inputExp)) / 10 ** (o.inputDecimals - inputExp);
  const outputAmountNum =
    Number(o.outputAmountWei / BigInt(10 ** outputExp)) / 10 ** (o.outputDecimals - outputExp);

  // Add calculated estimates to the transaction request object
  o.tr.estimatedOutput = outputAmountNum;
  o.tr.estimatedOutputWei = o.outputAmountWei.toString();
  o.tr.estimatedExchangeRate = inputAmountNum > 0 ? outputAmountNum / inputAmountNum : 0;
  o.tr.steps = o.steps ?? [];
  o.tr.approvalAddress = o.approvalAddress;
  o.tr.gasEstimate = o.costEstimate;
  return o.tr;
}

/**
 * Checks if a string is a valid Ethereum address format.
 * @param s - The string to check.
 * @returns True if the string matches the Ethereum address pattern, false otherwise.
 */
const isAddress = (s: string): boolean => /^0x[a-fA-F0-9]{40}$/i.test(s);

/**
 * Validates the core parameters required for a swap quote.
 * Checks for valid addresses and positive, non-zero amounts/chain IDs.
 * @param o - The swapper parameters object.
 * @returns True if the basic parameters are valid, false otherwise.
 */
export const validateQuoteParams = (o: ISwapperParams): boolean => {
  if (!o || typeof o !== "object") return false;
  if (!isAddress(o.input) || !isAddress(o.output) || !isAddress(o.payer)) return false;
  if (isNaN(o.inputChainId) || o.inputChainId <= 0) return false;
  if (!o.amountWei) return false;
  try {
    if (BigInt(o.amountWei.toString()) <= 0n) return false;
  } catch {
    return false; // Invalid BigInt string
  }
  // Optional outputChainId validation if needed
  // if (o.outputChainId !== undefined && (isNaN(o.outputChainId) || o.outputChainId <= 0)) return false;
  return true;
};

/**
 * Safely converts a value to BigInt, handling common types.
 * Returns 0n for unrecognized or invalid inputs.
 * @param value - The value to convert (string, number, boolean, bigint, or object with toString).
 * @returns The BigInt representation, or 0n if conversion fails.
 */
export function toBigInt(value: any): bigint {
  try {
    if (typeof value === "bigint") return value;
    if (typeof value === "number") return BigInt(Math.floor(value)); // Floor to handle potential decimals
    if (typeof value === "string") return BigInt(value.trim()); // Trim whitespace
    if (typeof value === "boolean") return BigInt(value ? 1 : 0);
    if (value && typeof value.toString === "function") {
      // Attempt conversion from objects with toString, ensure it's a valid number string
      const strValue = value.toString().trim();
      // Basic check to prevent BigInt(undefined) or BigInt("[object Object]")
      if (strValue && !isNaN(Number(strValue))) {
        return BigInt(strValue);
      }
    }
  } catch (e) {
    console.error(`[toBigInt] Error converting value: ${value}`, e);
  }
  // Fallback for null, undefined, failed conversions, or unsupported types
  return 0n;
}

/**
 * Helper to get env var or null
 * @param key - The environment variable name.
 * @returns The value as a string, or null.
 */
export const envOrNull = (key: string): string | null => process.env[key] ?? null;

/**
 * Helper to parse int env var or return default
 * @param key - The environment variable name.
 * @param defaultValue - The default integer value to return on failure.
 * @returns The parsed integer value or the default value.
 */
export const envInt = (key: string, defaultValue: number): number => {
  const value = envOrNull(key);
  if (value === null) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Retrieves an environment variable for an API root URL.
 * Ensures proper URL formatting with protocol.
 * @param key - The environment variable name.
 * @param fallbackRoot - The fallback root domain.
 * @returns The API root domain with protocol.
 */
export const envApiRoot = (key: string, fallbackRoot: string): string => {
  const value = process.env[key];
  const urlToUse = value?.trim() || fallbackRoot;

  // Ensure URL has a protocol
  if (urlToUse.startsWith("http://") || urlToUse.startsWith("https://")) {
    return urlToUse;
  }

  // Add https:// if no protocol is present
  return `https://${urlToUse}`;
};

/**
 * Creates a new object with same keys but values derived from the keys.
 * @param o - Input object with string keys/values
 * @param fn - Optional key transform function (default: identity)
 * @example mapKToKV({foo: "x"}) // {foo: "foo"}
 */
export function mapKToKV(
  o: Record<string, string>,
  fn: (k: string) => string = k => k,
): Record<string, string> {
  return Object.fromEntries(Object.keys(o).map(k => [k, fn(k)]));
}

/**
 * Removes the protocol part (http:// or https://) from a URL.
 * @param url - The URL to strip the protocol from.
 * @returns The URL without the protocol part.
 */
export function stripProtocol(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

/**
 * Creates a default gas estimate object with zero values.
 * Used when actual gas costs are unknown or unavailable.
 * @returns A zeroed IGasEstimate object
 */
export function emptyCostEstimate(): ICostEstimate {
  return {
    totalGasCostUsd: 0,
    totalGasCostWei: 0n,
    totalFeeCostUsd: 0,
    totalFeeCostWei: 0n,
  };
}

export function notImplemented(method: string): never {
  throw new Error(`${method} is not implemented`);
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

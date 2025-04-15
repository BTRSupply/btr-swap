#!/usr/bin/env node

/**
 * BTR Swap CLI tool
 *
 * Provides a command-line interface for interacting with the BTR Swap SDK.
 * Compatible with Node and Bun.
 * Allows users to fetch quotes from various DEX aggregators with simple commands.
 * Supports both same-chain and cross-chain swaps with customizable parameters.
 */

import * as fs from "fs";
import * as path from "path";
import { config as loadDotenv } from "dotenv";

// Import from the core package
import {
  compactTrs,
  getAllTimedTr,
  getToken,
  getTrPerformance,
  getTrPerformanceTable,
  serialize,
  defaultAggregators,
  MAX_SLIPPAGE_BPS,
  config,
  AggId,
  DisplayMode,
  SerializationMode,
  IBtrSwapCliParams,
  ITransactionRequestWithEstimate,
} from "@btr-supply/swap";

const HELP_MESSAGE = `
BTR Swap CLI - Get quotes from BTR Swap SDK

Usage:
  swap-cli quote [options]

Options:
  --input <token>            Required. Input token details <chainId:address:symbol:decimals>
  --input-amount <amount>    Required. Amount in wei (e.g., 1000000000000000000 or 1e18).
  --output <token>           Required. Output token details <chainId:address:symbol:decimals>
  --payer <address>          Required. Payer address.
  --receiver <address>       Optional. Receiver address. Defaults to payer address.
  --max-slippage <bps>       Maximum slippage tolerance in basis points (e.g., 50 for 0.5%, default: ${MAX_SLIPPAGE_BPS}).
  --aggregators <ids>        Comma-separated aggregator IDs (e.g. ${AggId.LIFI},${AggId.UNIZEN}).
                             Defaults to ${defaultAggregators.join(",")}.
  --api-keys <json>          JSON string for multiple API keys: '{"${AggId.RANGO}":"key1","${AggId.SOCKET}":"key2",...}'.
  --referrer-codes <json>    JSON string for referrer codes/addresses: '{"${AggId.RANGO}":"ref1","${AggId.ONE_INCH}":123,...}'.
  --integrator-ids <json>    JSON string for per-aggregator integrator IDs: '{"${AggId.LIFI}":"custom-id-1","${AggId.SQUID}":"custom-id-2"}'.
  --fees-bps <json>          JSON string for integrator fee basis points: '{"${AggId.LIFI}":20,"${AggId.SOCKET}":30}'.
  --display <modes>          Comma-separated display modes: ${Object.values(DisplayMode).join(",")}.
  --serialization <mode>     Serialization mode: ${Object.values(SerializationMode).join(",")}.
  --silent                   Optional. Suppress informational logs, only show the final output. Defaults to false.
  --env-file <path>          Path to custom .env file to load environment variables from.
  -h, --help                 Display this help message.

Examples:
  # Same-chain ETH -> DAI on Ethereum via 1inch
  swap-cli quote \\
    --input 1:0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE:ETH:18 \\
    --output 1:0x6B175474E89094C44Da98b954EedeAC495271d0F:DAI:18 \\
    --input-amount 1e18 \\
    --payer 0xYourAddressHere \\
    --aggregators ${AggId.LIFI}

  # Specify Li.Fi aggregator ID and Rango API key
  swap-cli quote \\
    --input 1:0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE:ETH:18 \\
    --output 10:0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1:DAI:18 \\
    --input-amount 5e17 \\
    --payer 0x... \\
    --serialization ${SerializationMode.TABLE} \\
    --display ${DisplayMode.RANK},${DisplayMode.ALL_COMPACT} \\
    --aggregators ${AggId.RANGO},${AggId.LIFI} \\
    --integrator-ids '{"${AggId.LIFI}":"integrator-id"}' \\
    --api-keys '{"${AggId.RANGO}":"api-key"}' \\
    --serialization ${SerializationMode.TABLE}
`;

/**
 * Handles errors by logging them and exiting the process
 * @param message - The error message to display
 * @param details - Optional additional error details
 * @returns Never returns - exits the process
 */
const handleError = (message: string, details?: any): never => {
  console.error(`❌ ${message}`, details || "");
  process.exit(1);
};

/**
 * Parses command-line arguments into a structured object
 * @param args - Raw command-line arguments array
 * @returns Parsed arguments as a structured object
 */
const parseArgs = (args: string[]) => {
  const parsed: Record<string, string | string[] | boolean> = {};
  const multiValue = new Set(["aggregators", "display"]);
  let currentKey: string | null = null;

  for (const arg of args) {
    if (arg === "-h") parsed.help = true;
    else if (arg === "--silent") parsed.silent = true;
    else if (arg.startsWith("--")) currentKey = arg.slice(2);
    else if (currentKey) {
      parsed[currentKey] = multiValue.has(currentKey) ? arg.split(",").map((v) => v.trim()) : arg;
      currentKey = null;
    } else if (!parsed._command) parsed._command = arg;
  }
  return parsed;
};

/**
 * Parses and validates enum arguments
 * @param value - The value to parse
 * @param valid - Set of valid enum values
 * @param name - Name of the argument (for error messages)
 * @param multi - Whether multiple values are allowed
 * @param defaultValue - Default value if none is provided
 * @returns Parsed and validated enum value(s)
 * @throws {Error} If validation fails
 */
const parseEnumArg = <T extends string>(
  value: any,
  valid: Set<T>,
  name: string,
  multi: boolean,
  defaultValue?: T | T[],
): T | T[] => {
  if (value === true) {
    handleError(`Missing value for --${name}.`);
  }

  const values = (typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [])
    .map((v) => v.trim())
    .filter(Boolean) as T[];

  if (!values.length && defaultValue !== undefined) return defaultValue;

  if (multi) {
    const uniqueValues = [...new Set(values)];
    const invalidValues = uniqueValues.filter((v) => !valid.has(v));
    if (invalidValues.length) {
      handleError(
        `Invalid --${name}: ${invalidValues.join(", ")}`,
        `Valid: ${[...valid].join(", ")}`,
      );
    }
    return uniqueValues;
  }

  if (values.length && !valid.has(values[0])) {
    handleError(`Invalid --${name}: ${values[0]}`, `Valid: ${[...valid].join(", ")}`);
  }

  return multi ? values : values[0] || (defaultValue as T);
};

/**
 * Parses JSON configuration options
 * @param name - Name of the configuration option
 * @param value - JSON string to parse
 * @returns Parsed JSON object or undefined if value is empty
 * @throws {Error} If JSON parsing fails
 */
const parseJsonConfig = (name: string, value: any): Record<string, any> | undefined => {
  if (!value?.trim()) return undefined;
  try {
    const parsed = JSON.parse(value as string);
    if (typeof parsed !== "object" || parsed === null) throw new Error("Must be JSON object");
    return parsed;
  } catch (e: unknown) {
    handleError(`Invalid JSON for --${name}: ${e instanceof Error ? e.message : String(e)}`);
  }
};

/**
 * Loads environment variables from a file
 * @param filePath - Path to the .env file
 * @returns Parsed environment variables and metadata, or undefined if not found/error
 */
const loadEnv = (
  filePath: string,
): { parsed: Record<string, string>; count: number; path: string } | undefined => {
  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    return undefined;
  }
  const env = loadDotenv({ path: resolvedPath, override: true });
  if (env.error) handleError(`Env error: ${env.error.message}`);
  // Handle error ensures env.error doesn't proceed, but satisfy TS
  if (env.error) return undefined;
  return {
    parsed: env.parsed || {},
    count: Object.keys(env.parsed || {}).length,
    path: resolvedPath,
  };
};

/**
 * Applies configuration overrides to the global config
 * @param configs - Configuration objects to apply
 * @param silent - Whether to suppress logs
 */
const applyConfig = (
  configs: {
    apiKeys?: Record<string, string>;
    referrer?: Record<string, any>;
    integrators?: Record<string, string>;
    feesBps?: Record<string, number>;
  },
  silent: boolean,
) => {
  Object.entries(config).forEach(([aggId, cfg]) => {
    const agg = aggId as AggId;
    if (configs.apiKeys?.[agg]) cfg.apiKey = configs.apiKeys[agg];
    if (configs.referrer?.[agg] !== undefined) cfg.referrer = configs.referrer[agg];
    if (configs.integrators?.[agg]) cfg.integrator = configs.integrators[agg];
    if (configs.feesBps?.[agg] !== undefined) {
      const fee = Number(configs.feesBps[agg]);
      if (isNaN(fee)) {
        if (!silent)
          console.warn(`⚠️ Invalid fee for ${agg}: ${configs.feesBps[agg]}. Using default.`);
      } else {
        cfg.feeBps = fee;
      }
    }
  });
};

/**
 * Formats and displays output based on the specified mode and format
 * @param mode - Display mode to use (BEST, ALL, RANK, etc.)
 * @param trs - Transaction requests with estimates to display
 * @param serialization - Serialization format to use (JSON, CSV, TABLE)
 */
const displayOutput = (
  mode: DisplayMode,
  trs: ITransactionRequestWithEstimate[],
  serialization: SerializationMode,
) => {
  const output =
    mode === DisplayMode.RANK
      ? serialization === SerializationMode.TABLE
        ? getTrPerformanceTable(trs)
        : serialize(trs.map(getTrPerformance), { mode: serialization })
      : serialize(mode.includes("BEST") ? compactTrs(trs)[0] : compactTrs(trs), {
          mode: serialization,
          includeHeaders: !mode.includes("BEST"),
        });
  console.log(output);
};

/**
 * Main CLI function - parses arguments, fetches quotes, and displays results
 * @returns Promise that resolves when the CLI operation is complete
 */
const runCli = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args._command !== "quote") {
    console.log(HELP_MESSAGE);
    process.exit(0);
  }

  const silent = !!args.silent;

  if (!silent) console.log("🚀 Starting BTR Swap CLI...");

  try {
    // Load environment variables
    const envPath = args["env-file"] as string;
    let envResult: { parsed: Record<string, string>; count: number; path: string } | undefined;
    if (envPath) {
      envResult = loadEnv(envPath);
    } else if (fs.existsSync(".env")) {
      envResult = loadEnv(".env"); // Use loadEnv for default .env too
    }

    if (!silent && envResult) {
      // Check if envResult is defined (i.e., loaded successfully)
      console.log(`✅ Loaded ${envResult.count} vars from ${envResult.path}`);
    }

    // Validate required arguments
    const required = ["input", "output", "input-amount", "payer"];
    const missing = required.filter((k) => !args[k]);
    if (missing.length) handleError(`Missing: ${missing.join(", ")}`, HELP_MESSAGE);

    // Parse token and configuration
    const inputToken = getToken(args.input as string);
    const outputToken = getToken(args.output as string);
    if (!inputToken || !outputToken) handleError("Invalid token(s)");

    if (!silent) console.log("⚙️ Arguments parsed.");

    // Parse and validate amount
    let amountWei: bigint;
    try {
      const numAmount = Number(args["input-amount"] as string);
      if (isNaN(numAmount) || numAmount < 0) {
        handleError("Invalid --input-amount: Must be a non-negative number.");
      }
      amountWei = BigInt(numAmount.toLocaleString("fullwide", { useGrouping: false }));
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      handleError(`Error parsing --input-amount: ${errorMessage}`);
      amountWei = 0n; // Unreachable but satisfies TypeScript
    }

    // Parse configuration
    const configs = {
      apiKeys: parseJsonConfig("api-keys", args["api-keys"]),
      referrer: parseJsonConfig("referrer-codes", args["referrer-codes"]),
      integrators: parseJsonConfig("integrator-ids", args["integrator-ids"]),
      feesBps: parseJsonConfig("fees-bps", args["fees-bps"]),
    };
    applyConfig(configs, silent);
    if (!silent) console.log("🔧 Configuration applied.");

    // Parse enum arguments
    const aggregators = parseEnumArg(
      args.aggregators,
      new Set(Object.values(AggId)),
      "aggregators",
      true,
      defaultAggregators,
    ) as AggId[];

    const displayModes = parseEnumArg(
      args.display,
      new Set(Object.values(DisplayMode)),
      "display",
      true,
      [DisplayMode.ALL],
    ) as DisplayMode[];

    const serialization = parseEnumArg(
      args.serialization,
      new Set(Object.values(SerializationMode)),
      "serialization",
      false,
      SerializationMode.JSON,
    ) as SerializationMode;

    // Handle max slippage
    let maxSlippage = MAX_SLIPPAGE_BPS;
    if (args["max-slippage"]) {
      const parsedSlippage = parseInt(args["max-slippage"] as string, 10);
      if (isNaN(parsedSlippage) || parsedSlippage < 0) {
        handleError(`Invalid --max-slippage: ${args["max-slippage"]}`);
      }
      maxSlippage = parsedSlippage;
    }

    const params: IBtrSwapCliParams = {
      input: inputToken,
      output: outputToken,
      inputAmountWei: amountWei,
      payer: args.payer as string,
      receiver: (args.receiver || args.payer) as string,
      maxSlippage,
      aggIds: aggregators,
      displayModes,
      serializationMode: serialization,
      apiKeys: configs.apiKeys,
      integratorIds: configs.integrators,
      referrerCodes: configs.referrer,
      feesBps: configs.feesBps,
    };
    params.silent = silent;

    if (!silent) {
      console.log(
        "⏳ Fetching quotes with params:\n",
        JSON.stringify(
          params,
          (_, value) => (typeof value === "bigint" ? value.toString() : value), // Corrected BigInt check
          2,
        ),
      );
    }

    const trs = await getAllTimedTr(params);
    if (!trs?.length) handleError("No routes found");

    displayModes.forEach((mode) =>
      displayOutput(mode, trs as ITransactionRequestWithEstimate[], serialization),
    );
  } catch (e: unknown) {
    console.error(
      "❌ Error:",
      e instanceof Error ? e.message : (e as any)?.response?.data || String(e),
    );

    if (!silent) {
      // Only show args in non-silent mode for easier debugging
      console.error(
        "Args used:",
        JSON.stringify(
          args,
          (key, value) => {
            const redactedKeys = ["api-keys", "referrer-codes", "integrator-ids", "fees-bps"];
            if (redactedKeys.includes(key)) {
              return "[REDACTED]";
            }
            // Remove boolean flags like --silent=true, --help=true if they exist
            if (value === true) {
              return undefined; // Omit the key/value pair
            }
            return value; // Keep other values
          },
          2,
        ),
      );
    }
    process.exit(1);
  }
};

// Execute the CLI
runCli();

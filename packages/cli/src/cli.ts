#!/usr/bin/env node

/**
 * BTR Swap CLI tool
 *
 * Provides a command-line interface for interacting with the BTR Swap SDK.
 * Compatible with Node and Bun.
 * Allows users to fetch quotes from various DEX aggregators with simple commands.
 * Supports both same-chain and cross-chain swaps with customizable parameters.
 */

import { readFileSync } from "fs";
import {
  AggId,
  defaultAggregators,
  DisplayMode,
  getAllTimedTr,
  getToken,
  IBtrSwapCliParams,
  MAX_SLIPPAGE_BPS,
  SerializationMode,
  toJSON,
} from "@btr-supply/swap";
import {
  parseArgs,
  loadEnv,
  handleError,
  parseJson,
  applyConfig,
  parseEnumArg,
  displayOutput,
} from "./utils";
import { logPerformance } from "./log";

const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf-8"));

const HELP = `
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@
@@@@@@@@@/         '@@@@/            /@@@/         '@@@@@@@@
@@@@@@@@/    /@@@    @@@@@@/    /@@@@@@@/    /@@@    @@@@@@@
@@@@@@@/           _@@@@@@/    /@@@@@@@/    /.     _@@@@@@@@
@@@@@@/    /@@@    '@@@@@/    /@@@@@@@/    /@@    @@@@@@@@@@
@@@@@/            ,@@@@@/    /@@@@@@@/    /@@@,    @@@@@@@@@
@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@@

BTR Swap CLI v${version} - Get quotes from Swap SDK

Usage:
  swap-cli quote [options]  or  btr-swap quote [options]
  swap-cli --version        or  btr-swap --version

Options:
  --input <token>           Required. Input token details <chainId:address:symbol:decimals>
  --input-amount <amount>   Required. Amount in wei (e.g., 1000000000000000000 or 1e18)
  --output <token>          Required. Output token details <chainId:address:symbol:decimals>
  --payer <address>         Required. Payer address
  --receiver <address>      Optional. Receiver address (defaults to payer)
  --max-slippage <bps>      Max slippage in bps (default: ${MAX_SLIPPAGE_BPS})
  --aggregators <ids>       Comma-separated AggIds (default: ${defaultAggregators.join(",")})
  --api-keys <json>         JSON: multiple API keys, e.g. '{"${AggId.RANGO}":"key1"}'
  --referrer-codes <json>   JSON: referrer codes, e.g. '{"${AggId.RANGO}":"ref1"}'
  --integrator-ids <json>   JSON: integrator IDs, e.g. '{"${AggId.LIFI}":"id1"}'
  --fees-bps <json>         JSON: fee bps, e.g. '{"${AggId.LIFI}":20}'
  --display <modes>         Comma-separated display modes: ${Object.values(DisplayMode).join(",")}
  --serialization <mode>    Serialization mode: ${Object.values(SerializationMode).join(",")} (default: JSON)
  --env-file <path>         Load custom env file
  --log-file <path>         Optional. Path to log file for rank table (relative or absolute)
  --log-mode <mode>         Log mode: JSON,SQLITE (default: JSON)
  -v, -vv, --verbose        Verbose output (-vv for full details)
  --version                 Show version and exit
  -h, --help                Show this help message

Example:
  btr-swap quote \\
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

const runCli = async () => {
  const args = parseArgs(process.argv.slice(2));
  const verbose = typeof args.verbose === "number" ? args.verbose : args.verbose ? 1 : 0;
  // Expose verbose level to core utils (for fetchJson logging)
  process.env.VERBOSE = verbose.toString();
  if (args.version) return console.log(`v${version}`);
  if (args.help || args._command !== "quote") return console.log(HELP);

  if (verbose >= 1) console.log("🚀 Starting BTR Swap CLI...");

  try {
    // Load environment variables from custom file or default .env
    const envPath = args.envFile as string | undefined;
    const env = loadEnv(envPath);

    if (env) {
      if (verbose >= 1) {
        const envCount = Object.keys(env).length;
        const sourcePath = envPath || ".env";
        console.log(`✅ Loaded ${envCount} variables from ${sourcePath}`);
        if (verbose >= 2) console.log(toJSON(env, 2));
      }
    } else if (envPath && verbose >= 1) {
      console.log(`⚠️ Environment file not found or empty: ${envPath}`);
    }

    // Define required arguments in camelCase format
    const required = ["input", "output", "inputAmount", "payer"];
    const missing = required.filter((k) => !args[k]);
    if (missing.length) handleError(`Missing: ${missing.join(", ")}`);

    const [inputToken, outputToken] = [args.input, args.output].map((s) => getToken(s as string));
    if (!inputToken || !outputToken) handleError("Invalid tokens");

    // Access inputAmount using camelCase key
    const amountWei = BigInt(
      Number(args.inputAmount).toLocaleString("fullwide", { useGrouping: false }),
    );

    const apiKeys = parseJson("api-keys", args);
    const referrerCodes = parseJson("referrer-codes", args);
    const integratorIds = parseJson("integrator-ids", args);
    const feesBps = parseJson("fees-bps", args);
    applyConfig(
      { apiKeys, referrer: referrerCodes, integrators: integratorIds, feesBps },
      verbose === 0,
    );

    if (verbose >= 3) console.log(`[DEBUG] Raw args.serialization: ${args.serialization}`);

    const params: IBtrSwapCliParams = {
      input: inputToken,
      output: outputToken,
      inputAmountWei: amountWei,
      payer: args.payer as string,
      receiver: (args.receiver || args.payer) as string,
      maxSlippage: args["max-slippage"]
        ? parseInt(args["max-slippage"] as string)
        : MAX_SLIPPAGE_BPS,
      aggIds: parseEnumArg(args.aggregators, AggId, defaultAggregators, true),
      displayModes: parseEnumArg(args.display, DisplayMode, [DisplayMode.ALL], true),
      serializationMode: parseEnumArg(
        args.serialization,
        SerializationMode,
        SerializationMode.JSON,
      ) as SerializationMode,
      logMode:
        (args.logMode as string)?.toUpperCase() === SerializationMode.SQLITE
          ? SerializationMode.SQLITE
          : SerializationMode.JSON,
      executable: args.executable as string | "btr-swap",
      envFile: envPath,
      logFile: args.logFile as string | undefined,
      apiKeys,
      referrerCodes,
      integratorIds,
      feesBps,
      verbose,
    };

    if (verbose >= 1) console.log("⏳ Fetching quotes with params:");
    if (verbose >= 2) {
      console.log(toJSON(params, 2));
    }
    const trs = await getAllTimedTr(params);
    if (!trs?.length) handleError("No routes found");

    params.displayModes!.forEach((m: DisplayMode) =>
      displayOutput(m, trs, params.serializationMode!),
    );

    if (params.logFile) {
      logPerformance(trs, params.logFile, params.logMode);
    }
  } catch (e) {
    console.error("❌", e instanceof Error ? e.message : String(e));
    if (verbose >= 1) console.error("Args:", toJSON(args, 2));
    process.exit(1);
  }
};

runCli();

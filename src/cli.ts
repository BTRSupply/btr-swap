#!/usr/bin/env node
/**
 * Swapper CLI tool
 *
 * Provides a command-line interface for interacting with the Swapper SDK.
 * Allows users to fetch quotes from various DEX aggregators with simple commands.
 * Supports both same-chain and cross-chain swaps with customizable parameters.
 */
import config from "@/config";
import { getTransactionRequest, getAllTransactionRequests, ISwapperParams, AggId } from "@/index";

const HELP_MESSAGE = `
Swapper CLI - Get quotes from the Swapper SDK

Usage:
  bunx swapper-cli quote [options]

Options:
  --input-chain <id>        Required. Input chain ID (e.g., 1).
  --input-token <address>     Required. Input token address (use 0xE...E for native).
  --output-token <address>    Required. Output token address (use 0xE...E for native).
  --amount-wei <amount>     Required. Amount in wei (e.g., 1000000000000000000 or 1e18).
  --payer <address>         Required. Payer address.
  --output-chain <id>       Output chain ID (for cross-chain swaps).
  --input-decimals <num>    Decimals for input token (default: 18).
  --output-decimals <num>   Decimals for output token (default: 18).
  --input-symbol <symbol>   Optional. Symbol for input token.
  --output-symbol <symbol>  Optional. Symbol for output token.
  --max-slippage <bps>      Maximum slippage tolerance in basis points (e.g., 50 for 0.5%, default: 500).
  --aggregators <ids...>    Space-separated aggregator ID(s) (e.g., ${AggId.LIFI} ${AggId.SQUID}).
                            Defaults to ${AggId.LIFI} and ${AggId.SQUID}.
  --integrator-id <name>    Optional. Default integrator ID to use for all aggregators.
  --api-keys <json>         JSON string for multiple API keys: '{"${AggId.RANGO}":"key1","${AggId.SOCKET}":"key2"}'.
  --referrer-codes <json>   JSON string for referrer codes/addresses: '{"${AggId.RANGO}":"ref1","${AggId.ONE_INCH}":123}'.
  --integrator-ids <json>   JSON string for per-aggregator integrator IDs: '{"${AggId.LIFI}":"my-app","${AggId.SQUID}":"custom-id"}'.
  --fees-bps <json>         JSON string for fee basis points: '{"${AggId.LIFI}":20,"${AggId.SOCKET}":30}'.
  --all                     Fetch quotes from all specified aggregators, not just the best.
  -h, --help                Display this help message.

Examples:
  # Same-chain ETH -> DAI on Ethereum via 1inch
  bunx swapper-cli quote \
    --input-chain 1 \
    --input-token 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE \
    --output-token 0x6B175474E89094C44Da98b954EedeAC495271d0F \
    --amount-wei 1e18 \
    --payer 0xYourAddressHere \
    --aggregators ${AggId.ONE_INCH}

  # Cross-chain ETH (Eth) -> DAI (Optimism) via LiFi & Squid (default aggregators, fetch all)
  bunx swapper-cli quote \
    --input-chain 1 \
    --input-token 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE \
    --output-chain 10 \
    --output-token 0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1 \
    --amount-wei 1e18 \
    --payer 0xYourAddressHere \
    --all

  # Specify Rango aggregator and integrator ID
  bunx swapper-cli quote \
    --input-chain 137 --input-token 0x... --output-token 0x... \
    --amount-wei 5e17 --payer 0x... \
    --aggregators ${AggId.RANGO} \
    --integrator-id MyDapp

  # Specify multiple API keys via JSON string
  bunx swapper-cli quote \
    --input-chain 1 --output-chain 10 ... \
    --aggregators ${AggId.LIFI} ${AggId.SOCKET} \
    --api-keys '{"${AggId.SOCKET}":"SOCKET_KEY","${AggId.LIFI}":"LIFI_KEY"}'
`;

/**
 * Parses command-line arguments into a key-value object.
 * Handles basic flags (--key value), boolean flags (--flag), and multi-value flags (--key val1 val2).
 * @param args - Array of command-line arguments (typically `process.argv.slice(2)`).
 * @returns An object where keys are argument names (without dashes) and values are strings, string arrays, or booleans.
 */
function parseArgs(args: string[]): { [key: string]: string | string[] | boolean } {
  const parsedArgs: { [key: string]: string | string[] | boolean } = {};
  let currentKey: string | null = null;
  const multiValueKeys = ["aggregators"]; // Keys that can have multiple space-separated values

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith("--")) {
      currentKey = arg.substring(2);
      parsedArgs[currentKey] = multiValueKeys.includes(currentKey) ? [] : true;
    } else if (arg === "-h") {
      parsedArgs["help"] = true;
      currentKey = null;
    } else if (currentKey !== null) {
      if (Array.isArray(parsedArgs[currentKey])) {
        (parsedArgs[currentKey] as string[]).push(arg);
      } else {
        parsedArgs[currentKey] = arg;
        // Keep currentKey active for multi-value keys until the next flag
        if (!multiValueKeys.includes(currentKey)) {
          currentKey = null;
        }
      }
    } else if (!parsedArgs["_command"]) {
      parsedArgs["_command"] = arg;
    }
  }
  return parsedArgs;
}

/**
 * Main function to run the Swapper CLI.
 * Parses arguments, validates input, calls the Swapper SDK, and prints the results.
 */
async function runCli() {
  const args = parseArgs(process.argv.slice(2));

  // Show help if requested or if the command isn't 'quote'
  if (args.help || args["_command"] !== "quote") {
    console.log(HELP_MESSAGE);
    process.exit(0);
  }

  // Validate required arguments
  const requiredArgs = ["input-chain", "input-token", "output-token", "amount-wei", "payer"];
  const missingArgs = requiredArgs.filter(key => !args[key]);

  if (missingArgs.length > 0) {
    console.error(`❌ Error: Missing required arguments: ${missingArgs.join(", ")}`);
    console.log(HELP_MESSAGE);
    process.exit(1);
  }

  // Construct ISwapperParams from parsed arguments
  try {
    // Parse configuration overrides
    const parseJsonConfig = (argName: string): { [key: string]: any } | undefined => {
      if (!args[argName]) return undefined;

      try {
        const parsed = JSON.parse(args[argName] as string);
        if (typeof parsed !== "object" || parsed === null) {
          throw new Error("Must be a JSON object.");
        }
        return parsed;
      } catch (e: any) {
        console.error(`❌ Error: Invalid JSON format for --${argName}: ${e.message}`);
        process.exit(1);
      }
    };

    // Parse configuration overrides
    const apiKeysOverride = parseJsonConfig("api-keys");
    const referrersOverride = parseJsonConfig("referrer-codes");
    const integratorsOverride = parseJsonConfig("integrator-ids");
    const feesBpsOverride = parseJsonConfig("fees-bps");

    // Apply configuration overrides
    if (apiKeysOverride || referrersOverride || integratorsOverride || feesBpsOverride) {
      Object.keys(config).forEach(aggId => {
        if (apiKeysOverride && apiKeysOverride[aggId]) {
          config[aggId as AggId].apiKey = apiKeysOverride[aggId];
        }
        if (referrersOverride && referrersOverride[aggId]) {
          config[aggId as AggId].referrer = referrersOverride[aggId];
        }
        if (integratorsOverride && integratorsOverride[aggId]) {
          config[aggId as AggId].integrator = integratorsOverride[aggId];
        }
        if (feesBpsOverride && feesBpsOverride[aggId] !== undefined) {
          config[aggId as AggId].feeBps = Number(feesBpsOverride[aggId]);
        }
      });
    }

    // Apply global integrator ID to all aggregators if specified
    if (args["integrator-id"]) {
      const globalIntegrator = args["integrator-id"] as string;
      Object.keys(config).forEach(aggId => {
        config[aggId as AggId].integrator = globalIntegrator;
      });
    }

    // Validate and parse amountWei, allowing scientific notation
    let amountWei: bigint;
    try {
      const numericAmount = Number(args["amount-wei"] as string);
      if (isNaN(numericAmount) || numericAmount < 0) {
        throw new Error("Amount must be a non-negative number.");
      }
      amountWei = BigInt(numericAmount.toLocaleString("fullwide", { useGrouping: false }));
    } catch (e: any) {
      console.error(`❌ Error parsing --amount-wei: ${e.message}`);
      process.exit(1);
    }

    // Determine and validate aggregators
    const requestedAggregators = args.aggregators;
    const aggregatorList: AggId[] =
      Array.isArray(requestedAggregators) && requestedAggregators.length > 0
        ? (requestedAggregators as AggId[])
        : [AggId.LIFI, AggId.SQUID];

    const validAggregatorsEnum = Object.values(AggId);
    const invalidAggregators = aggregatorList.filter(agg => !validAggregatorsEnum.includes(agg));
    if (invalidAggregators.length > 0) {
      console.error(`❌ Error: Invalid aggregator ID(s): ${invalidAggregators.join(", ")}`);
      console.error(`   Valid options are: ${validAggregatorsEnum.join(", ")}`);
      process.exit(1);
    }

    const params: ISwapperParams = {
      inputChainId: parseInt(args["input-chain"] as string, 10),
      input: args["input-token"] as string,
      output: args["output-token"] as string,
      amountWei: amountWei,
      payer: args["payer"] as string,
      outputChainId: args["output-chain"]
        ? parseInt(args["output-chain"] as string, 10)
        : undefined,
      maxSlippage: args["max-slippage"] ? parseInt(args["max-slippage"] as string, 10) : 500,
      aggregatorId: aggregatorList,
      integrator: args["integrator-id"] as string | undefined,
      inputDecimals: args["input-decimals"] ? parseInt(args["input-decimals"] as string, 10) : 18,
      outputDecimals: args["output-decimals"]
        ? parseInt(args["output-decimals"] as string, 10)
        : 18,
      inputSymbol: args["input-symbol"] as string | undefined,
      outputSymbol: args["output-symbol"] as string | undefined,
    };

    console.log(`⏳ Fetching quote(s) with parameters:`);
    console.log(
      JSON.stringify(
        params,
        (key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ),
    );
    console.log("...");

    const result = args.all
      ? await getAllTransactionRequests(params)
      : await getTransactionRequest(params);

    if (!result || (Array.isArray(result) && result.length === 0)) {
      console.error("❌ Error: No route found for the given parameters.");
      process.exit(1);
    }

    console.log(`✅ ${args.all ? "Quotes" : "Best Quote"} Found:`);
    console.log(
      JSON.stringify(
        result,
        (key, value) => (typeof value === "bigint" ? value.toString() : value),
        2,
      ),
    );
  } catch (error: any) {
    console.error("❌ An error occurred:");
    if (error.response?.data) {
      console.error("API Error:", JSON.stringify(error.response.data, null, 2));
    } else if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error("Unknown error:", error);
    }
    // Log parsed args (safe since secrets are in apiKeys object)
    console.error(
      "Parsed Arguments Used:",
      JSON.stringify(
        args,
        (key, value) =>
          ["api-keys", "referrer-codes", "integrator-ids", "fees-bps"].includes(key) && value
            ? "[REDACTED]"
            : value,
        2,
      ),
    );
    process.exit(1);
  }
}

// Execute the CLI
runCli();

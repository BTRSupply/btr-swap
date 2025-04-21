import { assert } from "chai";
import { execSync } from "child_process";
import * as fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { addresses, MAX_SLIPPAGE_BPS } from "@/core/constants";
import { getAllTimedTr } from "@/core/index";
import {
  AggId,
  DisplayMode,
  IBtrSwapCliParams,
  IBtrSwapParams,
  ICostEstimate,
  ISwapEstimate,
  IToken,
  ITransactionRequestWithEstimate,
  SerializationMode,
  TokenInfoTuple,
} from "@/core/types";
import {
  compactTr,
  getToken,
  getTrPerformanceTable,
  paramsToString,
  serialize,
  sleep,
  toJSON,
  weiToString,
} from "@/core/utils";

// Re-export sleep from @/utils
export { sleep };

// Common chain IDs to test across major networks
export const TESTED_CHAIN_IDS = [1, 10, 56, 137, 42161]; // Ethereum, Optimism, BNB Chain, Polygon, Arbitrum

// Flagship tokens for high liquidity tests
export const FLAGSHIP_TOKENS = ["USDC", "USDT", "WETH", "WBTC"];

/**
 * Retrieves the payer address for a specific chain
 * @param chainId - The blockchain network ID
 * @returns The chain's default impersonated payer address
 */
export const getPayer = (chainId: number) =>
  addresses[chainId].accounts?.impersonate as `0x${string}`;

/**
 * Retrieves token information and payer address for a specific chain
 * @param chainId - The blockchain network ID
 * @param symbols - Array of token symbols where symbols[0] is input token and symbols[1] is output token
 * @returns Object containing input token info, output token info, and payer address
 * @throws Error if token information or payer address is missing
 */
export function getChainTokensAndPayer(
  chainId: number,
  symbols: string[],
  payer?: `0x${string}`,
): {
  input: IToken;
  output: IToken;
  payer: `0x${string}`;
} {
  const inputTuple = addresses[chainId].tokens[symbols[0]];
  const outputTuple = addresses[chainId].tokens[symbols[1]];
  payer ||= getPayer(chainId);

  if (!inputTuple?.[2] || !outputTuple?.[2] || !payer) {
    throw new Error(`[${chainId}] Missing token info or payer`);
  }

  return {
    input: getToken(inputTuple, chainId),
    output: getToken(outputTuple, chainId),
    payer,
  };
}

/** Create test case with specified parameters or random values */
export const createTestCase = ({
  aggId,
  inputChainId,
  outputChainId,
  inputToken,
  outputToken,
  amountWei,
  onlyFlagship = false,
  isCrossChain = false,
}: {
  aggId?: AggId;
  inputChainId?: number;
  outputChainId?: number;
  inputToken?: string;
  outputToken?: string;
  amountWei?: string | number | bigint;
  onlyFlagship?: boolean;
  isCrossChain?: boolean;
} = {}): IBtrSwapParams => {
  const availableChainIds = TESTED_CHAIN_IDS.filter((id) => addresses[id]?.accounts?.impersonate);
  if (!availableChainIds.length) throw new Error("No chains with impersonate accounts available");

  const getRandomChainId = (exclude?: number) => {
    const candidates = availableChainIds.filter((id) => id !== exclude);
    const pool = candidates.length ? candidates : availableChainIds;
    return (
      pool[Math.floor(Math.random() * pool.length)] ||
      (() => {
        throw new Error("No chain IDs available");
      })()
    );
  };

  const inChain = inputChainId ?? getRandomChainId();
  const outChain = outputChainId ?? (isCrossChain ? getRandomChainId(inChain) : inChain);
  [inChain, outChain].forEach((chain) => {
    if (!addresses[chain]) throw new Error(`No address data for chain ${chain}`);
  });

  const getSymbols = (chain: number, flagship = false, exclude?: string) => {
    const tokens = Object.keys(addresses[chain].tokens || {});
    let symbols = flagship
      ? tokens.filter((t) => FLAGSHIP_TOKENS.some((ft) => t.includes(ft)))
      : tokens;
    if (flagship && !symbols.length) symbols = tokens; // Fallback to all tokens if no flagship
    symbols = exclude ? symbols.filter((s) => s !== exclude) : symbols;
    if (!symbols.length)
      throw new Error(
        `No ${flagship ? "flagship " : ""}tokens${exclude ? ` excluding ${exclude}` : ""} found for chain ${chain}`,
      );
    return symbols;
  };

  const input = getToken(
    inputToken ??
      getSymbols(inChain, onlyFlagship)[
        (Math.random() * getSymbols(inChain, onlyFlagship).length) | 0
      ],
    inChain,
  );
  const excludeOut = inChain === outChain ? input.symbol : undefined;
  const output = getToken(
    outputToken ??
      getSymbols(outChain, onlyFlagship, excludeOut)[
        (Math.random() * getSymbols(outChain, onlyFlagship, excludeOut).length) | 0
      ],
    outChain,
  );

  const amount =
    amountWei ??
    (() => {
      const { decimals } = input;
      let val = Math.random() * 2e4 + 10;
      if (["BTC", "ETH"].some((c) => input.symbol?.toUpperCase().includes(c))) val /= 4e4;
      const exp = Math.max(decimals - 8, 3);
      const scaled = BigInt(Math.round(val * 10 ** exp));
      return weiToString(scaled * 10n ** BigInt(decimals - exp));
    })();

  const payer = getPayer(inChain);

  return {
    input,
    output,
    inputAmountWei: String(amount),
    payer,
    receiver: payer,
    maxSlippage: MAX_SLIPPAGE_BPS,
    integrator: "test-suite",
    aggIds: aggId ? [aggId] : undefined,
  };
};

/**
 * Generate multiple test cases based on configuration
 */
export const generateTestCases = async (
  options: {
    aggId?: AggId;
    count?: number;
    onlyFlagship?: boolean;
    isCrossChain?: boolean;
  } = {},
): Promise<IBtrSwapParams[]> => {
  const count = options.count || 2;
  const cases: IBtrSwapParams[] = [];

  for (let i = 0; i < count; i++) {
    try {
      const testCase = createTestCase({
        aggId: options.aggId,
        onlyFlagship: options.onlyFlagship,
        isCrossChain: options.isCrossChain,
      });
      cases.push(testCase);
      console.log(`Fuzz #${i}: ${paramsToString(testCase)}`);
    } catch (error: any) {
      console.error(`Error creating test case #${i}: ${error.message}`);
    }
  }

  return cases;
};

/**
 * Generate test cases for common testing scenarios
 */
export const generateFuzzCategories = async (
  aggId?: AggId,
  count = 2,
): Promise<{
  flagshipMonochain: IBtrSwapParams[];
  anyMonochain: IBtrSwapParams[];
  flagshipCrosschain: IBtrSwapParams[];
  anyCrosschain: IBtrSwapParams[];
}> => {
  return {
    flagshipMonochain: await generateTestCases({
      aggId,
      count,
      onlyFlagship: true,
      isCrossChain: false,
    }),
    anyMonochain: await generateTestCases({
      aggId,
      count,
      onlyFlagship: false,
      isCrossChain: false,
    }),
    flagshipCrosschain: await generateTestCases({
      aggId,
      count,
      onlyFlagship: true,
      isCrossChain: true,
    }),
    anyCrosschain: await generateTestCases({
      aggId,
      count,
      onlyFlagship: false,
      isCrossChain: true,
    }),
  };
};

/**
 * Validates that a transaction request contains valid estimates, etc.
 */
export function isTrValid(tr: ITransactionRequestWithEstimate): boolean {
  return (
    !!tr &&
    !!tr.to &&
    !!tr.steps?.length &&
    !!tr.steps[0].estimates &&
    !!tr.steps[0].estimates.output &&
    !!tr.steps[0].estimates.outputWei &&
    !!tr.steps[0].estimates.exchangeRate &&
    !!tr.globalEstimates
  );
}

export function assertNonNullEstimatesOutput(estimates: ISwapEstimate & ICostEstimate) {
  assert(
    Number(estimates.output) > 0 &&
      BigInt(estimates.outputWei!) > 0n &&
      Number(estimates.exchangeRate) > 0,
    "Should have non-null output and outputWei",
  );
}

/**
 * Assert that a transaction request matches the expected structure and has valid estimates
 */
export function assertTr(tr: ITransactionRequestWithEstimate | undefined, log = true) {
  // Validate transaction request structure
  assert(tr?.to && tr.data, "Transaction request should have 'to' and 'data'");
  assert(tr.from === tr.params.payer, "Transaction 'from' should match payer");
  assert(tr.globalEstimates, "Should have global estimates");
  assertNonNullEstimatesOutput(tr.globalEstimates!);
  assert(tr.steps?.[0]?.estimates, "Should have at least one step with estimates");
  assertNonNullEstimatesOutput(tr.steps[0]!.estimates!);

  // Log transaction details if requested
  if (log) {
    console.log(`>>>rfq ${paramsToString(tr.params)}`);
    console.log(`<<<res\n${getTrPerformanceTable([tr])}`);
  }
}

/**
 * Common test runner for swap tests
 */
export async function runSwapTests(
  testCases: IBtrSwapParams[],
  testType: string,
  throttleDelayMs = 3000,
  validateResult = true,
): Promise<void> {
  // Process one test case at a time to ensure proper throttling
  for (const [i, testCase] of testCases.entries()) {
    if (i > 0) await sleep(throttleDelayMs);
    const testInfo = paramsToString(testCase);
    console.log(`${testType}: ${testInfo}`);

    try {
      const allTrs = await getAllTimedTr(testCase);
      if (!allTrs?.length) {
        throw new Error(`❌ ${testInfo}: No transaction requests found`);
      }

      console.log(`>>> Performance table:\n${getTrPerformanceTable(allTrs)}`);
      console.log(`>>> Best quote JSON:\n${toJSON(allTrs[0]!)}`);
      console.log(
        `>>> Best quote compact:\n${serialize(compactTr(allTrs[0]!), { mode: SerializationMode.CSV, includeHeaders: false })}`,
      );

      if (validateResult) assertTr(allTrs[0], false);
      console.log(`✅ ${testInfo}`);
    } catch (error) {
      console.error(`❌ ${testInfo}:`, error);
      throw error;
    }
  }
}

/**
 * Format a token for CLI usage in the format: chainId:address:symbol:decimals
 * @param chainId The chain ID
 * @param token The token symbol to lookup in constants
 * @returns Formatted token string for CLI
 */
export const formatCliToken = (t: IToken | TokenInfoTuple | string, chainId = 1): string => {
  if (typeof t === "string" || Array.isArray(t)) t = getToken(t, chainId);
  if (!t) throw new Error(`[formatCliToken] Token not found: ${t}`);
  return `${t.chainId}:${t.address}:${t.symbol}:${t.decimals || 18}`;
};

/** Build CLI command string from options */
export const buildCliCommand = (p: IBtrSwapCliParams): string => {
  const {
    executable = "swap-cli",
    maxSlippage = MAX_SLIPPAGE_BPS,
    displayModes = [DisplayMode.RANK, DisplayMode.BEST_COMPACT],
    serializationMode = SerializationMode.JSON,
  } = p;

  const v = p.verbose ?? 0;
  const flags = [
    p.apiKeys && `--api-keys ${JSON.stringify(p.apiKeys)}`,
    p.referrerCodes && `--referrer-codes ${JSON.stringify(p.referrerCodes)}`,
    p.integratorIds && `--integrator-ids ${JSON.stringify(p.integratorIds)}`,
    p.feesBps && `--fees-bps ${JSON.stringify(p.feesBps)}`,
    v === 1 && "-v",
    v >= 2 && "-vv",
  ]
    .filter(Boolean)
    .join(" ");

  return `${executable} quote \
--input ${formatCliToken(p.input)} --output ${formatCliToken(p.output)} \
--input-amount ${p.inputAmountWei} --payer ${p.payer} --max-slippage ${maxSlippage} \
--aggregators ${p.aggIds?.join(",")} --display-modes ${displayModes.join(",")} \
--serialization ${serializationMode.toUpperCase()}${flags ? " " + flags : ""}`;
};

/**
 * Get CLI executable path
 * @returns Path to the CLI executable
 */
export function getCliExecutable(): string {
  // Detect available runtime (bun or node)
  const detectRuntime = (): string => {
    for (const runtime of ["bun", "node"]) {
      try {
        execSync(`command -v ${runtime}`, { stdio: "ignore" });
        return runtime;
      } catch {}
    }
    throw new Error("Missing runtime: bun or node");
  };

  // Get path to package root directory
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const packageRoot = path.resolve(__dirname, "..");
    const { bin } = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"));
    const fullPath = path.join(packageRoot, bin?.["swap-cli"] ?? "./dist/cli/cli.js");

    if (!fs.existsSync(fullPath)) {
      console.warn(`CLI executable not found at ${fullPath} - run 'bun run build'`);
      return "swap-cli";
    }

    return `${detectRuntime()} ${path.relative(process.cwd(), fullPath)}`;
  } catch (error: any) {
    console.warn(`CLI executable warning: ${error.message}`);
    return "swap-cli";
  }
}

/**
 * Run CLI command and validate output
 * @param params CLI parameters
 * @param options Test options
 * @returns CLI output
 */
export function runCliCommand(
  params: IBtrSwapCliParams,
  options: { validateWith?: string[] } = {},
): string {
  const command = buildCliCommand(params);
  console.log("Running command:", command);

  try {
    const output = execSync(command, {
      stdio: "pipe", // Capture stdout/stderr
      maxBuffer: 1024 * 1024 * 10, // 10MB buffer
      timeout: 60000, // 60 second timeout
    }).toString();

    if (options.validateWith?.length) {
      assert(
        options.validateWith.some((t) => output.includes(t)),
        `Missing expected output: ${options.validateWith.join(" or ")}`,
      );
    }

    // Check logging based on verbose level from params
    const verboseLevel = params.verbose ?? 0;
    if (verboseLevel === 0) {
      assert(
        !output.includes("⏳ Fetching quotes") && !output.includes("✅ Loaded"),
        "Verbose=0 should hide progress messages",
      );
    } else if (verboseLevel >= 2) {
      assert(output.includes("⏳ Fetching quotes"), "Verbose>=2 should show progress messages");
      // Check for loaded env message only if envFile is explicitly set
      if (params.envFile) {
        assert(
          output.includes("✅ Loaded"),
          `Verbose>=2 with envFile should show loaded message (envFile: ${params.envFile})`,
        );
      }
    }

    return output;
  } catch (error: any) {
    // Log stdout/stderr on error before re-throwing
    console.error("Command execution failed:");
    if (error.stdout) {
      console.error("--- STDOUT ---");
      console.error(error.stdout.toString());
      console.error("--- END STDOUT ---");
    }
    if (error.stderr) {
      console.error("--- STDERR ---");
      console.error(error.stderr.toString());
      console.error("--- END STDERR ---");
    }
    console.error("Error object:", error);
    throw error; // Re-throw the original error
  }
}

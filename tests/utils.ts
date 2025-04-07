import { assert } from "chai";

import { addresses, MAX_SLIPPAGE_BPS } from "@/constants";
import { getTransactionRequest } from "@/index";
import { AggId, ISwapperParams, ITransactionRequestWithEstimate, TokenInfoTuple } from "@/types";
import { swapperParamsToString, transactionRequestToString, weiToString } from "@/utils";

// Common chain IDs to test across major networks
export const KNOWN_CHAIN_IDS = [1, 10, 56, 137, 42161]; // Ethereum, Optimism, BNB Chain, Polygon, Arbitrum

// Flagship tokens for high liquidity tests
export const FLAGSHIP_TOKENS = ["USDC", "USDT", "WETH", "WBTC"];
/**
 * Retrieves token information and payer address for a specific chain
 *
 * @param chainId - The blockchain network ID
 * @param symbols - Array of token symbols where symbols[0] is input token and symbols[1] is output token
 * @returns Object containing input token info, output token info, and payer address
 * @throws Error if token information or payer address is missing
 */
export function getChainTokensAndPayer(chainId: number, symbols: string[]) {
  const input = addresses[chainId].tokens[symbols[0]];
  const output = addresses[chainId].tokens[symbols[1]];
  const payer = addresses[chainId].accounts!.impersonate as `0x${string}`;
  if (!input?.[2] || !output?.[2] || !payer) {
    throw new Error(`[${chainId}] Missing token info or payer`);
  }
  return { input, output, payer };
}

/**
 * Validates a transaction request against the original swap parameters
 * and logs detailed information about the transaction
 *
 * @param params - The original swap parameters used to generate the transaction
 * @param tr - The transaction request with estimates to validate
 * @throws AssertionError if any validation check fails
 */
export function assertTr(params: ISwapperParams, tr: ITransactionRequestWithEstimate) {
  // Validate transaction request
  assert(tr?.to && tr.data, "Transaction request should have 'to' and 'data'");
  assert.equal(tr.from, params.payer, "Transaction 'from' should match payer");

  // Validate estimates
  assert(
    tr.estimatedOutput && tr.estimatedOutputWei && tr.estimatedExchangeRate,
    "Should have output estimates",
  );

  // Print transaction details using our formatter
  console.log(`>>>rfq ${swapperParamsToString(params)}`);
  console.log(`<<<res ${transactionRequestToString(tr)}`);

  // Validate gas estimates
  assert(tr.gasEstimate, "Should have gas estimate");
}

/**
 * Creates a test case with the specified parameters or random values
 */
export const createTestCase = (
  options: {
    aggId?: AggId;
    inputChainId?: number;
    outputChainId?: number;
    inputToken?: string;
    outputToken?: string;
    amountWei?: string | number | bigint;
    onlyFlagship?: boolean;
    isCrossChain?: boolean;
  } = {},
): ISwapperParams => {
  // Set defaults
  const chainIds = KNOWN_CHAIN_IDS.filter(id => addresses[id]?.accounts?.impersonate);
  if (chainIds.length === 0) throw new Error("No chains with impersonate accounts available");

  // Determine input chain
  const inputChainId =
    options.inputChainId || chainIds[Math.floor(Math.random() * chainIds.length)];
  if (!addresses[inputChainId]) throw new Error(`No data for chain ${inputChainId}`);

  // Determine output chain
  let outputChainId = options.outputChainId;
  if (!outputChainId) {
    if (options.isCrossChain) {
      const otherChains = chainIds.filter(id => id !== inputChainId);
      outputChainId =
        otherChains.length > 0
          ? otherChains[Math.floor(Math.random() * otherChains.length)]
          : inputChainId;
    } else {
      outputChainId = inputChainId;
    }
  }

  // Get available tokens
  const getAvailableTokens = (chainId: number, onlyFlagship = false) => {
    const tokenNames = Object.keys(addresses[chainId].tokens || {});
    if (onlyFlagship) {
      const flagshipNames = tokenNames.filter(
        name => FLAGSHIP_TOKENS.includes(name) || FLAGSHIP_TOKENS.some(t => name.includes(t)),
      );
      return flagshipNames.length > 0 ? flagshipNames : tokenNames;
    }
    return tokenNames;
  };

  // Select input token
  const inputTokens = getAvailableTokens(inputChainId, options.onlyFlagship);
  if (inputTokens.length === 0) throw new Error(`No tokens found for chain ${inputChainId}`);
  const inputTokenName =
    options.inputToken || inputTokens[Math.floor(Math.random() * inputTokens.length)];
  const inputTokenInfo = addresses[inputChainId].tokens[inputTokenName] as TokenInfoTuple;
  if (!inputTokenInfo)
    throw new Error(`Token ${inputTokenName} not found on chain ${inputChainId}`);

  // Select output token
  const outputTokens = getAvailableTokens(outputChainId, options.onlyFlagship);
  if (outputTokens.length === 0) throw new Error(`No tokens found for chain ${outputChainId}`);
  let outputTokenName;
  do {
    outputTokenName =
      options.outputToken || outputTokens[Math.floor(Math.random() * outputTokens.length)];
  } while (inputChainId === outputChainId && inputTokenName === outputTokenName);
  const outputTokenInfo = addresses[outputChainId].tokens[outputTokenName] as TokenInfoTuple;
  if (!outputTokenInfo)
    throw new Error(`Token ${outputTokenName} not found on chain ${outputChainId}`);

  // Determine amount
  let amountWei = options.amountWei;
  if (!amountWei) {
    const inputDecimals = inputTokenInfo[2] || 18;
    let amount = Math.round(Math.random() * 20_000_000) / 1_000 + 10;

    // Reduce amount for high value tokens
    if (["BTC", "ETH"].some(s => inputTokenInfo[1]?.toUpperCase().includes(s))) {
      amount /= 40000;
    }

    // Calculate amountWei with proper decimal scaling
    const roundExp = Math.max(inputDecimals - 8, 3);
    amountWei = weiToString(
      BigInt(Math.round(amount * 10 ** roundExp)) * BigInt(10 ** (inputDecimals - roundExp)),
    );
  }

  return {
    aggregatorId: options.aggId,
    inputChainId,
    outputChainId,
    input: inputTokenInfo[0],
    inputSymbol: inputTokenInfo[1] || "",
    inputDecimals: inputTokenInfo[2] || 18,
    output: outputTokenInfo[0],
    outputSymbol: outputTokenInfo[1] || "",
    outputDecimals: outputTokenInfo[2] || 18,
    amountWei,
    payer: addresses[inputChainId].accounts?.impersonate || "",
    testPayer: addresses[inputChainId].accounts?.impersonate,
    maxSlippage: MAX_SLIPPAGE_BPS,
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
): Promise<ISwapperParams[]> => {
  const count = options.count || 2;
  const cases: ISwapperParams[] = [];

  for (let i = 0; i < count; i++) {
    try {
      const testCase = createTestCase({
        aggId: options.aggId,
        onlyFlagship: options.onlyFlagship,
        isCrossChain: options.isCrossChain,
      });
      cases.push(testCase);
      console.log(`Fuzz #${i}: ${swapperParamsToString(testCase)}`);
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
  flagshipMonochain: ISwapperParams[];
  anyMonochain: ISwapperParams[];
  flagshipCrosschain: ISwapperParams[];
  anyCrosschain: ISwapperParams[];
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
 * Get transaction requests for a set of test cases
 */
export const getTransactionRequestForCases = async (
  cases: ISwapperParams[],
): Promise<(ITransactionRequestWithEstimate | undefined)[]> => {
  const results: (ITransactionRequestWithEstimate | undefined)[] = [];
  for (const params of cases) {
    const tr = await getTransactionRequest(params);
    console.log(swapperParamsToString(params));
    console.log(tr ? `  → ${transactionRequestToString(tr)}` : "  → No quote available");
    results.push(tr);
  }
  return results;
};

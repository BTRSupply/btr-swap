import { assertTr, getChainTokensAndPayer } from "tests/utils";

import { MAX_SLIPPAGE_BPS } from "@/constants";
import { aggregatorById } from "@/index";
import { AggId, ISwapperParams } from "@/types";
import { sleep } from "@/utils";

// This function now prepares and returns the actual test function
export const simpleMonoTests = (
  aggId: AggId,
  chainIds: number[],
  tokens: string[],
  amounts: number[],
) => {
  const aggregator = aggregatorById[aggId];

  // Return the async function that contains the test logic
  return async function () {
    for (const chainId of chainIds) {
      for (const amount of amounts) {
        console.log(`Swapping ${amount} ${tokens[0]} to ${tokens[1]} on chain id ${chainId}...`);
        await sleep(2000); // 2 second throttle between API calls
        const { input, output, payer } = getChainTokensAndPayer(chainId, tokens);

        // Test parameters
        const params: ISwapperParams = {
          inputChainId: chainId,
          input: input[0],
          inputSymbol: input[1]!,
          inputDecimals: input[2]!,
          outputChainId: chainId,
          output: output[0],
          outputSymbol: output[1]!,
          outputDecimals: output[2]!,
          amountWei: amount * 10 ** input[2]!,
          aggregatorId: aggregator.id,
          payer,
          receiver: payer,
          maxSlippage: MAX_SLIPPAGE_BPS,
          integrator: aggregator.integrator,
        };
        // Call the aggregator
        const tr = await aggregator.getTransactionRequest(params);
        assertTr(params, tr!);
      }
    }
  };
};

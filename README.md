<div align="center">
  <img border-radius="25px" max-height="250px" src="./swapper.png" />
  <h1>Swapper</h1>
  <p>
    <strong>by <a href="https://astrolab.fi">Astrolab<a></strong>
  </p>
  <p>
    <!-- <a href="https://github.com/AstrolabFinance/swapper/actions"><img alt="Build Status" src="https://github.com/AstrolabFinance/swapper/actions/workflows/tests.yaml/badge.svg" /></a> -->
    <a href="https://opensource.org/licenses/MIT"><img alt="License" src="https://img.shields.io/github/license/AstrolabFinance/swapper?color=3AB2FF" /></a>
    <a href="https://discord.gg/PtAkTCwueu"><img alt="Discord Chat" src="https://img.shields.io/discord/984518964371673140"/></a>
    <a href="https://docs.astrolab.fi"><img alt="Astrolab Docs" src="https://img.shields.io/badge/astrolab_docs-F9C3B3" /></a>
  </p>
</div>

Swapper is Astrolab's liquidity meta-aggregator, powering all of its monochain and cross-chain swaps.
It blends liquidity and bridge aggregators.
The DEX meta-aggregation was inspired by [LlamaSwap](https://swap.defillama.com/)'s work [available here](https://github.com/LlamaSwap/), supercharged with cross-chain capacity.

## ⚠️ Disclaimer
Astrolab DAO and its core team members will not be held accountable for losses related to the deployment and use of this repository's codebase.
As per the [licence](./LICENCE) states, the code is provided as-is and is under active development. The codebase, documentation, and other aspects of the project may be subject to changes and improvements over time.

## Aggregator Types

The Swapper SDK interacts with different types of swap protocols:

1. **Meta-Aggregators (cross-chain capable):** These protocols aggregate *other* aggregators and bridges, providing a higher-level abstraction for cross-chain swaps by finding multi-step routes.

2. **Passive Liquidity Aggregators:** These aggregators query on-chain DEX liquidity pools (like Uniswap, Curve) and route swaps through them to find the best price.

3. **JIT / Intent-Based / RFQ:** These protocols use off-chain mechanisms like auctions, RFQ (Request for Quote), or solvers to match trades. They often offer MEV protection and gasless swaps but require specific handling (like off-chain signatures - EIP-712/1271).

## Supported Aggregators
Don't hesitate to reach out or submit pull requests with missing aggregators adapters.

### Meta-Aggregators (cross-chain capable)
- [Li.Fi](https://li.fi/) `stable` `tested`
- [Squid Router](https://www.squidrouter.com/) `stable` `tested`
- [Socket](https://socket.tech/) `stable` `tested`
- [Rango](https://rango.exchange/) `stable` `tested`
- [Unizen](https://unizen.io/) `stable` `tested`
- [RocketX](https://www.rocketx.exchange/) `planned`

### Passive Liquidity Aggregators
- [1inch](https://1inch.io/) `stable` `tested`
- [0x](https://0x.org/) `stable` `tested`
- [ParaSwap](https://www.paraswap.io/) `stable` `tested`
- [Odos](https://odos.xyz/) `stable` `tested`
- [KyberSwap](https://kyberswap.com/) `stable` `tested`
- [OpenOcean](https://openocean.finance/) `stable` `tested`
- [Firebird](https://firebird.finance/) `stable` `tested`
- [Bebop](https://bebop.xyz/) `planned` `disabled`

### JIT / Intent-Based / RFQ
> These protocols often offer MEV protection and gasless swaps but require specific handling (like off-chain signatures) which requires special implementations.

- [CowSwap](https://swap.cow.fi/) `planned`
- [Hashflow](https://www.hashflow.com/) `planned`
- [1inch Fusion](https://fusion.1inch.io/) `planned`
- [ParaSwap Delta](https://www.paraswap.io/) `planned`
- [DeBridge](https://debridge.finance/) `planned`
- [AirSwap](https://www.airswap.io/) `disabled`

## Features

### Swapper SDK

[![NPM Version](https://img.shields.io/npm/v/@astrolabs/swapper.svg)](https://www.npmjs.com/package/@astrolabs/swapper)
[![License](https://img.shields.io/npm/l/@astrolabs/swapper.svg)](https://github.com/AstrolabFinance/swapper/blob/main/LICENSE)

Generic Swap+Bridge aggregator SDK for EVM-compatible chains.

This SDK provides a unified interface to fetch swap quotes and transaction data from various DEX aggregators and bridges.

## Features

*   **Unified Interface:** Simplifies interaction with multiple swap protocols through a single set of functions.
*   **Aggregator Support:** Integrates with popular DEX aggregators and cross-chain protocols.
*   **Best Route Selection:** Automatically finds the best quote across supported aggregators (optional).
*   **Extensible:** Designed to easily add support for new aggregators.
*   **CLI Tool:** Includes a command-line interface for quick quotes and testing.

## Installation

```bash
npm install @astrolabs/swapper
# or
yarn add @astrolabs/swapper
# or
bun add @astrolabs/swapper
```

## Usage

### ESM Import (Recommended)

```typescript
import {
  getTransactionRequest, // Fetches the best quote across specified aggregators
  getAllTransactionRequests, // Fetches quotes from ALL specified aggregators
  AggId, // Enum for aggregator identifiers
  ISwapperParams,
  ITransactionRequestWithEstimate
} from "@astrolabs/swapper";

async function fetchSwapQuote() {
  const params: ISwapperParams = {
    inputChainId: 1, // Ethereum
    outputChainId: 10, // Optimism (for cross-chain)
    input: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // Input Token (Native ETH)
    inputDecimals: 18,
    inputSymbol: "ETH",
    output: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", // Output Token (DAI on Optimism)
    outputDecimals: 18,
    outputSymbol: "DAI",
    amountWei: BigInt("1000000000000000000"), // 1 ETH in wei (use BigInt for large numbers)
    payer: "0xYourWalletAddress", // Address initiating the swap
    // Optional parameters:
    // receiver: "0xOptionalDifferentReceiverAddress", // Defaults to payer
    maxSlippage: 50, // Max slippage in Basis Points (BPS) -> 0.5%
    aggregatorId: [AggId.LIFI, AggId.SQUID], // Specify aggregators (defaults to LiFi, Squid, Socket, Unizen, Rango if omitted)
    integrator: "YourDappName", // Your integrator/project ID
    // apiKeys: { [AggId.SOCKET]: "YOUR_SOCKET_API_KEY" } // Optional API keys if needed
  };

  try {
    // Fetch the single best quote from the specified aggregators
    const bestQuote: ITransactionRequestWithEstimate | undefined =
      await getTransactionRequest(params);

    if (bestQuote) {
      console.log("Best Quote Found:");
      console.log(JSON.stringify(bestQuote, (key, value) =>
        typeof value === 'bigint' ? value.toString() : value // Convert BigInts for JSON
      , 2));
      // Now you can use bestQuote.to, bestQuote.data, bestQuote.value etc. to send the transaction
    } else {
      console.log("No route found.");
    }

    // --- OR --- Fetch quotes from ALL specified aggregators
    // const allQuotes: ITransactionRequestWithEstimate[] =
    //   await getAllTransactionRequests(params);
    // console.log(`Found ${allQuotes.length} quotes:`, allQuotes);

  } catch (error) {
    console.error("Error fetching quote:", error);
  }
}

fetchSwapQuote();
```

### CLI Tool

A simple CLI tool is provided for quick testing and quotes.

```bash
# Install globally (optional)
# npm install -g @astrolabs/swapper

# Basic quote (defaults to LiFi, Squid, Socket, Unizen, Rango aggregators)
# bunx used here for execution without global install
bunx swapper-cli quote \
  --input-chain 1 \
  --input-token 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE \
  --output-token 0x6B175474E89094C44Da98b954EedeAC495271d0F \
  --amount-wei 1e18 \
  --payer 0xYourWalletAddress

# Specify aggregator (1inch), max slippage (0.3%), and integrator ID
bunx swapper-cli quote \
  --input-chain 1 \
  --input-token 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE \
  --output-token 0x6B175474E89094C44Da98b954EedeAC495271d0F \
  --amount-wei 1e18 \
  --payer 0xYourWalletAddress \
  --aggregators ${AggId.ONE_INCH} \
  --max-slippage 30 \
  --integrator-id MyCoolDapp

# Cross-chain quote, fetch from all specified aggregators
bunx swapper-cli quote \
  --input-chain 1 \
  --input-token 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE \
  --output-chain 10 \
  --output-token 0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1 \
  --amount-wei 1e18 \
  --payer 0xYourWalletAddress \
  --aggregators ${AggId.LIFI} ${AggId.SOCKET} ${AggId.SQUID} \
  --all

# Pass API keys via JSON
bunx swapper-cli quote \
  --input-chain 1 --output-chain 10 ... \
  --aggregators ${AggId.SOCKET} \
  --apiKeys '{"${AggId.SOCKET}":"YOUR_SOCKET_KEY"}'

# Get help
bunx swapper-cli quote --help
```

## Testing Strategy

The SDK includes several layers of testing:

1.  **Unit Tests (`tests/unit`):**
    *   `aggregators.test.ts`: Contains integration tests for each *supported and testable* aggregator. These tests call `getTransactionRequest` with specific aggregator IDs and validate the structure and basic content of the returned transaction data using live API calls.
    *   `swapper.client.test.ts`: Includes basic sanity checks for the SDK client and a minimal test for the CLI tool to ensure it executes without errors for a simple command.
2.  **Utility Tests (`tests/utils`):** Contains helpers (`cases.ts`) for generating test parameters.

**NB:** Tests involving JIT/Intent-based aggregators are currently limited due to the need for off-chain signatures or specific RFQ interactions not covered by the standard `getTransactionRequest` flow.

To run tests:

```bash
# Run all unit tests
bun run test

# Run only aggregator integration tests
# (Adjust the grep pattern as needed)
bun run ts-mocha --timeout 120000 "tests/unit/aggregators.test.ts"
```

## Development

```bash
# Clone the repository
git clone https://github.com/AstrolabFinance/swapper.git
cd swapper

# Install dependencies
bun install

# Lint check
bun run lint

# Format code
bun run lint:fix

# Type check
bun run typecheck

# Run tests
bun run test

# Build the project
bun run build
```

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

[MIT](LICENSE)

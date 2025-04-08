<div align="center">
  <img border-radius="25px" max-height="250px" src="./banner.png" />
  <h1>BTR Swap</h1>
  <p>
    <strong>A powerful cross-chain swap aggregation SDK</strong>
  </p>
  <p>
    <a href="https://t.me/BTRSupply"><img alt="Telegram" src="https://img.shields.io/badge/Telegram--white?style=social&logo=telegram"></a>
    <a href="https://www.npmjs.com/package/@btr-supply/swap"><img alt="Package" src="https://img.shields.io/npm/v/@btr-supply/swap.svg"/></a>
    <a href="https://btr.supply/docs"><img alt="Docs" src="https://img.shields.io/badge/Docs-v1-green?logo=readthedocs" /></a>
    <a href="https://opensource.org/licenses/MIT"><img alt="License" src="https://img.shields.io/badge/license-MIT-green?logo=open-source-initiative" /></a>
  </p>
</div>

BTR Swap is a liquidity meta-aggregator, powering monochain and cross-chain swaps.
It blends liquidity and bridge aggregators.
The DEX meta-aggregation was inspired by [LlamaSwap](https://swap.defillama.com/)'s work [available here](https://github.com/LlamaSwap/), supercharged with cross-chain capacity.

## 🚀 Versatile Integration Options

BTR Swap offers multiple ways to integrate with your project:

- **CLI Tool**: Use the command-line interface for quick integration with any back-end system or scripts
- **TypeScript/JavaScript SDK**: Import the library in your Node.js, Bun, or Deno back-end applications
- **Browser-Compatible**: Use directly in front-end applications with no additional dependencies
- **Zero-Config**: Works out of the box with sensible defaults while remaining highly customizable

Whether you're building a DeFi dashboard, a trading bot, or integrating swap functionality into an existing application, BTR Swap provides the flexibility to fit your specific needs.

## ⚠️ Disclaimer
BTR and its core team members will not be held accountable for losses related to the deployment and use of this repository's codebase.
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

### JIT / Intent-Based / RFQ
> These protocols often offer MEV protection, gasless swaps, and access to off-chain liquidity, but require specific handling (eg. permit2 EIP-712 off-chain signatures) which requires multi-step implementation.

- [CowSwap](https://swap.cow.fi/) `planned`
- [Hashflow](https://www.hashflow.com/) `planned`
- [1inch Fusion](https://fusion.1inch.io/) `planned`
- [ParaSwap Delta](https://www.paraswap.io/) `planned`
- [Bebop](https://bebop.xyz/) `planned`
- [DeBridge](https://debridge.finance/) `planned`
- [AirSwap](https://www.airswap.io/) `disabled`

## Features

### Swapper SDK

Generic Swap+Bridge aggregator SDK for EVM-compatible chains.

This SDK provides a unified interface to fetch swap quotes and transaction data from various DEX aggregators and bridges.

## Features

*   **Unified Interface:** Simplifies interaction with multiple swap protocols through a single set of functions.
*   **Aggregator Support:** Integrates with popular DEX aggregators and cross-chain protocols.
*   **Best Route Selection:** Automatically finds the best quote across supported aggregators (optional).
*   **Extensible:** Designed to easily add support for new aggregators.
*   **Multi-Platform:** Works in Node.js, Bun, Deno back-ends and directly in browsers.
*   **Zero Dependencies:** Front-end compatible with no external runtime dependencies.
*   **CLI Tool:** Includes a command-line interface for quick quotes and testing.
*   **Type Safety:** Full TypeScript support with comprehensive type definitions.

## Installation

```bash
npm install @btr-supply/swap
# or
yarn add @btr-supply/swap
# or
bun add @btr-supply/swap
```

## Usage

BTR Swap can be used in multiple environments:

### 1. Back-end SDK (Node.js, Bun, Deno)

```typescript
import {
  getTransactionRequest,
  getAllTransactionRequests,
  AggId,
  ISwapperParams,
  ITransactionRequestWithEstimate
} from "@btr-supply/swap";

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
    maxSlippage: 50, // Max slippage in Basis Points (BPS) -> 0.5%
    aggregatorId: [AggId.LIFI, AggId.SQUID], // Specify aggregators
  };

  // Get the best quote
  const bestQuote = await getTransactionRequest(params);

  // Execute the transaction with your provider of choice
  // const txReceipt = await provider.sendTransaction(bestQuote);
}
```

### 2. Front-end Integration

```typescript
// In a browser environment (React, Vue, etc.)
import { getTransactionRequest, AggId } from "@btr-supply/swap";

// In a React component
async function handleSwap() {
  try {
    setLoading(true);

    const params = {
      inputChainId: 1,
      input: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // ETH
      output: "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
      amountWei: BigInt(amount), // Convert from user input
      payer: address, // Connected wallet address
      maxSlippage: 30, // 0.3%
    };

    const quote = await getTransactionRequest(params);

    // Send the transaction using ethers, web3.js, viem, or wagmi
    const tx = await walletClient.sendTransaction({
      to: quote.to,
      data: quote.data,
      value: quote.value,
      gas: quote.gas
    });

    // Handle transaction result
  } catch (error) {
    console.error("Swap failed:", error);
  } finally {
    setLoading(false);
  }
}
```

### 3. CLI Tool Usage

The package includes a CLI tool for quick testing and integration in scripts or automation workflows:

```bash
# Install globally
npm install -g @btr-supply/swap

# Basic usage (defaults to all supported meta-aggregators)
btr-swap-cli quote \
  --input-chain 1 \
  --input-token 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE \
  --output-token 0x6B175474E89094C44Da98b954EedeAC495271d0F \
  --amount-wei 1e18 \
  --payer 0xYourWalletAddress

# Cross-chain quote with specific aggregators
btr-swap-cli quote \
  --input-chain 1 \
  --input-token 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE \
  --output-chain 10 \
  --output-token 0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1 \
  --amount-wei 1e18 \
  --payer 0xYourWalletAddress \
  --aggregators LIFI SOCKET SQUID \
  --all

# Shell integration example
QUOTE=$(btr-swap-cli quote --input-chain 1 --output-chain 10 --input-token ETH --output-token DAI --amount-wei 1e18 --payer $WALLET_ADDRESS --json)
TX_DATA=$(echo $QUOTE | jq -r '.data')
TX_TO=$(echo $QUOTE | jq -r '.to')

# Pass API keys via environment variables or JSON
export SOCKET_API_KEY="your-socket-key"
export LIFI_API_KEY="your-lifi-key"
btr-swap-cli quote --input-chain 1 --output-chain 10 ...

# Get help
btr-swap-cli quote --help
```

You can use the CLI tool in CI/CD pipelines, automated trading systems, or for quick manual testing.

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
git clone https://github.com/BTRSupply/btr-swap.git
cd btr-swap

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

## About

BTR Swap includes several enhancements and features:

- Unified interface for DEX and cross-chain aggregation
- Advanced API keys management
- Enhanced error handling
- Comprehensive aggregator support
- Performance optimizations
- BTR-specific configurations and integrations

Based on the [AstrolabDAO/swapper](https://github.com/AstrolabDAO/swapper) codebase, we maintain compatibility while adding features to support BTR Supply's specific requirements. We periodically sync with the upstream repository to incorporate beneficial changes and fixes.

## Contributing

Contributions are welcome! Feel free to open an issue or create a pull request if you have any improvements or suggestions.

## License

[MIT](LICENSE)

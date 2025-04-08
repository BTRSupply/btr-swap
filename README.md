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

BTR Swap is a liquidity meta-aggregator powering monochain and cross-chain swaps, blending liquidity and bridge aggregators. Inspired by [LlamaSwap](https://github.com/LlamaSwap/), server-side friendly and cross-chain capable.

[ESM compliant](https://nodejs.org/api/esm.html), feather light, BTR Swap can be embedded in any front-end or back-end application, either as:
- **CLI**: Quick integration with any existing back-end or scripts
- **SDK**: For Node.js, Bun, Deno back-ends and browser front-ends, whether your app uses [Ethers](https://docs.ethers.org/) or [Viem](https://viem.sh/)

## ⚠️ Disclaimer

This aggregator is under active development and not a commercial product.
BTR and its team members are not liable for any losses from using this codebase. The code is provided as-is and underlying APIs may change.

We welcome issues for bugs or feature requests, and pull requests to improve the package.

## Features

* **Unified Interface:** Single API for monochain and cross-chain swaps
* **Any Chain, Any Token:** Aggregates liquidity and bridges for token swaps across any supported chains and tokens
* **Best Route Selection:** Finds optimal quotes across multiple aggregators
* **Zero Dependencies:** Lightweight implementation for any environment
* **Type Safety:** Comprehensive TypeScript support
* **Multi-Platform:** Works in Node.js, Bun, Deno and browsers

## Supported Aggregators

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
> Offer MEV protection, gasless swaps, and off-chain liquidity with specific handling requirements

- [CowSwap](https://swap.cow.fi/) `planned`
- [Hashflow](https://www.hashflow.com/) `planned`
- [1inch Fusion](https://fusion.1inch.io/) `planned`
- [ParaSwap Delta](https://www.paraswap.io/) `planned`
- [Bebop](https://bebop.xyz/) `planned`
- [DeBridge](https://debridge.finance/) `planned`
- [AirSwap](https://www.airswap.io/) `disabled`

## Installation

```bash
npm/yarn/bun add @btr-supply/swap
```

## Usage

### Back-end SDK (Node.js, Bun, Deno)

```typescript
import { getTransactionRequest, AggId } from "@btr-supply/swap";

async function fetchSwapQuote() {
  const params = {
    inputChainId: 1, // Ethereum
    outputChainId: 10, // Optimism (for cross-chain)
    input: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // ETH
    output: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1", // DAI
    amountWei: BigInt("1000000000000000000"), // 1 ETH
    payer: "0xYourWalletAddress",
    maxSlippage: 50, // 0.5%
  };

  const quote = await getTransactionRequest(params);
  // Use quote with your provider: provider.sendTransaction(quote);
}
```

### Front-end Integration

```typescript
import { getTransactionRequest } from "@btr-supply/swap";

// In a React component
async function handleSwap() {
  try {
    setLoading(true);

    const params = {
      inputChainId: 1,
      input: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // ETH
      output: "0x6B175474E89094C44Da98b954EedeAC495271d0F", // DAI
      amountWei: BigInt(amount),
      payer: address,
      maxSlippage: 30, // 0.3%
    };

    const quote = await getTransactionRequest(params);

    // Send via ethers, web3.js, viem, or wagmi
    const tx = await walletClient.sendTransaction(quote);
  } catch (error) {
    console.error("Swap failed:", error);
  } finally {
    setLoading(false);
  }
}
```

### CLI Tool Usage

```bash
# Install globally
npm install -g @btr-supply/swap

# Basic usage
btr-swap-cli quote \
  --input-chain 1 \
  --input-token 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE \
  --output-token 0x6B175474E89094C44Da98b954EedeAC495271d0F \
  --amount-wei 1e18 \
  --payer 0xYourWalletAddress

# Shell integration
QUOTE=$(btr-swap-cli quote --input-chain 1 --output-chain 10 --input-token ETH --output-token DAI --amount-wei 1e18 --payer $WALLET_ADDRESS --json)
TX_DATA=$(echo $QUOTE | jq -r '.data')

# Help
btr-swap-cli quote --help
```

## Development & Testing

```bash
# Clone and setup
git clone https://github.com/BTRSupply/btr-swap.git && cd btr-swap
bun install

# Development tasks
bun run lint       # Check code style
bun run lint:fix   # Fix code style
bun run typecheck  # Verify types
bun run test       # Run all tests
bun run build      # Build the package
```

## About

BTR Swap enhances the [AstrolabDAO/swapper](https://github.com/AstrolabDAO/swapper) codebase with:

- Unified DEX and cross-chain aggregation
- Advanced API keys management
- Optimized performance
- Enhanced error handling
- Extended aggregator support

## License

[MIT](LICENSE)

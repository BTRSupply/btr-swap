import { simpleMonoTests } from "./base.test";

import { AggId } from "@/types";

const aggId = AggId.UNIZEN;
const chainIds = [1, 10, 56, 8453, 42161];
const amountsUSDC = [10, 100, 1000, 10000, 100000];
const amountsWETH = [0.01, 0.1, 1, 10, 100];

describe("Simple Monochain Tests: Stable Swaps", () => {
  it("USDC -> USDT", simpleMonoTests(aggId, chainIds, ["USDC", "USDT"], amountsUSDC));
});

describe("Simple Monochain Tests: Stable/Volatile Swaps", () => {
  it("USDC -> WETH", simpleMonoTests(aggId, chainIds, ["USDC", "WETH"], amountsUSDC));
});

describe("Simple Monochain Tests: Volatile Swaps", () => {
  it("WETH -> WBTC", simpleMonoTests(aggId, chainIds, ["WETH", "WBTC"], amountsWETH));
});

import { execSync } from "child_process"; // Needed to run CLI command
import path from "path";
import { fileURLToPath } from "url";

import { expect } from "chai";
import { assert } from "chai";
import * as dotenv from "dotenv";

dotenv.config({ override: true });

// Convert ESM __dirname equivalent
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const packageRoot = path.resolve(__dirname, "../..");
const CLI_PATH = path.join(packageRoot, "dist/cli/cli.js");

import { lifiAggregator } from "../../src/LiFi";
import { squidAggregator } from "../../src/Squid";
import { ISwapperParams, AggId } from "../../src/types";
import { getTransactionRequestForCases, generateFuzzCategories } from "../utils";

const swapperParams: ISwapperParams = {
  // op:usdc -> arb:dai
  inputChainId: 10,
  input: "0x7F5c764cBc14f9669B88837ca1490cCa17c31607",
  outputChainId: 42161,
  output: "0xDA10009cBd5D07dd0CeCc66161FC93D7c9000da1",
  amountWei: "1000000000",
  payer: "0x489ee077994B6658eAfA855C308275EAd8097C4A",
  maxSlippage: 100,
  inputDecimals: 6, // USDC has 6 decimals
  outputDecimals: 18, // DAI has 18 decimals
  inputSymbol: "USDC",
  outputSymbol: "DAI",
};

// Helper function to generate test cases for one aggregator
async function getAggregatorTestCases(aggId: AggId): Promise<ISwapperParams[]> {
  // Generate a single test case for this aggregator
  const testCases = await generateFuzzCategories(aggId, 1);
  return [...testCases.flagshipMonochain];
}

describe("swapper.client.test", function () {
  this.beforeAll(async function () {
    console.log(`env: ${JSON.stringify(process.env)}`);
  });

  this.beforeEach(async function () {
    console.log("beforeEach");
  });

  describe("Get Quote", function () {
    it("Squid", async function () {
      const cases = await getAggregatorTestCases(AggId.SQUID);
      const results = await getTransactionRequestForCases(cases);
      for (const tr of results) {
        assert(tr?.data, "Transaction should have data");
      }
    });

    it("Li.Fi", async function () {
      const cases = await getAggregatorTestCases(AggId.LIFI);
      const results = await getTransactionRequestForCases(cases);
      for (const tr of results) {
        assert(tr?.data, "Transaction should have data");
      }
    });

    it("Socket", async function () {
      const cases = await getAggregatorTestCases(AggId.SOCKET);
      const results = await getTransactionRequestForCases(cases);
      for (const tr of results) {
        assert(tr?.data, "Transaction should have data");
      }
    });

    it("1inch", async function () {
      const cases = await getAggregatorTestCases(AggId.ONE_INCH);
      const results = await getTransactionRequestForCases(cases);
      for (const tr of results) {
        assert(tr?.data, "Transaction should have data");
      }
    });

    it("0x", async function () {
      const cases = await getAggregatorTestCases(AggId.ZERO_X);
      const results = await getTransactionRequestForCases(cases);
      for (const tr of results) {
        assert(tr?.data, "Transaction should have data");
      }
    });
  });
});

describe("swapper.client.test.estimate", function () {
  describe("Get Quote", function () {
    it("Squid", async function () {
      const tr = await squidAggregator.getTransactionRequest(swapperParams);
      expect(tr?.data).to.be.a("string");
    });
    it("Li.Fi", async function () {
      const tr = await lifiAggregator.getTransactionRequest(swapperParams);
      expect(tr?.data).to.be.a("string");
    });
  });
});

describe("Swapper SDK Client", () => {
  it("is defined", () => {
    expect(true).not.eq(false);
  });
});

describe("Swapper CLI Tool", () => {
  it("should execute a simple quote command successfully", () => {
    // Example command (adjust params as needed, use Fantom like other tests)
    // Using 0x addresses for tokens to avoid needing real addresses here
    // Using a known test address for payer
    const command = `
      bunx swapper-cli quote \
        --input-chain 250 \
        --input-token 0x04068DA6C83AFCFA0e13ba15A6696662335D5B75 \
        --output-token 0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E \
        --amount-wei 1000000 \
        --payer 0x1234567890123456789012345678901234567890 \
        --aggregators ${AggId.PARASWAP} \
        --max-slippage 50
    `;

    try {
      // Execute the command synchronously
      const output = execSync(
        `node ${CLI_PATH} quote \
        --input-chain 250 \
        --input-token 0x04068DA6C83AFCFA0e13ba15A6696662335D5B75 \
        --output-token 0x8D11eC38a3EB5E956B052f67Da8Bdc9bef8Abf3E \
        --amount-wei 1000000 \
        --payer 0x1234567890123456789012345678901234567890 \
        --aggregators ${AggId.PARASWAP} \
        --max-slippage 50`,
        {
          encoding: "utf-8",
          stdio: "pipe", // Capture stdout/stderr
          timeout: 30000, // 30-second timeout
        },
      );
      console.log("CLI Output:", output);
      // Basic check: If execSync doesn't throw, the command likely exited successfully (code 0)
      assert(output.length > 0, "Command output should not be empty");
    } catch (error: any) {
      // If execSync throws, it means the CLI exited with a non-zero code or timed out
      console.error("CLI Execution Error:", error.stderr || error.stdout || error.message);
      // Fail the test explicitly
      expect.fail(`CLI command failed to execute successfully: ${error.message}`);
    }
  }).timeout(35000); // Slightly longer timeout for the test itself

  it("should execute the --help command successfully", () => {
    try {
      // Execute the command synchronously
      const output = execSync(`${CLI_PATH} --help`, {
        encoding: "utf-8",
        stdio: "pipe", // Capture stdout/stderr
        timeout: 30000, // 30-second timeout
      });
      console.log("CLI Output:", output);
      // Fix the unused expression by using assert
      assert(output.includes("Usage:"), "CLI help should include 'Usage:' text");
    } catch (error: any) {
      // If execSync throws, it means the CLI exited with a non-zero code or timed out
      console.error("CLI Execution Error:", error.stderr || error.stdout || error.message);
      // Fail the test explicitly
      expect.fail(`CLI command failed to execute successfully: ${error.message}`);
    }
  }).timeout(35000); // Slightly longer timeout for the test itself
});

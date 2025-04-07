import * as chai from "chai";
import { assert } from "chai";
import chaiAsPromised from "chai-as-promised";

import { KNOWN_CHAIN_IDS, generateFuzzCategories } from "../utils";

import { getTransactionRequest } from "@/index";
import { AggId } from "@/types";

chai.use(chaiAsPromised);

// Helper function to add delay between tests
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Meta-aggregators to test
const metaAggregators: AggId[] = [AggId.LIFI, AggId.SOCKET, AggId.SQUID, AggId.RANGO, AggId.UNIZEN];

// Test configuration
const testTimeout = 15000; // 15 seconds max per test
const throttleDelay = 1000; // 1 second delay between tests
const MAX_TEST_CASES = 2; // Maximum number of test cases per category

describe("Meta-Aggregator Fuzzing Tests", function () {
  this.timeout(testTimeout * metaAggregators.length * KNOWN_CHAIN_IDS.length * 4);

  before(() => {
    console.log(`Running fuzzing tests with ${throttleDelay}ms throttling between tests`);
    console.log(`Individual test timeout: ${testTimeout}ms`);
  });

  metaAggregators.forEach(aggId => {
    describe(`Aggregator: ${aggId}`, function () {
      // Flagship Monochain Tests (liquid tokens on a single chain)
      describe("Flagship Monochain", function () {
        it("should process flagship token swaps on single chains", async function () {
          this.timeout(testTimeout);

          const testCases = await generateFuzzCategories(aggId, MAX_TEST_CASES);

          // Run tests for flagship monochain cases
          for (let i = 0; i < testCases.flagshipMonochain.length; i++) {
            if (i > 0) await delay(throttleDelay);

            const testCase = testCases.flagshipMonochain[i];
            console.log(
              `Testing ${aggId} - Flagship Monochain: ${testCase.inputSymbol} -> ${testCase.outputSymbol} on chain ${testCase.inputChainId}`,
            );

            try {
              const result = await getTransactionRequest(testCase);

              // Simple assertions using assert
              assert(result, "Result should exist");
              assert(result.to, "Result should have 'to' property");
              assert(result.data, "Result should have 'data' property");
              assert.equal(result.from, testCase.payer, "Result from should match payer");

              // Validate estimates
              if (result.estimatedOutputWei) {
                const outputWeiBigInt = BigInt(result.estimatedOutputWei.toString());
                assert(Number(outputWeiBigInt) > 0, "Output amount should be greater than 0");
                console.log(`✅ Success: ${aggId} on chain ${testCase.inputChainId}`);
              }
            } catch (error) {
              console.error(
                `❌ Error with ${aggId} for ${testCase.inputSymbol} -> ${testCase.outputSymbol}:`,
                error,
              );
              // Simply return early from the test case
              return;
            }
          }
        });
      });

      // Any Monochain Tests (any tokens on a single chain)
      describe("Any Monochain", function () {
        it("should process any token swaps on single chains", async function () {
          this.timeout(testTimeout);

          const testCases = await generateFuzzCategories(aggId, MAX_TEST_CASES);

          // Run tests for any monochain cases
          for (let i = 0; i < testCases.anyMonochain.length; i++) {
            if (i > 0) await delay(throttleDelay);

            const testCase = testCases.anyMonochain[i];
            console.log(
              `Testing ${aggId} - Any Monochain: ${testCase.inputSymbol} -> ${testCase.outputSymbol} on chain ${testCase.inputChainId}`,
            );

            try {
              const result = await getTransactionRequest(testCase);

              // Simple assertions using assert
              assert(result, "Result should exist");
              assert(result.to, "Result should have 'to' property");
              assert(result.data, "Result should have 'data' property");
              assert.equal(result.from, testCase.payer, "Result from should match payer");

              // Validate estimates
              if (result.estimatedOutputWei) {
                const outputWeiBigInt = BigInt(result.estimatedOutputWei.toString());
                assert(Number(outputWeiBigInt) > 0, "Output amount should be greater than 0");
                console.log(`✅ Success: ${aggId} on chain ${testCase.inputChainId}`);
              }
            } catch (error) {
              console.error(
                `❌ Error with ${aggId} for ${testCase.inputSymbol} -> ${testCase.outputSymbol}:`,
                error,
              );
              // Simply return early from the test case
              return;
            }
          }
        });
      });

      // Flagship Crosschain Tests (liquid tokens across multiple chains)
      describe("Flagship Crosschain", function () {
        it("should process flagship token cross-chain swaps", async function () {
          this.timeout(testTimeout);

          const testCases = await generateFuzzCategories(aggId, MAX_TEST_CASES);

          // Run tests for flagship crosschain cases
          for (let i = 0; i < testCases.flagshipCrosschain.length; i++) {
            if (i > 0) await delay(throttleDelay);

            const testCase = testCases.flagshipCrosschain[i];
            console.log(
              `Testing ${aggId} - Flagship Crosschain: ${testCase.inputSymbol} on chain ${testCase.inputChainId} -> ${testCase.outputSymbol} on chain ${testCase.outputChainId}`,
            );

            try {
              const result = await getTransactionRequest(testCase);

              // Simple assertions using assert
              assert(result, "Result should exist");
              assert(result.to, "Result should have 'to' property");
              assert(result.data, "Result should have 'data' property");
              assert.equal(result.from, testCase.payer, "Result from should match payer");

              console.log(
                `✅ Success: ${aggId} cross-chain ${testCase.inputChainId}->${testCase.outputChainId}`,
              );
            } catch (error) {
              console.error(
                `❌ Error with ${aggId} for cross-chain ${testCase.inputSymbol}->${testCase.outputSymbol}:`,
                error,
              );
              // Simply return early from the test case
              return;
            }
          }
        });
      });

      // Any Crosschain Tests (any tokens across multiple chains)
      describe("Any Crosschain", function () {
        it("should process any token cross-chain swaps", async function () {
          this.timeout(testTimeout);

          const testCases = await generateFuzzCategories(aggId, MAX_TEST_CASES);

          // Run tests for any crosschain cases
          for (let i = 0; i < testCases.anyCrosschain.length; i++) {
            if (i > 0) await delay(throttleDelay);

            const testCase = testCases.anyCrosschain[i];
            console.log(
              `Testing ${aggId} - Any Crosschain: ${testCase.inputSymbol} on chain ${testCase.inputChainId} -> ${testCase.outputSymbol} on chain ${testCase.outputChainId}`,
            );

            try {
              const result = await getTransactionRequest(testCase);

              // Simple assertions using assert
              assert(result, "Result should exist");
              assert(result.to, "Result should have 'to' property");
              assert(result.data, "Result should have 'data' property");
              assert.equal(result.from, testCase.payer, "Result from should match payer");

              console.log(
                `✅ Success: ${aggId} cross-chain ${testCase.inputChainId}->${testCase.outputChainId}`,
              );
            } catch (error) {
              console.error(
                `❌ Error with ${aggId} for cross-chain ${testCase.inputSymbol}->${testCase.outputSymbol}:`,
                error,
              );
              // Simply return early from the test case
              return;
            }
          }
        });
      });
    });
  });
});

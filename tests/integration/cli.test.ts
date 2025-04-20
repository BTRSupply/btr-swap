import { AggId, DisplayMode, IBtrSwapCliParams, SerializationMode } from "@/types";
import { getToken } from "@/utils";
import { beforeAll, describe, test, afterEach } from "bun:test";
import { expect } from "chai";
import { execSync } from "child_process";
import { getCliExecutable, getPayer, runCliCommand, sleep } from "../utils";

const baseParams = <IBtrSwapCliParams>{
  executable: "swap-cli",
  payer: process.env.TEST_PAYER ?? getPayer(56),
  input: getToken("WBNB", 56),
  output: getToken("USDC", 56),
  inputAmountWei: 0.1e18,
  envFile: ".env",
};

const tableMultiRankParams = <IBtrSwapCliParams>{
  ...baseParams,
  aggIds: [AggId.SOCKET, AggId.SQUID, AggId.LIFI, AggId.UNIZEN],
  displayModes: [DisplayMode.RANK, DisplayMode.BEST_COMPACT],
  serializationMode: SerializationMode.TABLE,
  verbose: 3, // Increased verbosity from 2 to 3
};

const bestCompactCsvParams = <IBtrSwapCliParams>{
  ...baseParams,
  aggIds: [AggId.SOCKET, AggId.SQUID],
  displayModes: [DisplayMode.BEST_COMPACT],
  serializationMode: SerializationMode.CSV,
  verbose: 0, // Silent
};

const envFileTestParams = <IBtrSwapCliParams>{
  ...baseParams,
  aggIds: [AggId.LIFI, AggId.SOCKET],
  displayModes: [DisplayMode.RANK],
  serializationMode: SerializationMode.TABLE,
  envFile: "/tmp/.env", // Use the custom env file
  verbose: 2, // Enable verbose logging to check env loading
};

describe("BTR Swap CLI", function () {
  // Set up CLI tests - we'll determine if CLI is available
  let skipReason = "";

  // Throttle API calls between tests
  afterEach(async () => {
    await sleep(3000);
  });

  beforeAll(() => {
    // Setup CLI executable if not already set
    if (!baseParams.executable) {
      baseParams.executable = getCliExecutable();
      console.log(`CLI executable: ${baseParams.executable}`);
    }

    try {
      // Check if we can run a basic help command
      const command = `${baseParams.executable} --help`;
      console.log(`Running CLI verification: ${command}`);
      const helpResult = execSync(command, {
        stdio: "pipe",
        timeout: 2000, // 2 second timeout
      });

      const helpOutput = helpResult.toString();
      console.log(`CLI help output length: ${helpOutput.length} bytes`);

      // Verify it looks like a valid CLI
      const isValid =
        helpOutput.includes("swap-cli") ||
        helpOutput.includes("btr-swap") ||
        helpOutput.includes("Usage:");

      if (isValid) {
        console.log("✅ CLI executable is operational - proceeding with tests");
      } else {
        console.warn("❌ CLI executable help output doesn't look valid");
        skipReason = "CLI executable help output invalid";
      }
    } catch (error: any) {
      console.warn(`❌ CLI test failed: ${error.message}`);
      skipReason = "CLI executable not operational: " + error.message;
    }
  });

  const testOrSkip = skipReason ? test.skip : test;

  testOrSkip("displays version information", () => {
    try {
      const command = `${baseParams.executable} --version`;
      const output = execSync(command, { stdio: "pipe" }).toString();
      console.log(`Version output: ${output}`);
      expect(output)
        .to.include("BTR Swap CLI v")
        .and.match(/v\d+\.\d+\.\d+/);
    } catch (error: any) {
      console.warn("CLI version test failed:", error);
      throw error;
    }
  });

  testOrSkip(
    "verbose table output (RANK+BEST_COMPACT)",
    async () => {
      try {
        const output = runCliCommand(tableMultiRankParams, {
          validateWith: ["│", "Fetching quotes"],
        });
        // Check for table characters and verbose logging, allow empty performance table
        expect(output).to.include("│").and.include("Fetching quotes");
      } catch (error: any) {
        console.warn("CLI test failed:", error);
        throw error; // Rethrow other errors
      }
    },
    30000,
  );

  testOrSkip(
    "silent CSV output (BEST_COMPACT)",
    async () => {
      try {
        const output = runCliCommand(bestCompactCsvParams, { validateWith: [","] });
        // Check for CSV separator and absence of verbose/env logs
        expect(output).to.include(",");
        expect(output).to.not.include("⏳ Fetching quotes");
        expect(output).to.not.include("✅ Loaded");
      } catch (error: any) {
        console.warn("CLI test failed:", error);
        throw error; // Rethrow other errors
      }
    },
    30000,
  );

  testOrSkip(
    "uses custom .env file",
    async () => {
      try {
        // Expect the log message confirming the custom env file was loaded
        // Create a dummy .env file for the test
        execSync('echo "TEST_VAR1=value1\nTEST_VAR2=value2" > /tmp/.env');
        const output = runCliCommand(envFileTestParams, {
          validateWith: ["✅ Loaded 2 vars from /tmp/.env", "│"],
        }); // Check for env log AND table output
        // Also check that the main functionality still works (e.g., outputs a table)
        expect(output).to.include("│"); // Basic check for table structure is enough
      } catch (error: any) {
        console.warn("CLI custom env test failed:", error);
        throw error;
      }
    },
    30000,
  );

  // If tests are being skipped, add a diagnostic test explaining why
  if (skipReason) {
    test(`CLI tests skipped because: ${skipReason}`, () => {
      expect(true).to.be.true;
    });
  }
});

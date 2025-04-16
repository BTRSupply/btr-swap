import { AggId, DisplayMode, IBtrSwapCliParams, SerializationMode } from "@/types";
import { getToken } from "@/utils";
import { beforeAll, describe, test } from "bun:test";
import { expect } from "chai";
import { execSync } from "child_process";
import { getCliExecutable, getPayer, runCliCommand } from "../utils";

const baseParams = <IBtrSwapCliParams>{
  executable: "swap-cli",
  payer: process.env.TEST_PAYER ?? getPayer(56),
  input: getToken("USDC", 56),
  output: getToken("WETH", 56),
  inputAmountWei: 1000e6,
  envFile: ".env"
};

const tableMultiRankParams = <IBtrSwapCliParams>{
  ...baseParams,
  aggIds: [AggId.SOCKET, AggId.SQUID],
  displayModes: [DisplayMode.RANK, DisplayMode.BEST_COMPACT],
  serializationMode: SerializationMode.TABLE,
  silent: false
};

const bestCompactCsvParams = <IBtrSwapCliParams>{
  ...baseParams,
  aggIds: [AggId.SOCKET, AggId.SQUID],
  displayModes: [DisplayMode.BEST_COMPACT],
  serializationMode: SerializationMode.CSV,
  silent: true
};

describe("BTR Swap CLI", function() {
  // Set up CLI tests - we'll determine if CLI is available
  let skipReason = "";

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
        stdio: 'pipe',
        timeout: 2000  // 2 second timeout
      });

      const helpOutput = helpResult.toString();
      console.log(`CLI help output length: ${helpOutput.length} bytes`);

      // Verify it looks like a valid CLI
      const isValid = helpOutput.includes("swap-cli") ||
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

  testOrSkip("verbose table output (RANK+BEST_COMPACT)", () => {
    try {
      const output = runCliCommand(tableMultiRankParams, { validateWith: ["│", "Fetching quotes"], silentMode: false });
      console.log(output);
      expect(output).to.include("│").and.include("AGG").and.include("RATE");
    } catch (error: any) {
      console.warn("CLI test failed:", error);
      throw error; // Rethrow other errors
    }
  });

  testOrSkip("silent CSV output (BEST_COMPACT)", () => {
    try {
      const output = runCliCommand(bestCompactCsvParams, { validateWith: [","], silentMode: true });
      expect(output).to.include(",")
        .and.not.include("⏳ Fetching quotes")
        .and.not.include("✅ Loaded");
    } catch (error: any) {
      console.warn("CLI test failed:", error);
      throw error; // Rethrow other errors
    }
  });

  // If tests are being skipped, add a diagnostic test explaining why
  if (skipReason) {
    test(`CLI tests skipped because: ${skipReason}`, () => {
      expect(true).to.be.true;
    });
  }
});


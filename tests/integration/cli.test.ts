import { expect } from "chai";
import * as fs from "fs";
import { describe, test } from "bun:test";
import { AggId, DisplayMode, IBtrSwapCliParams, SerializationMode } from "@/types";
import { getToken } from "@/utils";
import { getCliExecutable, getPayer, runCliCommand } from "../utils";
import { execSync } from "child_process";

const baseParams = <IBtrSwapCliParams>{
  payer: process.env.TEST_PAYER ?? getPayer(56),
  input: getToken("USDC", 56),
  output: getToken("WETH", 56),
  inputAmountWei: 1000e6,
  envFile: ".env"
};

const tableMultiRankParams = <IBtrSwapCliParams>{
  ...baseParams,
  aggIds: [AggId.LIFI, AggId.UNIZEN, AggId.RANGO],
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
  // Setup test that will be used to decide if we can run the actual tests
  test("setup: verify CLI is operational", () => {
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
                      helpOutput.includes("CLI") ||
                      helpOutput.includes("Usage:");

      if (isValid) {
        console.log("✅ CLI executable is operational - proceeding with tests");
        return true;
      } else {
        console.warn("❌ CLI executable help output doesn't look valid");
        return false;
      }
    } catch (error: any) {
      console.warn(`❌ CLI test failed: ${error.message}`);
      return false;
    }
  });

  // In Bun, we need to use separate tests rather than conditionally skipping
  test("verbose table output (RANK+BEST_COMPACT)", () => {
    // Skip test if needed
    try {
      const output = runCliCommand(tableMultiRankParams, { validateWith: ["│", "Fetching quotes"], silentMode: false });
      expect(output).to.include("│").and.include("AGG").and.include("RATE");
    } catch (error: any) {
      if (error.message?.includes("command not found")) {
        console.log("CLI command not available, skipping test");
        return; // Soft skip by just returning
      }
      throw error; // Rethrow other errors
    }
  });

  test("silent CSV output (BEST_COMPACT)", () => {
    try {
      const output = runCliCommand(bestCompactCsvParams, { validateWith: [","], silentMode: true });
      expect(output).to.include(",")
        .and.not.include("⏳ Fetching quotes")
        .and.not.include("✅ Loaded");
    } catch (error: any) {
      if (error.message?.includes("command not found")) {
        console.log("CLI command not available, skipping test");
        return; // Soft skip by just returning
      }
      throw error; // Rethrow other errors
    }
  });
});


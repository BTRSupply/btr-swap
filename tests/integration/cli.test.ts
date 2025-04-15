import { expect } from "chai";
import * as fs from "fs";
import { AggId, DisplayMode, IBtrSwapCliParams, SerializationMode } from "@/types";
import { getToken } from "@/utils";
import { getCliExecutable, getPayer, runCliCommand } from "../utils";

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

describe("BTR Swap CLI", () => {
  const baseParams: Partial<IBtrSwapCliParams> = {
    payer: process.env.TEST_PAYER ?? getPayer(56),
    input: getToken("USDC", 56),
    output: getToken("WETH", 56),
    inputAmountWei: 1000e6,
    aggIds: [AggId.LIFI, AggId.UNIZEN, AggId.SOCKET, AggId.RANGO, AggId.SQUID],
    envFile: ".env"
  };

  before(() => {
    baseParams.executable = getCliExecutable();
    console.log(`CLI executable: ${baseParams.executable}`);

    const execPath = baseParams.executable?.split(" ")[1];
    if (execPath && !execPath.startsWith("swap-cli")) {
      expect(fs.existsSync(execPath)).to.be.true;
    }
  });

  it("should handle verbose table output (RANK+BEST_COMPACT)", function() {
    const output = runCliCommand(tableMultiRankParams, { validateWith: ["│", "Fetching quotes"], silentMode: false });
    expect(output).to.include("│").and.include("AGG").and.include("RATE");
  });

  it("should handle silent CSV output (BEST_COMPACT)", function() {
    const output = runCliCommand(bestCompactCsvParams, { validateWith: [","], silentMode: true });
    expect(output).to.include(",")
      .and.not.include("⏳ Fetching quotes")
      .and.not.include("✅ Loaded");
  });
});

import { afterAll, beforeAll, describe, it } from "bun:test";
import { expect } from "chai";
import fs from "fs";
import path from "path";

// Use alias imports based on tsconfig.json paths
import { loadEnv, parseArgs } from "@/cli/utils";

const envPath = path.resolve(process.cwd(), ".env");
const testEnvPath = path.resolve(process.cwd(), "test.env");
let originalEnv: string | null = null;

describe("CLI Parser", () => {
  beforeAll(() => {
    // Backup original .env if it exists
    if (fs.existsSync(envPath)) {
      originalEnv = fs.readFileSync(envPath, "utf8");
    }
    // Clean up test env if it exists
    if (fs.existsSync(testEnvPath)) {
      fs.unlinkSync(testEnvPath);
    }
  });

  afterAll(() => {
    // Restore original .env
    if (originalEnv !== null) {
      fs.writeFileSync(envPath, originalEnv);
    } else if (fs.existsSync(envPath)) {
      fs.unlinkSync(envPath);
    }

    // Clean up test env
    if (fs.existsSync(testEnvPath)) {
      fs.unlinkSync(testEnvPath);
    }
  });

  describe("parseArgs", () => {
    it("parses basic flags", () => {
      const args = ["quote", "-h", "--version", "-v", "-vv"];
      expect(parseArgs(args)).to.deep.equal({
        _command: "quote",
        help: true,
        version: true,
        verbose: 3,
      });
    });

    it("parses arguments with values", () => {
      const args = [
        "quote",
        "--input",
        "token_in",
        "--output",
        "token_out",
        "--max-slippage",
        "50",
        "--env-file",
        "/custom/.env",
      ];
      expect(parseArgs(args)).to.deep.equal({
        _command: "quote",
        input: "token_in",
        output: "token_out",
        maxSlippage: "50",
        envFile: "/custom/.env",
      });
    });

    it("handles boolean flags", () => {
      expect(parseArgs(["quote", "--some-flag", "--another-flag"])).to.deep.equal({
        _command: "quote",
        someFlag: true,
        anotherFlag: true,
      });
    });

    it("handles mixed arguments", () => {
      const args = [
        "quote",
        "--input",
        "token_in",
        "-v",
        "--output",
        "token_out",
        "--bool-flag",
        "--aggregators",
        "LIFI,SOCKET",
      ];
      expect(parseArgs(args)).to.deep.equal({
        _command: "quote",
        input: "token_in",
        verbose: 1,
        output: "token_out",
        boolFlag: true,
        aggregators: "LIFI,SOCKET",
      });
    });

    it("handles empty args", () => {
      expect(parseArgs([])).to.deep.equal({ _command: undefined });
    });

    it("correctly combines verbose flags", () => {
      expect(parseArgs(["quote", "-v", "--verbose"]).verbose).to.equal(2);
      expect(parseArgs(["quote", "--verbose", "-v"]).verbose).to.equal(2);
      expect(parseArgs(["quote", "--verbose", "-vv"]).verbose).to.equal(3);
      expect(parseArgs(["quote", "-vv", "-v"]).verbose).to.equal(3);
    });
  });

  describe("loadEnv", () => {
    it("loads default .env file", () => {
      fs.writeFileSync(envPath, "DEFAULT_VAR=default_value\nANOTHER=test");
      expect(loadEnv()).to.deep.equal({ DEFAULT_VAR: "default_value", ANOTHER: "test" });
    });

    it("returns undefined if .env file missing", () => {
      if (fs.existsSync(envPath)) fs.unlinkSync(envPath);
      expect(loadEnv()).to.be.undefined;
    });

    it("loads custom .env file", () => {
      fs.writeFileSync(testEnvPath, "CUSTOM_VAR=custom_value\nKEY=VALUE");
      expect(loadEnv(testEnvPath)).to.deep.equal({ CUSTOM_VAR: "custom_value", KEY: "VALUE" });
    });

    it("returns undefined if custom .env file missing", () => {
      if (fs.existsSync(testEnvPath)) fs.unlinkSync(testEnvPath);
      expect(loadEnv(testEnvPath)).to.be.undefined;
    });
  });
});

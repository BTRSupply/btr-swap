import { afterAll, beforeAll, describe, it } from "bun:test";
import { expect } from "chai";
import fs from "fs";
import path from "path";
import { Database } from "bun:sqlite";

// Use alias imports based on tsconfig.json paths
import { logPerformance } from "@/cli/log";
import { ITransactionRequestWithEstimate, SerializationMode, AggId, StepType } from "@/core/types";

// Define paths for test log files
const testDir = path.resolve(process.cwd(), "test_logs");
const jsonPath = (p: string) => path.resolve(testDir, p + (p.endsWith(".json") ? "" : ".json"));
const sqlitePath = (p: string) =>
  path.resolve(testDir, p + (p.endsWith(".sqlite") ? "" : ".sqlite"));
const customJsonLogPath = path.resolve(testDir, "custom_log_name"); // Test extension adding

// Mock data
const mockTrs: ITransactionRequestWithEstimate[] = [
  {
    params: {} as any, // simplified for testing
    steps: [
      { type: StepType.SWAP, protocol: { id: "p1", name: "Proto1" } },
      { type: StepType.BRIDGE, protocol: { id: "b1", name: "Bridge1" } },
    ],
    globalEstimates: {
      exchangeRate: 1.2,
      output: 120,
      gasCostUsd: 5,
      feeCostUsd: 1,
      gasCostWei: BigInt("10000000000000000"),
      feeCostWei: BigInt("2000000000000000"),
    },
    latencyMs: 1500,
    aggId: AggId.LIFI,
    from: "0xpayer",
    to: "0xtarget",
    data: "0xdata1",
  },
  {
    params: {} as any,
    steps: [{ type: StepType.SWAP, protocol: { id: "p2", name: "Proto2" } }],
    globalEstimates: {
      exchangeRate: 1.1,
      output: 110,
      gasCostUsd: 4,
      feeCostUsd: 0.5,
      gasCostWei: BigInt("8000000000000000"),
      feeCostWei: BigInt("1000000000000000"),
    },
    latencyMs: 1200,
    aggId: AggId.SOCKET,
    from: "0xpayer",
    to: "0xtarget",
    data: "0xdata2",
  },
];

beforeAll(() => {
  // Create test directory
  if (!fs.existsSync(testDir)) {
    fs.mkdirSync(testDir);
  }
  // Clean up old test files if they exist
  if (fs.existsSync(jsonPath("test_log"))) fs.unlinkSync(jsonPath("test_log"));
  if (fs.existsSync(sqlitePath("test_log"))) fs.unlinkSync(sqlitePath("test_log"));
  if (fs.existsSync(customJsonLogPath + ".json")) fs.unlinkSync(customJsonLogPath + ".json");
});

afterAll(() => {
  // Clean up test directory and files
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
});

describe("logPerformance", () => {
  it("logs and appends JSON, and adds extension", () => {
    logPerformance(mockTrs, jsonPath("test_log"), SerializationMode.JSON);
    expect(fs.existsSync(jsonPath("test_log"))).to.be.true;
    logPerformance(mockTrs, jsonPath("test_log"), SerializationMode.JSON);
    const lines = fs.readFileSync(jsonPath("test_log"), "utf-8").trim().split("\n");
    expect(lines).to.have.lengthOf(2);
    lines.forEach((line) => {
      const entry: any = JSON.parse(line);
      const data: any = Object.values(entry)[0];
      expect(data.rank).to.have.length(mockTrs.length);
    });
  });

  it("logs and appends SQLITE, and adds extension", () => {
    logPerformance(mockTrs, sqlitePath("test_log"), SerializationMode.SQLITE);
    expect(fs.existsSync(sqlitePath("test_log"))).to.be.true;
    logPerformance(mockTrs, sqlitePath("test_log"), SerializationMode.SQLITE);
    const db = new Database(sqlitePath("test_log"));
    const rows: any[] = db.prepare("SELECT * FROM logs ORDER BY timestamp").all();
    expect(rows.length).to.be.greaterThanOrEqual(1);
    rows.forEach((row: any) => {
      const rank: any[] = JSON.parse(row.rank);
      expect(rank).to.have.length(mockTrs.length);
      JSON.parse(row.best);
    });
    db.close();
  });

  it("adds .json extension if missing", () => {
    logPerformance(mockTrs, customJsonLogPath, SerializationMode.JSON);
    expect(fs.existsSync(customJsonLogPath + ".json")).to.be.true;
  });

  it("adds .sqlite extension if missing", () => {
    const customSqlitePath = path.resolve(testDir, "custom_log_sqlite");
    logPerformance(mockTrs, customSqlitePath, SerializationMode.SQLITE);
    expect(fs.existsSync(customSqlitePath + ".sqlite")).to.be.true;
    if (fs.existsSync(customSqlitePath + ".sqlite")) fs.unlinkSync(customSqlitePath + ".sqlite"); // Clean up specific file
  });
});

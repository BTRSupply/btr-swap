import {
  getPerformance,
  ITransactionRequestWithEstimate,
  SerializationMode,
  toJSON,
} from "@btr-supply/swap";
import { Database } from "bun:sqlite";
import { appendFileSync } from "fs";
import { resolve } from "path";

export function logPerformance(
  trs: ITransactionRequestWithEstimate[],
  filePath: string,
  mode = SerializationMode.JSON,
): void {
  const base = resolve(filePath);
  const ext = `.${mode.toLowerCase()}`;
  const file = base.endsWith(ext) ? base : base + ext;
  const perf = trs.map(getPerformance);
  const ts = new Date().toISOString();

  try {
    switch (mode) {
      case SerializationMode.JSON:
        appendFileSync(file, toJSON({ [ts]: { rank: perf, best: perf[0] || {} } }, 0) + "\n");
        break;
      case SerializationMode.SQLITE:
        const db = new Database(file);
        db.run(
          "CREATE TABLE IF NOT EXISTS logs (timestamp TEXT PRIMARY KEY, rank TEXT, best TEXT)",
        );
        db.run("INSERT OR REPLACE INTO logs VALUES (?, ?, ?)", [
          ts,
          toJSON(perf, 0),
          toJSON(perf[0] || {}, 0),
        ]);
        db.close();
        break;
      default:
        console.error("Unknown log mode:", mode);
    }
  } catch (err) {
    console.error("Performance log error:", mode, err);
  }
}

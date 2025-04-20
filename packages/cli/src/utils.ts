import {
  compactTrs,
  config as coreConfig,
  DisplayMode,
  getTrPerformance,
  getTrPerformanceTable,
  SerializationMode,
  serialize,
  AggId,
} from "@btr-supply/swap";
import { config as dotenv } from "dotenv";

/** Logs an error and exits. */
export const handleError = (msg: string): never => (console.error("❌", msg), process.exit(1));

/** Parses CLI args into a key/value object. */
export const parseArgs = (args: string[]): Record<string, any> => {
  const p: Record<string, any> = { _command: args[0] === "quote" ? "quote" : undefined };
  const toCamelCase = (s: string) => s.replace(/-(.)/g, (_, c) => c.toUpperCase());

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-h" || a === "--help") p.help = true;
    else if (a === "--version") p.version = true;
    else if (a === "-vv") p.verbose = 2;
    else if (a === "-v" || a === "--verbose") p.verbose = (p.verbose || 0) + 1;
    else if (a.startsWith("--")) {
      const key = toCamelCase(a.slice(2));
      if (key === "verbose") p.verbose = (p.verbose || 0) + 1;
      else {
        p[key] = args[i + 1] && !args[i + 1].startsWith("-") ? args[++i] : true;
      }
    }
  }
  return p;
};

/** Validates enum arguments. */
export const parseEnumArg = <T extends object>(val: any, Enum: T, def: any, multi = false) => {
  const valid = new Set(Object.values(Enum).map((e) => String(e).toUpperCase()));
  const result =
    val
      ?.toString()
      .toUpperCase()
      .split(",")
      .filter((v: string) => valid.has(v)) || [];
  const enumMap = Object.fromEntries(
    Object.entries(Enum).map(([k, v]) => [String(v).toUpperCase(), v]),
  );
  const mappedResult = result.map((r: string) => enumMap[r]).filter(Boolean);

  return multi ? (mappedResult.length ? mappedResult : def) : mappedResult[0] || def;
};

/** Parses JSON CLI options. */
export const parseJson = (key: string, args: any) =>
  args[key] ? JSON.parse(args[key]) : undefined;

/** Loads a .env file. */
export const loadEnv = (path?: string) =>
  dotenv(path ? { path } : undefined).parsed && {
    parsed: dotenv().parsed,
    count: Object.keys(dotenv().parsed || {}).length,
    path: path || ".env",
  };

/** Applies environment and CLI JSON overrides to the core config. */
export const applyConfig = (
  cli: {
    apiKeys?: Record<string, string>;
    referrer?: Record<string, any>;
    integrators?: Record<string, string>;
    feesBps?: Record<string, number>;
  },
  silent: boolean,
) =>
  Object.entries(coreConfig).forEach(([id, cfg]) => {
    const agg = id as AggId;
    // Env overrides
    const ek = process.env[`${agg}_API_KEY`];
    if (ek) cfg.apiKey = ek;
    const er = process.env[`${agg}_REFERRER`];
    if (er !== undefined) {
      const num = Number(er);
      cfg.referrer = isNaN(num) ? er : num;
    }
    const ei = process.env[`${agg}_INTEGRATOR`];
    if (ei) cfg.integrator = ei;
    const ef = process.env[`${agg}_FEE_BPS`];
    if (ef !== undefined) {
      const num = parseInt(ef, 10);
      if (!isNaN(num)) cfg.feeBps = num;
      else if (!silent) console.warn(`⚠️ Invalid fee BPS for ${agg}: ${ef}`);
    }
    // CLI JSON overrides
    if (cli.apiKeys?.[agg]) cfg.apiKey = cli.apiKeys[agg];
    if (cli.referrer?.[agg] !== undefined) cfg.referrer = cli.referrer[agg];
    if (cli.integrators?.[agg]) cfg.integrator = cli.integrators[agg];
    if (cli.feesBps?.[agg] !== undefined) {
      const num = Number(cli.feesBps[agg]);
      if (!isNaN(num)) cfg.feeBps = num;
      else if (!silent) console.warn(`⚠️ Invalid fee BPS for ${agg}: ${cli.feesBps[agg]}`);
    }
  });

/** Formats and prints output. */
export const displayOutput = (mode: DisplayMode, trs: any, ser: SerializationMode | string) => {
  const serializationMode =
    typeof ser === "string" ? (ser.toUpperCase() as SerializationMode) : ser;
  console.log(
    mode === DisplayMode.RANK
      ? serializationMode === SerializationMode.TABLE
        ? getTrPerformanceTable(trs)
        : serialize(trs.map(getTrPerformance), { mode: serializationMode })
      : serialize(compactTrs(mode.includes("BEST") ? [trs[0]] : trs), { mode: serializationMode }),
  );
};

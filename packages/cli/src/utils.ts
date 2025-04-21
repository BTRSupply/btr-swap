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
import { config } from "dotenv";
import * as fs from "fs";
import path from "path";

/** Logs an error and exits. */
export const handleError = (msg: string): never => (console.error("❌", msg), process.exit(1));

/** Parses CLI args into a key/value object. */
export const parseArgs = (args: string[]): Record<string, any> => {
  const p: Record<string, any> = { _command: args[0] === "quote" ? "quote" : undefined };
  const toCamelCase = (s: string) => s.replace(/-(.)/g, (_, c) => c.toUpperCase());
  let verbose_level = 0;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "-h" || a === "--help") p.help = true;
    else if (a === "--version") p.version = true;
    else if (a === "-vv") verbose_level += 2;
    else if (a === "-v" || a === "--verbose") verbose_level += 1;
    else if (a.startsWith("--")) {
      const key = toCamelCase(a.slice(2));
      if (key === "verbose") {
        // Already handled by the '-v' || '--verbose' check above, but prevent it from being treated as a normal arg
      } else {
        p[key] = args[i + 1] && !args[i + 1].startsWith("-") ? args[++i] : true;
      }
    }
  }
  if (verbose_level > 0) {
    p.verbose = verbose_level;
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

/**
 * Loads environment variables from a specified .env file.
 *
 * @param envPath Optional path to the .env file. If provided, will load variables from this path.
 * @returns The loaded environment variables object, or undefined if the file doesn't exist or is empty.
 */
export function loadEnv(envPath?: string): Record<string, string> | undefined {
  try {
    // If a custom path is provided, resolve it directly
    // Otherwise, look for .env in the current directory
    const dotenvPath = envPath ? path.resolve(envPath) : path.resolve(process.cwd(), ".env");

    // Check if the file exists
    if (!fs.existsSync(dotenvPath)) {
      return undefined;
    }

    // Load the environment file with override option to ensure custom files take precedence
    const result = config({
      path: dotenvPath,
      override: true, // Ensure variables override any previously set ones
    });

    return result.parsed && Object.keys(result.parsed).length > 0 ? result.parsed : undefined;
  } catch (error) {
    console.error(
      `Error loading env file: ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

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

/*
  Batch parser for a folder containing many .ddd files.

  Usage examples:
    npx tsx tools/batch-parse.ts samples
    npx tsx tools/batch-parse.ts samples --out samples/_out_json

  What it does:
    - parses each .ddd with the same pipeline used by the Electron UI
    - writes one JSON per input file
    - writes a _summary.json with quick fields useful for QA
*/

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";

import { DDDParserPipeline } from "../src/main/dddPipeline";

type SummaryRow = {
  file: string;
  outJson: string;
  ok: boolean;
  entityType?: string;
  periodStart?: string;
  periodEnd?: string;
  driverName?: string;
  driverCardNumber?: string;
  vehicleRegistration?: string;
  violations?: {
    daily?: number;
    weekly?: number;
    breaks?: number;
    fortnight?: number;
  };
  parsers?: {
    successCount?: number;
    failureCount?: number;
  };
  error?: string;
};

function parseArgs(argv: string[]) {
  const args = argv.slice(2);
  const folder = args[0] ?? "samples";
  const outIdx = args.indexOf("--out");
  const outDir = outIdx >= 0 ? args[outIdx + 1] : path.join(folder, "_out_json");
  return { folder, outDir };
}

async function listDddFiles(folder: string): Promise<string[]> {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    const full = path.join(folder, e.name);
    if (e.isDirectory()) {
      // skip output folder to avoid loops
      if (e.name === "_out_json") continue;
      const nested = await listDddFiles(full);
      out.push(...nested);
    } else if (e.isFile() && e.name.toLowerCase().endsWith(".ddd")) {
      out.push(full);
    }
  }
  return out.sort();
}

function baseNameNoExt(p: string): string {
  const b = path.basename(p);
  return b.replace(/\.ddd$/i, "");
}

async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true });
}

async function main() {
  const { folder, outDir } = parseArgs(process.argv);

  if (!fsSync.existsSync(folder)) {
    console.error(`Folder not found: ${folder}`);
    process.exit(2);
  }

  const dddFiles = await listDddFiles(folder);
  if (!dddFiles.length) {
    console.error(`No .ddd files found under: ${folder}`);
    process.exit(3);
  }

  await ensureDir(outDir);

  console.log(`Found ${dddFiles.length} .ddd files`);
  console.log(`Output folder: ${outDir}`);

  const pipeline = new DDDParserPipeline();
  const summary: SummaryRow[] = [];

  for (let i = 0; i < dddFiles.length; i++) {
    const file = dddFiles[i];
    const outJson = path.join(outDir, `${baseNameNoExt(file)}.json`);

    console.log("\n--------------------------------------------------");
    console.log(`[${i + 1}/${dddFiles.length}] Parsing: ${file}`);

    try {
      const res = await pipeline.parse(file, (p) => {
        // keep it readable in terminal
        if (p?.stage) console.log(`  - ${p.stage}${typeof p.percent === "number" ? ` (${p.percent}%)` : ""}`);
      });

      await fs.writeFile(outJson, JSON.stringify(res, null, 2), "utf-8");

      const n = res?.normalized;
      const c = n?.compliance561;

      summary.push({
        file,
        outJson,
        ok: true,
        entityType: n?.entityType,
        periodStart: c?.periodStart,
        periodEnd: c?.periodEnd,
        driverName: n?.driver?.fullName,
        driverCardNumber: n?.driver?.cardNumber,
        vehicleRegistration: n?.vehicle?.registrationNumber,
        violations: {
          daily: Array.isArray(c?.daily)
            ? c.daily.filter((d: any) => d?.dailyDrivingViolation || d?.dailyRestFlag === "INSUFFICIENT").length
            : 0,
          weekly: Array.isArray(c?.weekly)
            ? c.weekly.filter((w: any) => !!w?.weeklyDrivingViolation).length
            : 0,
          breaks: Array.isArray(c?.breakViolations) ? c.breakViolations.length : 0,
          fortnight: Array.isArray(c?.fortnightViolations) ? c.fortnightViolations.length : 0,
        },
        parsers: {
          successCount: res?.successCount,
          failureCount: res?.failureCount,
        },
      });

      console.log(`✅ Done -> ${outJson}`);
    } catch (e: any) {
      summary.push({ file, outJson, ok: false, error: e?.message ?? String(e) });
      console.error(`❌ Failed: ${e?.message ?? String(e)}`);
    }
  }

  const summaryPath = path.join(outDir, "_summary.json");
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2), "utf-8");
  console.log("\n==================================================");
  console.log(`Summary written: ${summaryPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

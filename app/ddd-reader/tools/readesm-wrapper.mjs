#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

async function findReadesmEntry() {
    // Risolvo la root del package installato in node_modules
    const require = createRequire(import.meta.url);
    const pkgJson = require.resolve("readesm-js/package.json");
    const pkgRoot = path.dirname(pkgJson);

    // Cerco un file "utilizzabile" per convertire (robusto anche se cambiano i nomi)
    const candidates = [
        path.join(pkgRoot, "dist", "main.EsmDownloader.lib.js"),
        path.join(pkgRoot, "dist", "main.EsmDownloader.bundle.baaddf8b3a1c92a9a1df.js"),
        path.join(pkgRoot, "dist", "main.EsmDownloader.bundle.af4642d85a085ad36089.min.js")
    ];

    for (const p of candidates) {
        try {
            await fs.access(p);
            return p;
        } catch { }
    }

    // fallback: scan "dist/" e prendo il primo file .js grosso che contenga EsmDownloader
    const distDir = path.join(pkgRoot, "dist");
    const entries = await fs.readdir(distDir);
    const jsFiles = entries.filter(f => f.endsWith(".js")).map(f => path.join(distDir, f));

    for (const p of jsFiles) {
        const stat = await fs.stat(p);
        if (stat.size > 100_000) return p;
    }

    throw new Error("Impossibile trovare un entrypoint JS di readesm-js dentro node_modules/readesm-js/dist");
}

async function loadConverter(entryPath) {
    // Importo il file trovato; alcuni bundle espongono EsmDownloader come global o export
    const mod = await import(pathToFileUrl(entryPath));

    // Provo varie forme, perché i bundle possono differire
    const EsmDownloader =
        mod?.EsmDownloader ||
        mod?.default?.EsmDownloader ||
        globalThis?.EsmDownloader;

    if (!EsmDownloader) {
        throw new Error("Non trovo EsmDownloader nel modulo importato. Serve adattare l’accesso all’API esportata.");
    }

    // In README il progetto parla di conversione in JSON “on the fly” tramite EsmDownloader. :contentReference[oaicite:1]{index=1}
    const fn =
        EsmDownloader.downloadEsmAsJson ||
        EsmDownloader.convertEsmAsJson ||
        EsmDownloader.convertEsmToJson ||
        EsmDownloader.toJson;

    if (!fn) {
        throw new Error("Non trovo una funzione di conversione JSON su EsmDownloader. Serve mappare il nome corretto.");
    }

    return { EsmDownloader, fn };
}

function pathToFileUrl(p) {
    // compat Windows
    let u = p.replace(/\\/g, "/");
    if (!u.startsWith("/")) u = "/" + u;
    return "file://" + u;
}

async function main() {
    const [inputPath, outputJsonPath] = process.argv.slice(2);
    if (!inputPath || !outputJsonPath) {
        console.error("Usage: readesm-wrapper.mjs <input.ddd> <output.json>");
        process.exit(2);
    }

    const entry = await findReadesmEntry();
    const { EsmDownloader, fn } = await loadConverter(entry);

    // 2 strategie:
    // A) se la funzione prende un path e salva lei
    // B) se restituisce oggetto/stringa, lo scriviamo noi
    let result = await fn(inputPath);

    // Se ritorna void e salva in download, qui serve adattare
    if (result === undefined || result === null) {
        throw new Error("La conversione non ha restituito output. Serve adattare la funzione (path->json).");
    }

    // Se ritorna stringa JSON
    if (typeof result === "string") {
        await fs.writeFile(outputJsonPath, result, "utf-8");
        return;
    }

    // Se ritorna oggetto JS
    await fs.writeFile(outputJsonPath, JSON.stringify(result, null, 2), "utf-8");
}

main().catch((e) => {
    console.error(e?.stack || String(e));
    process.exit(1);
});

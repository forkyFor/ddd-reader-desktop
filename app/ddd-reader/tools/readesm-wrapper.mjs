#!/usr/bin/env node
import fs from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function toArrayBuffer(buf) {
    // buf è un Node Buffer; questo crea l'ArrayBuffer esatto (senza padding)
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function main() {
    const [inputPath, outputJsonPath] = process.argv.slice(2);

    if (!inputPath || !outputJsonPath) {
        console.error("Usage: readesm-wrapper.mjs <input.ddd> <output.json>");
        process.exit(2);
    }

    // readesm-js esporta funzioni come convertToJson(data:ArrayBuffer) :contentReference[oaicite:2]{index=2}
    const mod = require("readesm-js");
    const convertToJson = mod?.convertToJson || mod?.default?.convertToJson;

    if (typeof convertToJson !== "function") {
        console.error("readesm-js: convertToJson non trovato. Controlla versione/installazione.");
        process.exit(1);
    }

    const fileBuf = await fs.readFile(inputPath);
    const ab = toArrayBuffer(fileBuf);

    const jsonObj = convertToJson(ab);

    await fs.writeFile(outputJsonPath, JSON.stringify(jsonObj, null, 2), "utf-8");
    process.exit(0);
}

main().catch((e) => {
    console.error(e?.stack || String(e));
    process.exit(1);
});

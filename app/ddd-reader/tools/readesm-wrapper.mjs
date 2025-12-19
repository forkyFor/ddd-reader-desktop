#!/usr/bin/env node
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

function emitProgress(percent, stage) {
    // una riga JSON per evento, facile da parsare
    process.stdout.write(JSON.stringify({ type: "progress", percent, stage }) + "\n");
}

function toArrayBuffer(buf) {
    return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
}

async function readFileWithProgress(filePath) {
    const stat = await fsp.stat(filePath);
    const total = stat.size || 1;

    return await new Promise((resolve, reject) => {
        const chunks = [];
        let read = 0;

        const stream = fs.createReadStream(filePath);
        stream.on("data", (chunk) => {
            chunks.push(chunk);
            read += chunk.length;

            // mappiamo lettura su 0..70%
            const p = Math.min(70, Math.floor((read / total) * 70));
            emitProgress(p, "Lettura file...");
        });

        stream.on("error", reject);

        stream.on("end", () => {
            const buf = Buffer.concat(chunks);
            resolve(buf);
        });
    });
}

async function main() {
    const [inputPath, outputJsonPath] = process.argv.slice(2);

    if (!inputPath || !outputJsonPath) {
        console.error("Usage: readesm-wrapper.mjs <input.ddd> <output.json>");
        process.exit(2);
    }

    emitProgress(0, "Avvio...");

    const mod = require("readesm-js");
    const convertToJson = mod?.convertToJson || mod?.default?.convertToJson;

    if (typeof convertToJson !== "function") {
        console.error("readesm-js: convertToJson non trovato.");
        process.exit(1);
    }

    // 1) lettura progressiva (0..70)
    const fileBuf = await readFileWithProgress(inputPath);
    emitProgress(70, "File letto. Preparazione conversione...");

    // 2) conversione (stimata 70..95)
    let fake = 70;
    const timer = setInterval(() => {
        // sale lentamente fino a 95 finché la conversione non termina
        if (fake < 95) {
            fake += 1;
            emitProgress(fake, "Conversione in corso...");
        }
    }, 400);

    let jsonObj;
    try {
        const ab = toArrayBuffer(fileBuf);
        jsonObj = convertToJson(ab);
    } finally {
        clearInterval(timer);
    }

    emitProgress(96, "Scrittura output...");

    // 3) scrittura
    await fsp.mkdir(path.dirname(outputJsonPath), { recursive: true });
    await fsp.writeFile(outputJsonPath, JSON.stringify(jsonObj, null, 2), "utf-8");

    emitProgress(100, "Completato");
    process.exit(0);
}

main().catch((e) => {
    console.error(e?.stack || String(e));
    process.exit(1);
});

import {readFileSync, rmSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath} from "node:url";
import esbuild from "esbuild";
import fg from "fast-glob";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const config = JSON.parse(readFileSync("./config.json"));
rmSync(resolve(__dirname, config.buildFolder), {recursive: true, force: true});
esbuild
    .build({
        entryPoints: fg.sync([`${config.scriptsFolder}/**/*.ts`, `${config.scriptsFolder}/**/*.js`]),
        outdir: config.buildFolder,
        platform: "browser",
        format: "esm",
        sourcemap: "inline",
    })
    .catch((reason) => console.error(reason));

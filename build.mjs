import {readFileSync} from "node:fs";
import esbuild from "esbuild";
import fg from "fast-glob";

const config = JSON.parse(readFileSync("./config.json"));
esbuild.build({
    entryPoints: fg.sync([`${config.scriptsFolder}/**/*.ts`, `${config.scriptsFolder}/**/*.js`]),
    outdir: config.buildFolder,
    platform: "browser",
    format: "esm",
    sourcemap: "inline",
}).catch((reason) => console.error(reason));

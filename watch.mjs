import {readFileSync} from "node:fs";
import EventEmitter from "node:events";
import esbuild from "esbuild";
import CheapWatch from "cheap-watch";
import {EventType, fileChangeEventToMsg, fileRemovalEventToMsg, setupWebSocketServer} from "./remote.mjs";

const config = JSON.parse(readFileSync("./config.json"));
const eventEmitter = new EventEmitter();
const wss = setupWebSocketServer(eventEmitter);
console.log(`Server is running on ${config.port}`);

eventEmitter.on(EventType.ConnectionMade, () => {
    for (const [path, stats] of watchBuildFolder.paths.entries()) {
        if (stats.isFile()) {
            eventEmitter.emit(EventType.MessageSend, fileChangeEventToMsg({path: path}));
        }
    }
});

function buildScript(path) {
    if (!path.endsWith(".ts") && !path.endsWith(".js")) {
        return;
    }
    esbuild
        .build({
            entryPoints: [path],
            outdir: config.buildFolder,
            platform: "browser",
            format: "esm",
            sourcemap: "inline",
        })
        .catch((reason) => console.error(reason));
}

const watchScriptsFolder = new CheapWatch({
    dir: config.scriptsFolder,
});
await watchScriptsFolder.init();
watchScriptsFolder.on("+", (fileEvent) => {
    if (fileEvent.stats.isFile()) {
        buildScript(fileEvent.path);
    }
});
watchScriptsFolder.on("-", (fileEvent) => {
    if (fileEvent.stats.isFile() && (fileEvent.path.endsWith(".ts") || fileEvent.path.endsWith(".js"))) {
        eventEmitter.emit(EventType.MessageSend, fileRemovalEventToMsg({path: fileEvent.path.replace(".ts", ".js")}));
    }
});

const watchBuildFolder = new CheapWatch({
    dir: config.buildFolder,
});
await watchBuildFolder.init();
watchBuildFolder.on("+", (fileEvent) => {
    if (fileEvent.stats.isFile()) {
        eventEmitter.emit(EventType.MessageSend, fileChangeEventToMsg({path: fileEvent.path}));
    }
});
watchBuildFolder.on("-", (fileEvent) => {
    if (fileEvent.stats.isFile()) {
        eventEmitter.emit(EventType.MessageSend, fileRemovalEventToMsg({path: fileEvent.path}));
    }
});

process.on("SIGINT", function () {
    watchScriptsFolder.close();
    watchBuildFolder.close();
    wss.close();
    process.exit(0);
});

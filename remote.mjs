import {readFileSync} from "node:fs";
import {join} from "node:path";
import {WebSocketServer} from "ws";

const config = JSON.parse(readFileSync("./config.json"));
let messageCounter = 0;

export class EventType {
    static ConnectionMade = "ConnectionMade";
    static FileChanged = "FileChanged";
    static FileDeleted = "FileDeleted";
    static MessageReceived = "MessageReceived";
    static MessageSend = "MessageSend";
}

export function setupWebSocketServer(eventEmitter) {
    const wss = new WebSocketServer({port: config.port});

    wss.on("connection", function connection(ws) {
        ws.isAlive = true;
        ws.on("error", console.error);
        ws.on("pong", function () {
            this.isAlive = true;
        });

        function sendMessage(msg) {
            ws.send(JSON.stringify(msg));
        }

        ws.on("message", (msg) => {
            eventEmitter.emit(EventType.MessageReceived, msg);
        });

        eventEmitter.on(EventType.MessageSend, (msg) => {
            sendMessage(msg);
        });

        eventEmitter.emit(EventType.ConnectionMade);
    });

    const interval = setInterval(function ping() {
        if (!config.quiet) {
            console.log("Cleaning up connection");
        }
        wss.clients.forEach(function each(ws) {
            if (!config.quiet) {
                console.log(`ws.isAlive: ${ws.isAlive}`);
            }
            if (ws.isAlive === false) {
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, 3000);

    wss.on("close", function close() {
        clearInterval(interval);
    });

    return wss;
}

function addLeadingSlash(path) {
    const slashes = path.match("/");
    if (slashes) return `/${path}`;
    else return path;
}

export function fileChangeEventToMsg({path}) {
    return {
        jsonrpc: "2.0",
        method: "pushFile",
        params: {
            server: "home",
            filename: addLeadingSlash(path),
            content: readFileSync(join(config.buildFolder, path)).toString(),
        },
        id: messageCounter++,
    };
}

export function fileRemovalEventToMsg({path}) {
    return {
        jsonrpc: "2.0",
        method: "deleteFile",
        params: {
            server: "home",
            filename: addLeadingSlash(path),
        },
        id: messageCounter++,
    };
}

export function requestDefinitionFile() {
    return {
        jsonrpc: "2.0",
        method: "getDefinitionFile",
        id: messageCounter++,
    };
}

export function requestFilenames() {
    return {
        jsonrpc: "2.0",
        method: "getFileNames",
        params: {
            server: "home",
        },
        id: messageCounter++,
    };
}

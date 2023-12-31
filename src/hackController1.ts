import {AutocompleteData, NS} from "@ns";
import {NetscriptExtension} from "/libs/NetscriptExtension";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function autocomplete(data: AutocompleteData, flags: string[]): string[] {
    return [...data.servers];
}

let nsx: NetscriptExtension;

export function main(ns: NS): void {
    nsx = new NetscriptExtension(ns);
    nsx.killProcessesSpawnFromSameScript();

    const target = ns.args[0];

    const scriptName = "simpleHack.js";
    nsx.scanBFS("home", function (host) {
        // Skip home server
        if (host.hostname === "home") {
            return;
        }
        if (!ns.hasRootAccess(host.hostname)) {
            ns.tprint(`Skip ${host.hostname}. No root access.`);
            return;
        }
        const numberOfThread = Math.floor(
            (ns.getServerMaxRam(host.hostname) - ns.getServerUsedRam(host.hostname)) / ns.getScriptRam(scriptName)
        );
        if (numberOfThread === 0) {
            ns.tprint(`Skip ${host.hostname}. Not enough RAM.`);
            return;
        }
        ns.scriptKill(scriptName, host.hostname);
        ns.scp(scriptName, host.hostname);
        ns.exec(scriptName, host.hostname, numberOfThread, target);
        ns.tprint(`Host: ${host.hostname}. Threads: ${numberOfThread}`);
    });
}

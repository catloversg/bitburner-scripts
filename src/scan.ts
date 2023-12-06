import {NS} from "@ns";
import {NetscriptExtension, ScanServerInfo} from "libs/NetscriptExtension";
import {PRIVATE_SERVER_NAME_PREFIX} from "/libs/constants";

export function autocomplete(data: object, args: string[]) {
    return ["simple", "full"];
}

let nsx: NetscriptExtension;

export async function main(ns: NS) {
    nsx = new NetscriptExtension(ns);

    const useDFS = false;
    const startingHostname = "home";

    let mode = ns.args[0];
    if (!mode) {
        mode = "full";
    }

    const hosts = (useDFS) ? nsx.scanDFS(startingHostname) : nsx.scanBFS(startingHostname);

    if (mode === "full") {
        const analyze = function (startingHost: ScanServerInfo) {
            hosts.forEach(host => {
                if (host.canAccessFrom !== startingHost.hostname) {
                    return;
                }
                let prefix = "";
                for (let i = 0; i < host.depth - 1; i++) {
                    prefix += "  ";
                }
                ns.tprintf(`${prefix} ┣ ${host.hostname}`);
                ns.tprintf(
                    `${prefix} ┃    Root access: ${ns.hasRootAccess(host.hostname)}`
                    + `. Ports: ${ns.getServerNumPortsRequired(host.hostname)}`
                    + `. RAM: ${ns.getServerMaxRam(host.hostname)}`
                    + `. Hacking skill: ${ns.getServerRequiredHackingLevel(host.hostname)}`
                );
                ns.tprintf(
                    `${prefix} ┃    Max money: ${ns.formatNumber(ns.getServerMaxMoney(host.hostname))}`
                    + `. Difficulty: ${ns.getServerMinSecurityLevel(host.hostname)} - ${ns.getServerBaseSecurityLevel(host.hostname)}`
                    + `. Growth: ${ns.getServerGrowth(host.hostname)}`
                    + `. Hack chance: ${ns.hackAnalyzeChance(host.hostname)}`
                );
                analyze(host);
            });
        };
        if (hosts.length === 0) {
            return;
        }
        analyze(hosts[0]);
    } else {
        hosts.sort((a, b) => {
            return ns.getServerRequiredHackingLevel(b.hostname) - ns.getServerRequiredHackingLevel(a.hostname);
        });
        hosts.forEach(host => {
            if (host.hostname === startingHostname || host.hostname.startsWith(PRIVATE_SERVER_NAME_PREFIX)) {
                return;
            }
            ns.tprintf(`${host.hostname}`);
            ns.tprintf(
                `    Root access: ${ns.hasRootAccess(host.hostname)}`
                + `. Ports: ${ns.getServerNumPortsRequired(host.hostname)}`
                + `. RAM: ${ns.getServerMaxRam(host.hostname)}`
                + `. Hacking skill: ${ns.getServerRequiredHackingLevel(host.hostname)}`
            );
            ns.tprintf(
                `    Max money: ${ns.formatNumber(ns.getServerMaxMoney(host.hostname))}`
                + `. Difficulty: ${ns.getServerMinSecurityLevel(host.hostname)} - ${ns.getServerBaseSecurityLevel(host.hostname)}`
                + `. Growth: ${ns.getServerGrowth(host.hostname)}`
                + `. Hack chance: ${ns.hackAnalyzeChance(host.hostname)}`
            );
        });
    }
}

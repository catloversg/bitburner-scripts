/**
 * Do NOT import any script except @ns
 */
import {AutocompleteData, NS} from "@ns";

let originalRevokeObjectURLFunction: ((url: string) => void) | null = null;

export function disableURLRevokeObjectURL() {
    if (originalRevokeObjectURLFunction === null) {
        originalRevokeObjectURLFunction = URL.revokeObjectURL;
        URL.revokeObjectURL = (url: string) => {
            console.log(`Url ${url} has been requested to be revoked. This request has been cancelled.`);
        };
        console.log("URL.revokeObjectURL has been disabled");
    }
}

export function enableURLRevokeObjectURL() {
    if (originalRevokeObjectURLFunction === null) {
        throw new Error("URL.revokeObjectURL has not been disabled");
    }
    URL.revokeObjectURL = originalRevokeObjectURLFunction;
    originalRevokeObjectURLFunction = null;
    console.log("URL.revokeObjectURL has been enabled");
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function autocomplete(data: AutocompleteData, flags: string[]): string[] {
    return ["--runHUDAndDaemon"];
}

export function main(ns: NS): void {
    disableURLRevokeObjectURL();

    const config = ns.flags([
        ["runHUDAndDaemon", false]
    ]);
    if (config.runHUDAndDaemon) {
        ns.run("customHUD.js");
        ns.run("daemon.js", 1, "--maintainCorporation");
    }
}

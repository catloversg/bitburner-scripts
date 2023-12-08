/**
 * Do NOT import any script
 */

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

export function autocomplete(data: any, args: string[]) {
    return ["--runHUDAndDaemon"];
}

export async function main(ns: any): Promise<void> {
    disableURLRevokeObjectURL();

    const config = ns.flags([
        ["runHUDAndDaemon", false]
    ]);
    if (config.runHUDAndDaemon) {
        ns.run("customHUD.js");
        ns.run("daemon.js", 1, "--maintainCorporation");
    }
}

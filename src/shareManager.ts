import {NS} from "@ns";
import {assertIsNumber} from "/libs/utils";
import {SHARE_SCRIPT_NAME} from "/libs/constants";
import {NetscriptExtension} from "/libs/NetscriptExtension";

let nsx: NetscriptExtension;

export async function main(ns: NS): Promise<void> {
    nsx = new NetscriptExtension(ns);
    nsx.killProcessesSpawnFromSameScript();

    let threads = ns.args[0];
    assertIsNumber(threads, "Invalid number of threads");
    // Run share script
    while (true) {
        nsx.runScriptOnAvailablePrivateRunners(
            true,
            true,
            true,
            SHARE_SCRIPT_NAME,
            threads
        );
        await ns.sleep(10000);
    }
}

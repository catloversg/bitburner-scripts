import { NS } from "@ns";
import { assertIsNumber } from "/libs/utils";
import { SHARE_SCRIPT_NAME } from "/libs/constants";
import { NetscriptExtension } from "/libs/NetscriptExtension";

let nsx: NetscriptExtension;

/**
 * Usage:
 * - run shareManager.js custom 100000
 * - run shareManager.js simple
 *
 * @param ns
 */
export async function main(ns: NS): Promise<void> {
  ns.disableLog("ALL");
  ns.clearLog();
  nsx = new NetscriptExtension(ns);
  nsx.killProcessesSpawnFromSameScript();

  const mode = ns.args[0];
  if (mode === "simple") {
    const pservers = ns.getPurchasedServers();
    for (let i = 0; i < pservers.length; ++i) {
      ns.scp(SHARE_SCRIPT_NAME, pservers[i], "home");
    }
    while (true) {
      for (let i = 0; i < pservers.length; ++i) {
        const threads = Math.floor(
          (ns.getServerMaxRam(pservers[i]) - ns.getServerUsedRam(pservers[i])) / ns.getScriptRam(SHARE_SCRIPT_NAME),
        );
        if (threads > 0) {
          ns.exec(SHARE_SCRIPT_NAME, pservers[i], { threads: threads, temporary: true });
        }
      }
      await ns.sleep(1000);
    }
  }

  const threads = ns.args[1];
  assertIsNumber(threads, "Invalid number of threads");
  // Run share script
  while (true) {
    nsx.runScriptOnAvailablePrivateRunners(true, true, true, SHARE_SCRIPT_NAME, threads);
    await ns.sleep(1000);
  }
}

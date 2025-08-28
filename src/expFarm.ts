import { AutocompleteData, NS } from "@ns";
import { assertIsNumber } from "/libs/utils";
import { DEFAULT_EXP_FARM_TARGETS, GROW_SCRIPT_NAME, LOG_FOLDER, WEAKEN_SCRIPT_NAME } from "/libs/constants";
import { NetscriptExtension } from "/libs/NetscriptExtension";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function autocomplete(data: AutocompleteData, flags: string[]): string[] {
    return [...data.servers];
}

interface Config {
    influenceStock: boolean;
}

const defaultConfig: Config = {
    influenceStock: false,
};

let customConfig: Config | null = null;
customConfig = <Config>{
    // influenceStock: false,
    influenceStock: true,
};

let nsx: NetscriptExtension;

/**
 * Usage: run expFarm.js 1000 joesguns
 * @param ns
 */
export async function main(ns: NS): Promise<void> {
    nsx = new NetscriptExtension(ns);
    nsx.killProcessesSpawnFromSameScript();

    const config = customConfig !== null ? customConfig : defaultConfig;

    ns.disableLog("ALL");

    const farmingThreads = ns.args[0];
    assertIsNumber(farmingThreads);

    let targets: string[] = [];
    if (ns.args.length > 1) {
        for (let i = 1; i < ns.args.length; i++) {
            targets.push(<string>ns.args[i]);
        }
    } else {
        targets = DEFAULT_EXP_FARM_TARGETS;
    }

    for (const target of targets) {
        // Prepare targets: grow to max, weaken to min
        while (true) {
            // Grow to max money
            const growThreads = ns.fileExists("Formulas.exe")
                ? ns.formulas.hacking.growThreads(ns.getServer(target), ns.getPlayer(), ns.getServerMaxMoney(target))
                : Math.ceil(
                      ns.growthAnalyze(
                          target,
                          ns.getServerMaxMoney(target) / (ns.getServerMoneyAvailable(target) || 1),
                      ),
                  );
            const growTime = ns.getGrowTime(target);
            if (growThreads > 0) {
                nsx.runScriptOnAvailablePrivateRunners(true, true, true, GROW_SCRIPT_NAME, growThreads, target, 0);
                await ns.sleep(growTime + 1000);
            }

            // Reduce security to min value
            const securityReducedPerWeakenThead = ns.weakenAnalyze(1);
            const weakenThreads = Math.ceil(
                (ns.getServerSecurityLevel(target) - ns.getServerMinSecurityLevel(target)) /
                    securityReducedPerWeakenThead,
            );
            if (weakenThreads > 0) {
                const weakenTime = ns.getWeakenTime(target);
                nsx.runScriptOnAvailablePrivateRunners(true, true, true, WEAKEN_SCRIPT_NAME, weakenThreads, target, 0);
                await ns.sleep(weakenTime + 1000);
            }

            // Check if server has been prepared successfully
            if (
                ns.getServerMoneyAvailable(target) === ns.getServerMaxMoney(target) &&
                ns.getServerSecurityLevel(target) === ns.getServerMinSecurityLevel(target)
            ) {
                break;
            }
        }
    }

    // Continuously run grow script to farm exp
    while (true) {
        const farmingThreadsPerTarget = Math.floor(farmingThreads / targets.length);
        const identifierPrefix = "expFarm-";
        for (const target of targets) {
            const logFilename = `${LOG_FOLDER}/${identifierPrefix}${target}.txt`;
            if (nsx.checkRunningProcesses(logFilename).stillHaveRunningProcess) {
                continue;
            }
            const result = nsx.runScriptOnAvailablePrivateRunners(
                true,
                true,
                false,
                GROW_SCRIPT_NAME,
                farmingThreadsPerTarget,
                target,
                0,
                config.influenceStock,
                `${identifierPrefix}${target}-${farmingThreadsPerTarget}`, // Identifier
            );
            if (!result.success) {
                ns.tprint(`Fail to start all required threads. Target: ${target}. Threads: ${farmingThreadsPerTarget}`);
            }
            ns.write(logFilename, JSON.stringify(result.runnerProcesses), "w");
        }
        await ns.sleep(1000);
    }
}

import {AutocompleteData, NS} from "@ns";
import {assertIsString} from "/libs/utils";
import {GROW_SCRIPT_NAME, HACK_SCRIPT_NAME, LOG_FOLDER, WEAKEN_SCRIPT_NAME} from "/libs/constants";
import {CompletedProgramName} from "/libs/Enums";
import {parseNumber} from "/libs/utils";
import {NetscriptExtension, RunnerProcess} from "/libs/NetscriptExtension";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function autocomplete(data: AutocompleteData, flags: string[]): string[] {
    return [...data.servers];
}

enum Action {
    UNKNOWN = "UNKNOWN",
    SKIP = "SKIP",
    WEAKEN = "WEAKEN",
    GROW = "GROW",
    HACK = "HACK"
}

interface Target {
    readonly hostname: string;
    readonly requiredHackingSkill: number;
    readonly maxMoney: number;
    readonly maxSecurity: number;
    readonly minSecurity: number;
    skip: boolean;
    currentAction: Action;
    currentActionCompleteAt: number;
    currentThreads: number;
    currentActionLatestPid: number;
    previousAction: Action;
    hackMoney: number;
    totalWeakenTime: number;
    totalGrowTime: number;
    totalHackTime: number;
    totalHackMoney: number;
}

interface Config {
    hackingSkillMultiplierWhenChoosingTarget: number;
    hackMoneyRatio: number;
    blacklistServers: Set<string>;
    forceKillAllScripts: boolean;
    influenceStock: boolean;
}

const defaultConfig: Config = {
    hackingSkillMultiplierWhenChoosingTarget: 0.3,
    hackMoneyRatio: 0.5,
    blacklistServers: new Set([
        "n00dles",
        "foodnstuff",
        "fulcrumassets"
    ]),
    forceKillAllScripts: true,
    influenceStock: false
};

let customConfig: Config | null = null;
customConfig = <Config>{
    // hackingSkillMultiplierWhenChoosingTarget: 0.5,
    hackingSkillMultiplierWhenChoosingTarget: 1,
    // hackMoneyRatio: .6,
    hackMoneyRatio: .99,
    blacklistServers: new Set([
        "n00dles",
        "foodnstuff",
        "joesguns", // Use this for simple exp-farming script
        "fulcrumassets"
    ]),
    forceKillAllScripts: defaultConfig.forceKillAllScripts,
    influenceStock: false,
    // influenceStock: true,
};

function isInfluenceStock(config: Config, action: Action) {
    if (!config.influenceStock) {
        return false;
    }
    return action === Action.GROW;
}

function printLog(ns: NS, targets: Target[]) {
    // Logging
    const hostnameMaxLength = 18;
    const actionMaxLength = 10;
    const threadMaxLength = 7;
    const timeMaxLength = 25;
    const hackMoneyMaxLength = 10;
    const latestPidMaxLength = 10;
    ns.print(
        `${"Hostname".padEnd(hostnameMaxLength)}${"Action".padStart(actionMaxLength)}${"Thread".padStart(threadMaxLength)}` +
        `${"HackMoney".padStart(hackMoneyMaxLength)}${"Time".padStart(timeMaxLength)}${"LatestPid".padStart(latestPidMaxLength)}`
    );
    targets
        .filter(target => {
            return !target.skip;
        })
        .forEach(target => {
            let remainingTime = target.currentActionCompleteAt - Date.now();
            if (remainingTime < 0) {
                remainingTime = 0;
            }
            ns.print(
                `${target.hostname.padEnd(hostnameMaxLength)}` +
                `${target.currentAction.padStart(actionMaxLength)}` +
                `${target.currentThreads.toString().padStart(threadMaxLength)}` +
                `${((target.hackMoney > 0) ? ns.format.number(target.hackMoney) : "").padStart(hackMoneyMaxLength)}` +
                `${ns.format.time(remainingTime).padStart(timeMaxLength)}` +
                `${(target.currentActionLatestPid !== 0) ? target.currentActionLatestPid.toString().padStart(latestPidMaxLength) : ""}`
            );
        });
}

function checkRunningProcessesAndUpdateTargetInfo(ns: NS, logFilename: string, target: Target): boolean {
    const resultOfCheckRunningProcesses = nsx.checkRunningProcesses(logFilename);
    if (resultOfCheckRunningProcesses.stillHaveRunningProcess) {
        // Use info from latest pid thread's arguments
        const latestProcess = resultOfCheckRunningProcesses
            .runningProcesses[resultOfCheckRunningProcesses.runningProcesses.length - 1];
        const loggingParams = latestProcess
            .scriptArgs[3]
            .toString()
            .split("|");
        target.currentAction = loggingParams[1] as Action;
        target.currentThreads = parseNumber(loggingParams[2]);
        target.currentActionCompleteAt = parseNumber(loggingParams[3]);
        target.currentActionLatestPid = latestProcess.pid;
        if (loggingParams[4] !== "") {
            target.hackMoney = parseNumber(loggingParams[4]);
        }
    } else {
        target.currentActionLatestPid = 0;
    }
    return resultOfCheckRunningProcesses.stillHaveRunningProcess;
}

let nsx: NetscriptExtension;

export async function main(ns: NS): Promise<void> {
    nsx = new NetscriptExtension(ns);
    nsx.killProcessesSpawnFromSameScript();

    const config = (customConfig !== null) ? customConfig : defaultConfig;

    ns.disableLog("ALL");
    ns.ui.openTail();
    ns.ui.resizeTail(800, 300);
    // ns.ui.moveTail(1750, 625);

    // Assume 1 core for all servers. This script focuses on simplicity, so we ignore the home server's number of cores.
    const securityReducedPerWeakenThead = ns.weakenAnalyze(1);

    const allHosts = nsx.scanBFS("home", function (host) {
        const hostname = host.hostname;
        if (config.forceKillAllScripts) {
            ns.scriptKill(WEAKEN_SCRIPT_NAME, hostname);
            ns.scriptKill(GROW_SCRIPT_NAME, hostname);
            ns.scriptKill(HACK_SCRIPT_NAME, hostname);
        }
        if (hostname === "home") {
            return;
        }
        ns.scp([HACK_SCRIPT_NAME, GROW_SCRIPT_NAME, WEAKEN_SCRIPT_NAME], host.hostname, "home");
    });
    // Find targets
    let targets = allHosts
        .filter(host => {
            return ns.getServerMaxMoney(host.hostname) > 0 && !config.blacklistServers.has(host.hostname);
        })
        .sort((a, b) => {
            return ns.getServerRequiredHackingLevel(b.hostname) - ns.getServerRequiredHackingLevel(a.hostname);
        })
        .map<Target>(host => {
            return <Target>{
                hostname: host.hostname,
                requiredHackingSkill: ns.getServerRequiredHackingLevel(host.hostname),
                maxMoney: ns.getServerMaxMoney(host.hostname),
                maxSecurity: ns.getServerBaseSecurityLevel(host.hostname),
                minSecurity: ns.getServerMinSecurityLevel(host.hostname),
                skip: false,
                currentAction: Action.UNKNOWN,
                currentActionCompleteAt: 0,
                currentThreads: 0,
                currentActionLatestPid: 0,
                previousAction: Action.UNKNOWN,
                hackMoney: 0,
                totalWeakenTime: 0,
                totalGrowTime: 0,
                totalHackTime: 0,
                totalHackMoney: 0
            };
        });
    // Force use targets from arguments, assume valid arguments
    if (ns.args.length > 0) {
        ns.tprint(`Force using targets: ${ns.args}`);
        targets = [];
        ns.args.forEach(hostname => {
            assertIsString(hostname);
            targets.push(<Target>{
                hostname: hostname,
                requiredHackingSkill: ns.getServerRequiredHackingLevel(hostname),
                maxMoney: ns.getServerMaxMoney(hostname),
                maxSecurity: ns.getServerBaseSecurityLevel(hostname),
                minSecurity: ns.getServerMinSecurityLevel(hostname),
                skip: false,
                currentAction: Action.UNKNOWN,
                currentActionCompleteAt: 0,
                currentThreads: 0,
                currentActionLatestPid: 0,
                previousAction: Action.UNKNOWN,
                hackMoney: 0,
                totalWeakenTime: 0,
                totalGrowTime: 0,
                totalHackTime: 0,
                totalHackMoney: 0
            });
        });
    }

    while (true) {
        // Sort based on money/s if we have access of Formula API
        if (ns.fileExists(CompletedProgramName.formulas, "home")) {
            const targetsMoneyPerSecond = new Map<string, number>();
            // Precalculate money/s of each server
            targets.forEach(target => {
                targetsMoneyPerSecond.set(target.hostname, nsx.getMoneyPerSecondHGW(target.hostname));
            });
            // Sort
            targets.sort((a, b) => {
                return targetsMoneyPerSecond.get(b.hostname)! - targetsMoneyPerSecond.get(a.hostname)!;
            });
        }

        for (const target of targets) {
            // Only attack servers with root access and has "potential" required hacking skill
            if (!ns.getServer(target.hostname).hasAdminRights
                || ns.getHackingLevel() * config.hackingSkillMultiplierWhenChoosingTarget < target.requiredHackingSkill) {
                target.skip = true;
                target.currentAction = Action.SKIP;
                continue;
            }
            target.skip = false;
            // target.currentAction = Action.UNKNOWN;
            // Skip if there is an ongoing process of growing/weakening/hacking
            const identifierPrefix = `controller-${target.hostname}`;
            const logFilename = `${LOG_FOLDER}/${identifierPrefix}.txt`;
            if (checkRunningProcessesAndUpdateTargetInfo(ns, logFilename, target)) {
                continue;
            }

            const targetCurrentSecurity = ns.getServerSecurityLevel(target.hostname);
            let targetCurrentMoney = ns.getServerMoneyAvailable(target.hostname);
            if (targetCurrentMoney < 10000) {
                // ns.tprint(`Detect overhacking. Server: ${target.hostname}. Current money: ${ns.format.number(targetCurrentMoney)}`);
                targetCurrentMoney = 10000;
            }
            let requiredThreads = 0;
            let action: Action;
            // Required time for action. This is only used for logging.
            let actionTime: number;
            let additionalLogInfo: string = "";

            // Check if:
            // - Security at min
            // - It's not the first time we attack this target
            // - Previous action is not HACK (We use HGW)
            const securityDiff = targetCurrentSecurity - target.minSecurity;
            if (securityDiff > 0.1 && targetCurrentSecurity !== target.maxSecurity && target.previousAction !== Action.HACK) {
                action = Action.WEAKEN;
                target.hackMoney = 0;
                requiredThreads = Math.ceil(securityDiff / securityReducedPerWeakenThead);
                const weakenTime = ns.getWeakenTime(target.hostname);
                actionTime = weakenTime;
                target.totalWeakenTime += weakenTime;
            }
            // Check if money at max
            else if ((targetCurrentMoney / target.maxMoney) <= 0.99) {
                action = Action.GROW;
                target.hackMoney = 0;
                requiredThreads = Math.ceil(
                    ns.growthAnalyze(target.hostname, target.maxMoney / targetCurrentMoney)
                );
                const growTime = ns.getGrowTime(target.hostname);
                actionTime = growTime;
                target.totalGrowTime += growTime;
            }
            // Hack
            else {
                action = Action.HACK;
                let hackMoney = target.maxMoney * config.hackMoneyRatio;
                // Leave at least 1m money in server except "n00dles" server. "n00dles" has too little money and it also
                // has extremely high serverGrowth
                if (target.hostname !== "n00dles") {
                    if (hackMoney > 1e6) {
                        hackMoney -= 1e6;
                    }
                }
                additionalLogInfo = hackMoney.toString();
                target.hackMoney = hackMoney;
                requiredThreads = Math.floor(ns.hackAnalyzeThreads(target.hostname, hackMoney));
                const hackTime = ns.getHackTime(target.hostname);
                actionTime = hackTime;
                target.totalHackTime += hackTime;
                target.totalHackMoney += hackMoney;
            }
            if (requiredThreads <= 0) {
                ns.tprint(`Detect invalid number of required threads`
                    + `. requiredThreads: ${requiredThreads}`
                    + `. Server: ${target.hostname}`
                    + `. Action: ${action} `
                    + `. Current money: ${ns.format.number(targetCurrentMoney)}`
                );
                continue;
            }
            if (requiredThreads > 15000) {
                ns.tprint(`Detect massive number of required threads`
                    + `. requiredThreads: ${requiredThreads}`
                    + `. Server: ${target.hostname}`
                    + `. Action: ${action} `
                    + `. Current money: ${ns.format.number(targetCurrentMoney)}`
                );
            }
            target.currentAction = action;
            // Set new previousAction
            target.previousAction = target.currentAction;
            target.currentThreads = requiredThreads;

            // Perform action on runners
            let scriptName;
            switch (action) {
                case Action.WEAKEN:
                    scriptName = WEAKEN_SCRIPT_NAME;
                    break;
                case Action.GROW:
                    scriptName = GROW_SCRIPT_NAME;
                    break;
                case Action.HACK:
                    scriptName = HACK_SCRIPT_NAME;
                    break;
            }
            const runnerProcesses: RunnerProcess[] = [];
            while (requiredThreads > 0) {
                target.currentActionCompleteAt = Math.ceil(Date.now() + actionTime);
                const result = nsx.runScriptOnAllAvailableRunners(
                    false,
                    scriptName,
                    {
                        threads: requiredThreads,
                        preventDuplicates: true
                    },
                    target.hostname,
                    0, // No delay
                    isInfluenceStock(config, action), // Influence stock with grow action
                    `${identifierPrefix}|${action}|${requiredThreads}|${target.currentActionCompleteAt}|${additionalLogInfo}` // For logging
                );
                runnerProcesses.push(...result.runnerProcesses);
                ns.write(logFilename, JSON.stringify(runnerProcesses), "w");
                if (result.success) {
                    break;
                } else {
                    requiredThreads = result.remainingThreads;
                }

                checkRunningProcessesAndUpdateTargetInfo(ns, logFilename, target);
                ns.clearLog();
                printLog(ns, targets);

                await ns.sleep(1000);
            }
        }

        ns.clearLog();
        printLog(ns, targets);

        await ns.sleep(1000);
    }
}

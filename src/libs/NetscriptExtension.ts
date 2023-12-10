import {AutocompleteData, NS, RunOptions, ScriptArg} from "@ns";
import {RESERVED_RAM_ON_HOME_SERVER, SHARE_SCRIPT_NAME, STOCK_MARKET_COMMISSION_FEE} from "/libs/constants";

export interface ScanServerInfo {
    readonly hostname: string;
    readonly depth: number;
    readonly canAccessFrom: string;
}

export interface RunnerProcess {
    readonly hostname: string,
    readonly availableThreads: number,
    readonly scriptName: string,
    readonly threads: number,
    readonly scriptArgs: (string | number | boolean)[]
    readonly pid: number
}

export interface RunScriptResult {
    readonly success: boolean,
    readonly remainingThreads: number, // Number of thread that we cannot run
    readonly runnerProcesses: RunnerProcess[]
}

export type NetscriptFlagsSchema = [string, string | number | boolean | string[]][];
export type NetscriptFlags = { [key: string]: ScriptArg | string[] };

export class NetscriptExtension {
    private ns: NS;

    constructor(nsContext: NS) {
        this.ns = nsContext;
    }

    scanDFS(
        startingHostname: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        action = (_: ScanServerInfo) => {
        }
    ) {
        const hosts: ScanServerInfo[] = [];
        const hostnames = new Set<string>();
        const scan = (
            currentHostname: string,
            previousHostname: string, depth: number,
            actionOfInternalScan: (hostname: ScanServerInfo) => void
        ) => {
            hostnames.add(currentHostname);
            const currentHost = <ScanServerInfo>{
                hostname: currentHostname,
                depth: depth,
                canAccessFrom: previousHostname
            };
            hosts.push(currentHost);
            actionOfInternalScan(currentHost);

            // Scan adjacent hosts
            const nextHostnames = this.ns.scan(currentHostname);
            nextHostnames.forEach(hostname => {
                if (hostnames.has(hostname)) {
                    return;
                }
                scan(hostname, currentHostname, depth + 1, actionOfInternalScan);
            });
        };

        scan(startingHostname, "", 0, action);
        return hosts;
    }

    scanBFS(
        startingHostname: string,
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        action = (_: ScanServerInfo) => {
        }
    ) {
        const startingHost = <ScanServerInfo>{
            hostname: startingHostname,
            depth: 0,
            canAccessFrom: ""
        };
        const hosts: ScanServerInfo[] = [startingHost];
        const hostnames = new Set<string>();
        hostnames.add(startingHostname);
        action(startingHost);

        let current = 0;
        while (current < hosts.length) {
            const currentServer = hosts[current];
            // Scan adjacent hosts
            const nextHostnames = this.ns.scan(currentServer.hostname);
            nextHostnames.forEach(hostname => {
                if (hostnames.has(hostname)) {
                    return;
                }
                const host = <ScanServerInfo>{
                    hostname: hostname,
                    depth: currentServer.depth + 1,
                    canAccessFrom: currentServer.hostname
                };
                hosts.push(host);
                hostnames.add(hostname);
                action(host);
            });
            ++current;
        }
        return hosts;
    }

    /**
     *
     * @param runners
     * @param killScriptBeforeRunning
     * @param scriptName This script must exist on home, it will be scp to each runner
     * @param threadOrOptions
     * @param scriptArgs
     */
    runScriptOnRunners(
        runners: string[],
        killScriptBeforeRunning = true,
        scriptName: string,
        threadOrOptions: number | RunOptions,
        ...scriptArgs: (string | number | boolean)[]): RunScriptResult {
        const ramPerThread = this.ns.getScriptRam(scriptName, "home");
        let requiredThreads: number | undefined;
        if (typeof threadOrOptions === "number") {
            requiredThreads = threadOrOptions;
        } else {
            requiredThreads = threadOrOptions.threads;
        }
        if (requiredThreads === undefined) {
            throw new Error(`Invalid param threadOrOptions: ${JSON.stringify(threadOrOptions)}`);
        }
        const runnerProcesses = [];
        for (const runner of runners) {
            let availableRAM = this.ns.getServerMaxRam(runner) - this.ns.getServerUsedRam(runner);
            if (runner === "home") {
                availableRAM -= RESERVED_RAM_ON_HOME_SERVER;
            }
            if (availableRAM <= 0) {
                continue;
            }
            const availableThreads = Math.floor(availableRAM / ramPerThread);
            if (availableThreads <= 0) {
                continue;
            }
            if (killScriptBeforeRunning) {
                this.ns.scriptKill(scriptName, runner);
            }
            this.ns.scp(scriptName, runner, "home");
            const threads = Math.min(availableThreads, requiredThreads);
            const pid = this.ns.exec(scriptName, runner, threads, ...scriptArgs);
            if (pid === 0) {
                continue;
            }
            runnerProcesses.push(<RunnerProcess>{
                hostname: runner,
                availableThreads: availableThreads,
                scriptName: scriptName,
                threads: threads,
                scriptArgs: scriptArgs,
                pid: pid,
            });
            requiredThreads -= threads;
            if (requiredThreads === 0) {
                break;
            }
        }
        return <RunScriptResult>{
            success: requiredThreads === 0,
            remainingThreads: requiredThreads,
            runnerProcesses: runnerProcesses
        };
    }

    runScriptOnAllAvailableRunners(
        killScriptBeforeRunning = true,
        scriptName: string,
        threadOrOptions: number | RunOptions,
        ...scriptArgs: (string | number | boolean)[]): RunScriptResult {
        // Find runners
        const runners = this.scanBFS("home")
            .filter(host => {
                return this.ns.getServerMaxRam(host.hostname) > 0 && this.ns.hasRootAccess(host.hostname);
            })
            .sort((a, b) => {
                return this.ns.getServerMaxRam(b.hostname) - this.ns.getServerMaxRam(a.hostname);
            })
            .map<string>(host => {
                return host.hostname;
            });
        return this.runScriptOnRunners(
            runners,
            killScriptBeforeRunning,
            scriptName,
            threadOrOptions,
            ...scriptArgs
        );
    }

    /**
     * "Private runners" means all purchased server and home server (if allowHomeServer set to true).
     *
     * @param reverseRunnerList If reverse, we only reverse list of purchased servers. Home server (if used) will always be
     * at the last of runner list
     * @param allowHomeServer
     * @param killScriptBeforeRunning
     * @param scriptName
     * @param threadOrOptions
     * @param scriptArgs
     */
    runScriptOnAvailablePrivateRunners(
        reverseRunnerList = false,
        allowHomeServer = true,
        killScriptBeforeRunning = true,
        scriptName: string,
        threadOrOptions: number | RunOptions,
        ...scriptArgs: (string | number | boolean)[]): RunScriptResult {
        const runners = this.ns.getPurchasedServers();
        if (reverseRunnerList) {
            runners.reverse();
        }
        if (allowHomeServer) {
            runners.push("home");
        }
        return this.runScriptOnRunners(
            runners,
            killScriptBeforeRunning,
            scriptName,
            threadOrOptions,
            ...scriptArgs
        );
    }

    checkRunningProcesses(
        logFilename: string):
        {
            stillHaveRunningProcess: boolean,
            runningProcesses: RunnerProcess[]
        } {
        let runnerProcessesInfoFromLog: RunnerProcess[] = [];
        try {
            const logData = this.ns.read(logFilename);
            if (logData !== "") {
                runnerProcessesInfoFromLog = JSON.parse(this.ns.read(logFilename));
            } else {
                return {
                    stillHaveRunningProcess: false,
                    runningProcesses: []
                };
            }
        } catch (ex) {
            this.ns.tprint(ex);
        }
        const runnerProcesses = runnerProcessesInfoFromLog.filter(runnerProcess => {
            return this.ns.isRunning(runnerProcess.pid);
        });
        this.ns.write(logFilename, JSON.stringify(runnerProcesses), "w");
        return {
            stillHaveRunningProcess: runnerProcesses.length > 0,
            runningProcesses: runnerProcesses
        };
    }

    printShareRAMEffect(minThreads: number, maxThreads: number, step: number) {
        for (let threads = minThreads; threads <= maxThreads; threads += step) {
            const ramPerThread = this.ns.getScriptRam(SHARE_SCRIPT_NAME, "home");
            const effect = 1 + (Math.log(1 + threads) / 25);
            this.ns.tprint(
                `Threads: ${threads}:. RAM: ${this.ns.formatRam(ramPerThread * threads)}`
                + `. Effect: ${(effect).toFixed(4)}`
            );
        }
    }

    getPrivateServersCost(): number {
        let cost = 0;
        this.ns.getPurchasedServers().forEach(hostname => {
            cost += this.ns.getPurchasedServerCost(this.ns.getServerMaxRam(hostname));
        });
        return cost;
    }

    getMoneyPerSecondHWGW(hostname: string) {
        const hackMoneyRatio = 0.99;

        // increasedSecurityFor1ThreadHacking is same for all servers
        const increasedSecurityFor1ThreadHacking = 0.002;
        // increasedSecurityFor1ThreadGrowing is same for all servers, it's 0 if server reaches max money
        const increasedSecurityFor1ThreadGrowing = 0.004;

        const server = this.ns.getServer(hostname);
        const player = this.ns.getPlayer();

        // Flow:
        // - Step 0: Hack (previous cycle): occurs at max money and min security
        // - Step 1: Weaken: need to find server's security after previous "Hack" before calling ns.formulas.hacking.weakenTime()
        // - Step 2: Grow
        // - Step 3: Weaken
        // - Step 4: Hack: occurs at max money and min security
        let weakenTime1 = 0;
        let growTime = 0;
        let weakenTime2 = 0;
        let hackTime = 0;

        // Step 0: Hack
        server.hackDifficulty = server.minDifficulty;
        server.moneyAvailable = server.moneyMax;
        const hackRequiredThreads = hackMoneyRatio / this.ns.formulas.hacking.hackPercent(server, player);
        let increasedSecurity = increasedSecurityFor1ThreadHacking * hackRequiredThreads;

        // Step 1: Weaken
        server.hackDifficulty = server.minDifficulty! + increasedSecurity;
        // Money has been reduced after step 0
        server.moneyAvailable = server.moneyMax! * (1 - hackMoneyRatio);
        weakenTime1 = this.ns.formulas.hacking.weakenTime(server, player);

        // Step 2: Grow
        server.hackDifficulty = server.minDifficulty;
        growTime = this.ns.formulas.hacking.growTime(server, player);
        const growRequiredThreads = this.ns.formulas.hacking.growThreads(server, player, server.moneyMax!);
        increasedSecurity = increasedSecurityFor1ThreadGrowing * growRequiredThreads;

        // Step 3: Weaken
        server.hackDifficulty = server.minDifficulty! + increasedSecurity;
        server.moneyAvailable = server.moneyMax;
        weakenTime2 = this.ns.formulas.hacking.weakenTime(server, player);

        // Step 4: Hack
        server.hackDifficulty = server.minDifficulty;
        hackTime = this.ns.formulas.hacking.hackTime(server, player);

        this.ns.print(`${hostname}: HWGW time: ${this.ns.tFormat(weakenTime1 + growTime + weakenTime2 + hackTime)}`);

        return (server.moneyMax! * hackMoneyRatio) / (weakenTime1 + growTime + weakenTime2 + hackTime);
    }

    getMoneyPerSecondHGW(hostname: string) {
        const hackMoneyRatio = 0.99;

        // increasedSecurityFor1ThreadHacking is same for all servers
        const increasedSecurityFor1ThreadHacking = 0.002;
        // increasedSecurityFor1ThreadGrowing is same for all servers, it's 0 if server reaches max money
        const increasedSecurityFor1ThreadGrowing = 0.004;

        const server = this.ns.getServer(hostname);
        const player = this.ns.getPlayer();

        // Flow:
        // - Step 0: Hack (previous cycle): occurs at max money and min security
        // - Step 1: Grow: need to find server's security after previous "Hack" before calling ns.formulas.hacking.growTime
        // - Step 2: Weaken
        // - Step 3: Hack: occurs at max money and min security
        // let weakenTime1 = 0;
        let growTime = 0;
        let weakenTime = 0;
        let hackTime = 0;

        // Step 0: Hack
        server.hackDifficulty = server.minDifficulty;
        server.moneyAvailable = server.moneyMax;
        const hackRequiredThreads = hackMoneyRatio / this.ns.formulas.hacking.hackPercent(server, player);
        let increasedSecurity = increasedSecurityFor1ThreadHacking * hackRequiredThreads;
        this.ns.print(`${hostname}: HGW increasedSecurity: ${increasedSecurity}`);

        // Step 1: Grow
        server.hackDifficulty = server.minDifficulty! + increasedSecurity;
        // Money has been reduced after step 0
        server.moneyAvailable = server.moneyMax! * (1 - hackMoneyRatio);
        growTime = this.ns.formulas.hacking.growTime(server, player);
        const growRequiredThreads = this.ns.formulas.hacking.growThreads(server, player, server.moneyMax!);
        increasedSecurity = increasedSecurityFor1ThreadGrowing * growRequiredThreads;

        // Step 2: Weaken
        server.hackDifficulty = server.minDifficulty! + increasedSecurity;
        server.moneyAvailable = server.moneyMax;
        weakenTime = this.ns.formulas.hacking.weakenTime(server, player);

        // Step 3: Hack
        server.hackDifficulty = server.minDifficulty;
        hackTime = this.ns.formulas.hacking.hackTime(server, player);

        this.ns.print(`${hostname}: HGW time: ${this.ns.tFormat(growTime + weakenTime + hackTime)}`);

        return (server.moneyMax! * hackMoneyRatio) / (growTime + weakenTime + hackTime);
    }

    killProcessesSpawnFromSameScript() {
        const currentScriptName = this.ns.getScriptName();
        this.ns.ps().forEach(process => {
            if (process.filename !== currentScriptName || process.pid === this.ns.pid) {
                return;
            }
            this.ns.kill(process.pid);
        });
    }

    calculateStockStats(): {
        currentProfit: number,
        estimatedTotalProfit: number,
        currentWorth: number
    } {
        let currentProfit = 0;
        let currentWorth = 0;
        this.ns.stock.getSymbols().forEach(stockSymbol => {
            const position = this.ns.stock.getPosition(stockSymbol);
            const sharesLong = position[0];
            const avgLongPrice = position[1];
            const sharesShort = position[2];
            const avgShortPrice = position[3];
            if (sharesLong === 0 && sharesShort === 0) {
                return;
            }
            if (sharesLong > 0) {
                const longSharesProfit = sharesLong * (this.ns.stock.getBidPrice(stockSymbol) - avgLongPrice) - (2 * STOCK_MARKET_COMMISSION_FEE);
                const longSharesWorth = this.ns.stock.getSaleGain(stockSymbol, sharesLong, "Long");
                currentProfit += longSharesProfit;
                currentWorth += longSharesWorth;
            }
            if (sharesShort > 0) {
                const shortSharesProfit = sharesShort * (avgShortPrice - this.ns.stock.getAskPrice(stockSymbol)) - (2 * STOCK_MARKET_COMMISSION_FEE);
                const shortSharesWorth = this.ns.stock.getSaleGain(stockSymbol, sharesShort, "Short");
                currentProfit += shortSharesProfit;
                currentWorth += shortSharesWorth;
            }
        });
        // We ignore:
        // - All other incomes
        // - All expenses except private servers' cost
        // Formula: currentMoney + currentWorth = hackingProfit + stockTradingProfit - expenses
        const privateServersCost = this.getPrivateServersCost();
        const estimatedTotalProfit = this.ns.getPlayer().money + currentWorth - this.ns.getMoneySources().sinceInstall.hacking
            + privateServersCost;
        return {
            currentProfit: currentProfit,
            estimatedTotalProfit: estimatedTotalProfit,
            currentWorth: currentWorth,
        };
    }
}

export function parseAutoCompleteDataFromDefaultConfig(data: AutocompleteData, defaultConfig: NetscriptFlagsSchema) {
    data.flags(defaultConfig);
    return ["true", "false"];
}

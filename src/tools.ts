import {NS} from "@ns";
import {
    NetscriptExtension,
    NetscriptFlagsSchema,
    parseAutoCompleteDataFromDefaultConfig
} from "/libs/NetscriptExtension";
import {GROW_SCRIPT_NAME, HACK_SCRIPT_NAME, STOCK_HISTORY_LOGS_PREFIX, WEAKEN_SCRIPT_NAME} from "/libs/constants";

export function autocomplete(data: any, args: string[]) {
    return parseAutoCompleteDataFromDefaultConfig(data, defaultConfig);
}

const defaultConfig: NetscriptFlagsSchema = [
    ["killall", false],
    ["sellAllStocks", false],
    ["deleteStockHistoryLogs", false],
    ["evalPrint", ""],
    ["resetController", false],
    ["eatNoodles", false],
    ["deleteAllScripts", false],
];

let nsx: NetscriptExtension;

/**
 * Usage:
 * run tools.js killall
 *
 * @param ns
 */
export async function main(ns: NS): Promise<void> {
    nsx = new NetscriptExtension(ns);

    ns.disableLog("ALL");
    // ns.clearLog();
    // ns.tail();

    const config = ns.flags(defaultConfig);
    if (config.killall) {
        nsx.scanBFS("home", host => {
            ns.killall(host.hostname, true);
        });
    }
    if (config.sellAllStocks) {
        ns.stock.getSymbols().forEach(symbol => {
            const position = ns.stock.getPosition(symbol);
            ns.stock.sellStock(symbol, position[0]);
            // ns.stock.sellShort(symbol, position[2]);
        });
    }
    if (config.deleteStockHistoryLogs) {
        ns.ls("home", STOCK_HISTORY_LOGS_PREFIX).forEach(filename => {
            ns.rm(filename);
        });
    }
    if (config.evalPrint !== "") {
        ns.tprint(eval(<string>config.evalPrint));
    }
    if (config.resetController) {
        ns.scriptKill("controller2.js", "home");
        nsx.scanBFS("home")
            .filter(host => {
                return ns.getServerMaxRam(host.hostname) > 0 && ns.hasRootAccess(host.hostname);
            })
            .forEach(host => {
                const hostname = host.hostname;
                ns.scriptKill(WEAKEN_SCRIPT_NAME, hostname);
                ns.scriptKill(GROW_SCRIPT_NAME, hostname);
                ns.scriptKill(HACK_SCRIPT_NAME, hostname);
            });
    }
    if (config.eatNoodles) {
        const doc: Document = eval("document");
        const buttons = doc.querySelectorAll<HTMLButtonElement>("#root > div:nth-of-type(2) > div:nth-of-type(2) > button")!;
        let eatNoodlesButton = null;
        for (const button of buttons) {
            if (button.textContent === "Eat noodles") {
                eatNoodlesButton = button;
                break;
            }
        }
        if (eatNoodlesButton === null) {
            return;
        }
        let count = 0;
        while (true) {
            ++count;
            eatNoodlesButton.click();
            if (count % 100 === 0) {
                await ns.sleep(200);
            }
            if (count > 1e5) {
                ns.print("Finish");
                break;
            }
        }
    }
    if (config.deleteAllScripts) {
        ns.ls("home", ".js").forEach(filename => {
            ns.rm(filename);
        });
    }
}

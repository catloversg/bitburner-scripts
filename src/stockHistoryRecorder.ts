import {NS} from "@ns";
import {MAX_STOCK_HISTORY_RECORD, STOCK_HISTORY_LOGS_PREFIX} from "/libs/constants";
import {NetscriptExtension} from "/libs/NetscriptExtension";

/**
 * Use Record instead of Map, so we can use JSON.stringify easier
 */
export interface StockTraderData {
    stockPrices: Record<string, number[]>;
    stockForecasts: Record<string, number[]>;
}

let nsx: NetscriptExtension;

export async function main(ns: NS): Promise<void> {
    nsx = new NetscriptExtension(ns);
    nsx.killProcessesSpawnFromSameScript();

    ns.disableLog("ALL");
    ns.tail();

    const stockSymbols = ns.stock.getSymbols();
    const stockTraderData: StockTraderData = {
        stockPrices: {},
        stockForecasts: {}
    };
    let rotateLog = true;
    let logFilename = "";
    while (true) {
        // Only store 10 log files
        if (ns.ls("home", STOCK_HISTORY_LOGS_PREFIX).length >= 10) {
            break;
        }
        // Rotate log
        if (rotateLog) {
            // Init
            stockSymbols.forEach(symbol => {
                stockTraderData.stockPrices[symbol] = [ns.stock.getPrice(symbol)];
                stockTraderData.stockForecasts[symbol] = [ns.stock.getForecast(symbol)];
            });
            logFilename = `${STOCK_HISTORY_LOGS_PREFIX}${Date.now()}.txt`;
            rotateLog = false;
        }
        // Check if stock price changed
        const isPriceChanged = stockSymbols.some(symbol => {
            const records = stockTraderData.stockPrices[symbol];
            return records[records.length - 1] !== ns.stock.getPrice(symbol);
        });
        if (!isPriceChanged) {
            await ns.sleep(2000);
            continue;
        }
        // Record new stock price
        stockSymbols.forEach(symbol => {
            const records = stockTraderData.stockPrices[symbol];
            records.push(ns.stock.getPrice(symbol));
            stockTraderData.stockForecasts[symbol].push(ns.stock.getForecast(symbol));
            if (records.length === MAX_STOCK_HISTORY_RECORD) {
                rotateLog = true;
            }
        });
        ns.write(logFilename, JSON.stringify(stockTraderData), "w");
        await ns.sleep(2000);
    }
}

import {NS} from "@ns";
import {STOCK_MARKET_COMMISSION_FEE} from "/libs/constants";
import {NetscriptExtension} from "/libs/NetscriptExtension";

interface Config {
    reservedMoney: number;
    buyLongThreshold: number;
    sellLongThreshold: number;
    buyShortThreshold: number;
    sellShortThreshold: number;
    enableShort: boolean;
}

const defaultConfig: Config = {
    reservedMoney: 1e6,
    buyLongThreshold: 0.6,
    sellLongThreshold: 0.55,
    buyShortThreshold: 0.4,
    sellShortThreshold: 0.45,
    enableShort: false,
};

let customConfig: Config | null = null;
customConfig = <Config>{
    reservedMoney: 1e6,
    buyLongThreshold: 0.55,
    sellLongThreshold: 0.53,
    buyShortThreshold: defaultConfig.buyShortThreshold,
    sellShortThreshold: defaultConfig.sellShortThreshold,
    enableShort: true,
};

function printStockData(ns: NS) {
    const stockStats = nsx.calculateStockStats();
    ns.print(`Current profit: ${ns.format.number(stockStats.currentProfit)}`);
    ns.print(`Estimated total profit: ${ns.format.number(stockStats.estimatedTotalProfit)}`);
    ns.print(`Current worth: ${ns.format.number(stockStats.currentWorth)}`);
}

async function tradeStocksWithS4MarketData(ns: NS, config: Config) {
    while (true) {
        const stockSymbols = ns.stock.getSymbols()
            .sort(function (a, b) {
                return Math.abs(0.5 - ns.stock.getForecast(b)) - Math.abs(0.5 - ns.stock.getForecast(a));
            });
        for (const stockSymbol of stockSymbols) {
            let availableMoney = ns.getPlayer().money - config.reservedMoney;
            if (availableMoney <= 0) {
                break;
            }
            const position = ns.stock.getPosition(stockSymbol);
            const sharesLong = position[0];
            const forecast = ns.stock.getForecast(stockSymbol);

            // Check if we want to sell long
            if (forecast < config.sellLongThreshold && sharesLong > 0) {
                ns.stock.sellStock(stockSymbol, sharesLong);
                availableMoney = ns.getPlayer().money - config.reservedMoney;
            }

            // Check if we want to buy long
            if (forecast > config.buyLongThreshold) {
                const maxSharesForBuying = ns.stock.getMaxShares(stockSymbol) - sharesLong;
                const askPrice = ns.stock.getAskPrice(stockSymbol);
                const affordableShares = Math.floor(
                    (availableMoney - STOCK_MARKET_COMMISSION_FEE) / askPrice
                );
                const shares = Math.min(affordableShares, maxSharesForBuying);
                if (shares <= 0) {
                    continue;
                }
                ns.stock.buyStock(stockSymbol, shares);
                availableMoney = ns.getPlayer().money - config.reservedMoney;
            }
        }
        ns.clearLog();
        printStockData(ns);
        await ns.sleep(2000);
    }
}

async function tradeStocksWithoutS4MarketData(ns: NS, config: Config) {
    function getForecast(priceChanges: number[]) {
        const numberOfTimesPriceIncreased = priceChanges.reduce((accumulator, currentValue) => {
            return accumulator + ((currentValue > 1) ? 1 : 0);
        }, 0);
        return numberOfTimesPriceIncreased / priceChanges.length;
    }

    const stockPrices = new Map<string, number[]>();
    const stockPriceChanges = new Map<string, number[]>();
    let stockSymbols = ns.stock.getSymbols();
    // Init
    stockSymbols.forEach(symbol => {
        stockPrices.set(symbol, [ns.stock.getPrice(symbol)]);
        stockPriceChanges.set(symbol, []);
    });
    while (true) {
        const numberOfSamples = 15;
        // Check if stock price changed
        const isPriceChanged = stockSymbols.some(symbol => {
            const symbolPrices = stockPrices.get(symbol)!;
            return symbolPrices[symbolPrices.length - 1] !== ns.stock.getPrice(symbol);
        });
        if (!isPriceChanged) {
            ns.clearLog();
            printStockData(ns);
            await ns.sleep(1000);
            continue;
        }
        // Check if we have enough samples
        const haveEnoughSamples = stockSymbols.every((symbol) => {
            return stockPriceChanges.get(symbol)!.length > numberOfSamples;
        });
        // Record new price
        stockSymbols.forEach(symbol => {
            const symbolPrices = stockPrices.get(symbol)!;
            const symbolPriceChanges = stockPriceChanges.get(symbol)!;
            symbolPrices.push(ns.stock.getPrice(symbol));
            if (symbolPrices.length > 1) {
                symbolPriceChanges.push(symbolPrices[symbolPrices.length - 1] / symbolPrices[symbolPrices.length - 2]);
            }
            if (haveEnoughSamples) {
                symbolPrices.shift();
                symbolPriceChanges.shift();
            }
        });
        // Only proceed if we have enough samples
        if (!haveEnoughSamples) {
            ns.clearLog();
            printStockData(ns);
            await ns.sleep(1000);
            continue;
        }

        stockSymbols = stockSymbols
            .sort(function (a, b) {
                return Math.abs(0.5 - getForecast(stockPriceChanges.get(b)!)) - Math.abs(0.5 - getForecast(stockPriceChanges.get(a)!));
            });
        for (const stockSymbol of stockSymbols) {
            let availableMoney = ns.getPlayer().money - config.reservedMoney;
            if (availableMoney <= 0) {
                break;
            }
            const position = ns.stock.getPosition(stockSymbol);
            const sharesLong = position[0];
            const sharesShort = position[2];
            const forecast = getForecast(stockPriceChanges.get(stockSymbol)!);

            // Check if we want to sell long
            if (forecast < 0.4 && sharesLong > 0) {
                ns.stock.sellStock(stockSymbol, sharesLong);
                availableMoney = ns.getPlayer().money - config.reservedMoney;
            }
            // Check if we want to sell short
            if (forecast > 0.5 && sharesShort > 0 && config.enableShort) {
                ns.stock.sellShort(stockSymbol, sharesShort);
                availableMoney = ns.getPlayer().money - config.reservedMoney;
            }

            // Check if we want to buy long
            if (forecast > 0.7) {
                const maxSharesForBuying = ns.stock.getMaxShares(stockSymbol) - sharesLong;
                const askPrice = ns.stock.getAskPrice(stockSymbol);
                const affordableShares = Math.floor(
                    (availableMoney - STOCK_MARKET_COMMISSION_FEE) / askPrice
                );
                const shares = Math.min(affordableShares, maxSharesForBuying);
                if (shares <= 0) {
                    continue;
                }
                ns.stock.buyStock(stockSymbol, shares);
                availableMoney = ns.getPlayer().money - config.reservedMoney;
            }

            // Check if we want to buy short
            if (forecast < 0.3 && config.enableShort) {
                const maxSharesForBuying = ns.stock.getMaxShares(stockSymbol) - sharesShort;
                const bidPrice = ns.stock.getBidPrice(stockSymbol);
                const affordableShares = Math.floor(
                    (availableMoney - STOCK_MARKET_COMMISSION_FEE) / bidPrice
                );
                const shares = Math.min(affordableShares, maxSharesForBuying);
                if (shares <= 0) {
                    continue;
                }
                ns.stock.buyShort(stockSymbol, shares);
            }
        }
        ns.clearLog();
        printStockData(ns);
        await ns.sleep(1000);
    }
}

let nsx: NetscriptExtension;

export async function main(ns: NS): Promise<void> {
    nsx = new NetscriptExtension(ns);
    nsx.killProcessesSpawnFromSameScript();

    const config = (customConfig !== null) ? customConfig : defaultConfig;

    ns.disableLog("ALL");

    if (!ns.stock.hasWseAccount()) {
        ns.tprint("Please buy WSE account");
        return;
    }
    if (!ns.stock.hasTixApiAccess()) {
        ns.tprint("Please buy TIX API access");
        return;
    }
    // ns.ui.openTail();
    // ns.ui.resizeTail(330, 110);
    // ns.ui.moveTail(2000, 0);

    if (ns.stock.has4SDataTixApi()) {
        await tradeStocksWithS4MarketData(ns, config);
    } else {
        await tradeStocksWithoutS4MarketData(ns, config);
    }
}

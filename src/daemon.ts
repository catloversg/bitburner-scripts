import {AutocompleteData, NS} from "@ns";
import {
    NetscriptExtension,
    NetscriptFlags,
    NetscriptFlagsSchema,
    parseAutoCompleteDataFromDefaultConfig
} from "/libs/NetscriptExtension";
import {
    buyOptimalAmountOfInputMaterials,
    buyTeaAndThrowPartyForAllDivisions,
    clearPurchaseOrders,
    getProductMarkup,
    loopAllDivisionsAndCities,
    setOptimalSellingPriceForEverything,
    setSmartSupplyData,
    showWarning,
    validateProductMarkupMap
} from "/corporationUtils";
import {CorpState, UnlockName} from "/corporationFormulas";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function autocomplete(data: AutocompleteData, flags: string[]): string[] {
    return parseAutoCompleteDataFromDefaultConfig(data, defaultConfig);
}

let ns: NS;
let nsx: NetscriptExtension;
let config: NetscriptFlags;

const defaultConfig: NetscriptFlagsSchema = [
    ["maintainCorporation", false],
];

function init(nsContext: NS) {
    ns = nsContext;
}

export async function main(nsContext: NS): Promise<void> {
    init(nsContext);
    nsx = new NetscriptExtension(ns);
    nsx.killProcessesSpawnFromSameScript();

    config = ns.flags(defaultConfig);

    ns.disableLog("ALL");
    // ns.tail();
    ns.clearLog();

    if (config.maintainCorporation === true && ns.corporation.hasCorporation()) {
        clearPurchaseOrders(ns);

        // Clear purchase orders when script exits
        ns.atExit(() => {
            clearPurchaseOrders(ns);
        });
        let smartSupplyHasBeenEnabledEverywhere = false;
        const warehouseCongestionData = new Map<string, number>();
        // noinspection InfiniteLoopJS
        while (true) {
            // Calculate product's markup ASAP
            if (ns.corporation.getCorporation().prevState === CorpState.PRODUCTION) {
                loopAllDivisionsAndCities(ns, (divisionName, city) => {
                    const division = ns.corporation.getDivision(divisionName);
                    if (!division.makesProducts) {
                        return;
                    }
                    const industryData = ns.corporation.getIndustryData(division.type);
                    const office = ns.corporation.getOffice(divisionName, city);
                    for (const productName of division.products) {
                        const product = ns.corporation.getProduct(divisionName, city, productName);
                        if (product.developmentProgress < 100) {
                            continue;
                        }
                        getProductMarkup(
                            division,
                            industryData,
                            city,
                            product,
                            office
                        );
                    }
                });
            }

            buyTeaAndThrowPartyForAllDivisions(ns);

            // Smart Supply
            if (!smartSupplyHasBeenEnabledEverywhere) {
                // Enable Smart Supply everywhere if we have unlocked this feature
                if (ns.corporation.hasUnlock(UnlockName.SMART_SUPPLY)) {
                    loopAllDivisionsAndCities(ns, (divisionName, city) => {
                        ns.corporation.setSmartSupply(divisionName, city, true);
                    });
                    smartSupplyHasBeenEnabledEverywhere = true;
                }
                if (!smartSupplyHasBeenEnabledEverywhere) {
                    setSmartSupplyData(ns);
                    buyOptimalAmountOfInputMaterials(ns, warehouseCongestionData);
                }
            }

            // Market TA2
            await setOptimalSellingPriceForEverything(ns);

            if (ns.corporation.getCorporation().prevState === CorpState.START) {
                loopAllDivisionsAndCities(ns, (divisionName, city) => {
                    const office = ns.corporation.getOffice(divisionName, city);
                    // Check for Unassigned employees
                    const unassignedEmployees = office.employeeJobs.Unassigned;
                    if (unassignedEmployees > 0) {
                        showWarning(
                            ns,
                            `WARNING: There are ${unassignedEmployees} unassigned employees in division ${divisionName}`
                        );
                    }
                });
                // Remove nonexistent product in productMarkupMap
                validateProductMarkupMap(ns);
            }
            await ns.corporation.nextUpdate();
        }
    }
}

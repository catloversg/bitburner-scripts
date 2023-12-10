import {AutocompleteData, NS} from "@ns";
import {
    NetscriptExtension,
    NetscriptFlags,
    NetscriptFlagsSchema,
    parseAutoCompleteDataFromDefaultConfig
} from "/libs/NetscriptExtension";
import {getRecordKeys} from "/libs/Record";
import {
    buyOptimalAmountOfInputMaterials,
    buyTeaAndThrowPartyForAllDivisions,
    loopAllDivisionsAndCities,
    setOptimalSellingPrice
} from "/corporationUtils";
import {UnlockName} from "/corporationFormulas";

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
        // Clear purchase when script exits
        ns.atExit(() => {
            loopAllDivisionsAndCities(ns, (divisionName, city) => {
                if (ns.corporation.getWarehouse(divisionName, city).smartSupplyEnabled) {
                    return;
                }
                const division = ns.corporation.getDivision(divisionName);
                const industrialData = ns.corporation.getIndustryData(division.type);
                for (const materialName of getRecordKeys(industrialData.requiredMaterials)) {
                    // Clear purchase
                    ns.corporation.buyMaterial(divisionName, city, materialName, 0);
                }
            });
        });
        let smartSupplyHasBeenEnabledEverywhere = false;
        const warehouseCongestionData = new Map<string, number>();
        // noinspection InfiniteLoopJS
        while (true) {
            buyTeaAndThrowPartyForAllDivisions(ns);

            if (!smartSupplyHasBeenEnabledEverywhere) {
                // Enable Smart Supply everywhere if we have unlocked this feature
                if (ns.corporation.hasUnlock(UnlockName.SMART_SUPPLY)) {
                    loopAllDivisionsAndCities(ns, (divisionName, city) => {
                        ns.corporation.setSmartSupply(divisionName, city, true);
                    });
                    smartSupplyHasBeenEnabledEverywhere = true;
                }
                if (!smartSupplyHasBeenEnabledEverywhere) {
                    buyOptimalAmountOfInputMaterials(ns, warehouseCongestionData);
                }
            }

            await setOptimalSellingPrice(ns);
            await ns.corporation.nextUpdate();
        }
    }
}

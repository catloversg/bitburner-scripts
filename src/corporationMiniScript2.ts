// noinspection DuplicatedCode
import {AutocompleteData, CityName, CorpMaterialName, NS} from "@ns";
import {NetscriptFlagsSchema} from "/libs/NetscriptExtension";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function autocomplete(data: AutocompleteData, flags: string[]): string[] {
    return ["--divisionName", "Agriculture"];
}

export const cities = ["Sector-12", "Aevum", "Chongqing", "New Tokyo", "Ishima", "Volhaven"] as const;

const defaultConfig: NetscriptFlagsSchema = [
    ["divisionName", "Agriculture"],
];

async function stockMaterials(
    ns: NS,
    divisionName: string,
    cities: readonly CityName[],
    materials: {
        name: CorpMaterialName;
        amount: number;
    }[]
) {
    while (true) {
        let finish = true;
        for (const city of cities) {
            for (const material of materials) {
                const storedAmount = ns.corporation.getMaterial(divisionName, city, material.name).stored;
                if (storedAmount === material.amount) {
                    ns.corporation.buyMaterial(divisionName, city, material.name, 0);
                    ns.corporation.sellMaterial(divisionName, city, material.name, "0", "MP");
                    continue;
                }
                // Buy
                if (storedAmount < material.amount) {
                    ns.corporation.buyMaterial(divisionName, city, material.name, (material.amount - storedAmount) / 10);
                    ns.corporation.sellMaterial(divisionName, city, material.name, "0", "MP");
                    finish = false;
                }
            }
        }
        if (finish) {
            break;
        }
        await ns.corporation.nextUpdate();
    }
}

export async function main(ns: NS): Promise<void> {
    const config = ns.flags(defaultConfig);
    const divisionName = config.divisionName as string;

    const option = {
        aiCores: 2114,
        hardware: 2404,
        realEstate: 124960,
        robots: 23,
    };

    for (const city of cities) {
        ns.corporation.sellMaterial(divisionName, city, "Plants", "MAX", "MP");
        ns.corporation.sellMaterial(divisionName, city, "Food", "MAX", "MP");
    }

    await stockMaterials(ns, divisionName, cities, [
        {name: "AI Cores", amount: option.aiCores},
        {name: "Hardware", amount: option.hardware},
        {name: "Real Estate", amount: option.realEstate},
        {name: "Robots", amount: option.robots}
    ]);
}

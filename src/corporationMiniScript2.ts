// noinspection DuplicatedCode
import {AutocompleteData, NS} from "@ns";
import {NetscriptFlagsSchema} from "/libs/NetscriptExtension";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function autocomplete(data: AutocompleteData, flags: string[]): string[] {
    return ["--divisionName", "Agriculture"];
}

enum CityName {
    Aevum = "Aevum",
    Chongqing = "Chongqing",
    Sector12 = "Sector-12",
    NewTokyo = "New Tokyo",
    Ishima = "Ishima",
    Volhaven = "Volhaven",
}

const cities: CityName[] = [
    CityName.Sector12,
    CityName.Aevum,
    CityName.Chongqing,
    CityName.NewTokyo,
    CityName.Ishima,
    CityName.Volhaven
];

const defaultConfig: NetscriptFlagsSchema = [
    ["divisionName", "Agriculture"],
];

async function stockMaterials(
    ns: NS,
    divisionName: string,
    cities: CityName[],
    materials: {
        name: string;
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

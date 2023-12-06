import {Corporation, NS} from "@ns";
import {
    NetscriptExtension,
    NetscriptFlags,
    NetscriptFlagsSchema,
    parseAutoCompleteDataFromDefaultConfig
} from "/libs/NetscriptExtension";
import {CityName, CorpEmployeePosition, MaterialName, UnlockName, UpgradeName} from "/corporationFormulas";
import {
    assignJobs,
    buyAdvert,
    buyMaterials,
    buyUnlock,
    buyUpgrade,
    cities,
    DivisionName,
    exportString,
    improveEmployeeStats,
    initDivision,
    upgradeOffices,
    upgradeWarehouse,
    waitUntilHavingEnoughResearchPoints
} from "/corporationUtils";

export function autocomplete(data: any, args: string[]) {
    return parseAutoCompleteDataFromDefaultConfig(data, defaultConfig);
}

interface Round1Option {
    warehouseLevel: number;
    smartStorageLevel: number;
    smartFactoriesLevel: number;
    advertLevel: number;
    aiCores: number;
    hardware: number;
    realEstate: number;
    robots: number;
}

const PrecalculatedRound1Option = {
    OPTION1: <Round1Option>{
        warehouseLevel: 6,
        smartStorageLevel: 9,
        smartFactoriesLevel: 0,
        advertLevel: 2,

        // 0.85: ×201.428. Safe
        // aiCores: 2069,
        // hardware: 2354,
        // realEstate: 122800,
        // robots: 14,

        // 0.87: ×205.347
        aiCores: 2114,
        hardware: 2404,
        realEstate: 124960,
        robots: 23,
    },
    // Only use if buying Smart Supply. Offer: 320-330b
    OPTION2: <Round1Option>{
        warehouseLevel: 5,
        smartStorageLevel: 3,
        smartFactoriesLevel: 0,
        advertLevel: 1,

        // 0.88: ×132.013
        aiCores: 1109,
        hardware: 1288,
        realEstate: 76752,
        robots: 0,
    },
} as const;

interface OfficeOption {
    size: number;
    operations: number;
    engineer: number;
    business: number;
    management: number;
    research: number;
}

interface Round2Option {
    smartStorageLevel: number;
    smartFactoriesLevel: number;
    agriculture: {
        office: OfficeOption;
        warehouseLevel: number;
        advertLevel: number;
        aiCores: number;
        hardware: number;
        realEstate: number;
        robots: number;
    };
    chemical: {
        office: OfficeOption;
        warehouseLevel: number;
        aiCores: number;
        hardware: number;
        realEstate: number;
        robots: number;
    };
    waitForChemicalRP: number;
}

const PrecalculatedRound2Option = {
    // Minimum funds at start: 431b. OPTION1 is more stable. Offer: 11-11.4t
    OPTION1: <Round2Option>{
        smartStorageLevel: 25,
        smartFactoriesLevel: 16,
        agriculture: {
            office: <OfficeOption>{
                size: 6,
                operations: 2,
                engineer: 1,
                business: 2,
                management: 1,
                research: 0,
            },
            warehouseLevel: 15,
            advertLevel: 8,

            // 0.79: ×793.812
            // aiCores: 8342,
            // hardware: 9325,
            // realEstate: 423921,
            // robots: 1268,

            // 0.8: ×804.175
            aiCores: 8446,
            hardware: 9440,
            realEstate: 428895,
            robots: 1289,
        },
        chemical: {
            office: <OfficeOption>{
                size: 3,
                operations: 1,
                engineer: 1,
                business: 1,
                management: 0,
                research: 0,
            },
            warehouseLevel: 2,
            aiCores: 1732,
            hardware: 3220,
            realEstate: 55306,
            robots: 58,
        },
        // Agriculture RP ~460
        // Chemical RP ~300
        waitForChemicalRP: 300,
    }
} as const;

let ns: NS;
let nsx: NetscriptExtension;
let corp: Corporation;
let config: NetscriptFlags;
let mainProductDevelopmentCity: CityName;
let supportProductDevelopmentCities: CityName[];

const defaultConfig: NetscriptFlagsSchema = [
    ["selfFund", false],
    ["round1", false],
    ["round2", false],
    ["round3", false],
    ["test", false],
    ["help", false],
];

function init(nsContext: NS) {
    ns = nsContext;
    corp = ns.corporation;
    mainProductDevelopmentCity = ns.enums.CityName.Sector12;
    supportProductDevelopmentCities = Object.values(ns.enums.CityName)
        .filter(cityName => cityName !== mainProductDevelopmentCity);
}

async function round1(option: Round1Option = PrecalculatedRound1Option.OPTION1) {
    ns.print(`Use: ${JSON.stringify(option)}`);
    // Init division Agriculture
    await initDivision(ns, DivisionName.AGRICULTURE, 3, option.warehouseLevel);
    buyUpgrade(ns, UpgradeName.SMART_STORAGE, option.smartStorageLevel);
    buyUpgrade(ns, UpgradeName.SMART_FACTORIES, option.smartFactoriesLevel);
    buyAdvert(ns, DivisionName.AGRICULTURE, option.advertLevel);

    await improveEmployeeStats(ns, DivisionName.AGRICULTURE);

    // Sell produced materials
    for (const city of cities) {
        corp.sellMaterial(DivisionName.AGRICULTURE, city, MaterialName.PLANTS, "MAX", "MP");
        corp.sellMaterial(DivisionName.AGRICULTURE, city, MaterialName.FOOD, "MAX", "MP");
    }

    // Reassign jobs
    await assignJobs(ns, DivisionName.AGRICULTURE, cities, [
        {name: CorpEmployeePosition.OPERATIONS, amount: 1},
        {name: CorpEmployeePosition.ENGINEER, amount: 1},
        {name: CorpEmployeePosition.BUSINESS, amount: 1}
    ]);

    // Buy boost materials
    await buyMaterials(ns, DivisionName.AGRICULTURE, cities, [
        {name: MaterialName.AI_CORES, amount: option.aiCores},
        {name: MaterialName.HARDWARE, amount: option.hardware},
        {name: MaterialName.REAL_ESTATE, amount: option.realEstate},
        {name: MaterialName.ROBOTS, amount: option.robots}
    ]);
    ns.print(`Bought production multiplier materials`);
}

async function round2(option: Round2Option = PrecalculatedRound2Option.OPTION1) {
    ns.print(`Use: ${JSON.stringify(option)}`);
    buyUnlock(ns, UnlockName.EXPORT);
    buyUpgrade(ns, UpgradeName.SMART_STORAGE, option.smartStorageLevel);
    buyUpgrade(ns, UpgradeName.SMART_FACTORIES, option.smartFactoriesLevel);
    // Upgrade Agriculture
    ns.print("Upgrade Agriculture division");
    // Upgrade offices
    await upgradeOffices(ns, DivisionName.AGRICULTURE, cities, option.agriculture.office.size, [
        {name: CorpEmployeePosition.RESEARCH_DEVELOPMENT, amount: option.agriculture.office.size}
    ]);
    for (const city of cities) {
        // Upgrade warehouse
        upgradeWarehouse(ns, DivisionName.AGRICULTURE, city, option.agriculture.warehouseLevel);
    }
    buyAdvert(ns, DivisionName.AGRICULTURE, option.agriculture.advertLevel);

    // Init division Chemical
    await initDivision(ns, DivisionName.CHEMICAL, option.chemical.office.size, option.chemical.warehouseLevel);
    // Import materials, sell/export produced materials
    for (const city of cities) {
        // Export Plants from Agriculture to Chemical
        corp.cancelExportMaterial(DivisionName.AGRICULTURE, city, DivisionName.CHEMICAL, city, "Plants");
        corp.exportMaterial(DivisionName.AGRICULTURE, city, DivisionName.CHEMICAL, city, "Plants", exportString);

        // Export Chemicals from Chemical to Agriculture
        corp.cancelExportMaterial(DivisionName.CHEMICAL, city, DivisionName.AGRICULTURE, city, "Chemicals");
        corp.exportMaterial(DivisionName.CHEMICAL, city, DivisionName.AGRICULTURE, city, "Chemicals", exportString);
        // Sell Chemicals
        corp.sellMaterial(DivisionName.CHEMICAL, city, MaterialName.CHEMICALS, "MAX", "MP");
    }

    await waitUntilHavingEnoughResearchPoints(ns, [{
        divisionName: DivisionName.CHEMICAL,
        researchPoint: option.waitForChemicalRP
    }]);

    await assignJobs(ns, DivisionName.CHEMICAL, cities, [
        {name: CorpEmployeePosition.OPERATIONS, amount: option.chemical.office.operations},
        {name: CorpEmployeePosition.ENGINEER, amount: option.chemical.office.engineer},
        {name: CorpEmployeePosition.BUSINESS, amount: option.chemical.office.business},
        {name: CorpEmployeePosition.MANAGEMENT, amount: option.chemical.office.management},
        {name: CorpEmployeePosition.RESEARCH_DEVELOPMENT, amount: option.chemical.office.research}
    ]);
    await assignJobs(ns, DivisionName.AGRICULTURE, cities, [
        {name: CorpEmployeePosition.OPERATIONS, amount: option.agriculture.office.operations},
        {name: CorpEmployeePosition.ENGINEER, amount: option.agriculture.office.engineer},
        {name: CorpEmployeePosition.BUSINESS, amount: option.agriculture.office.business},
        {name: CorpEmployeePosition.MANAGEMENT, amount: option.agriculture.office.management},
        {name: CorpEmployeePosition.RESEARCH_DEVELOPMENT, amount: option.agriculture.office.research}
    ]);

    await buyMaterials(ns, DivisionName.CHEMICAL, cities, [
        {name: MaterialName.AI_CORES, amount: option.chemical.aiCores},
        {name: MaterialName.HARDWARE, amount: option.chemical.hardware},
        {name: MaterialName.REAL_ESTATE, amount: option.chemical.realEstate},
        {name: MaterialName.ROBOTS, amount: option.chemical.robots},
    ]);
    await buyMaterials(ns, DivisionName.AGRICULTURE, cities, [
        {name: MaterialName.AI_CORES, amount: option.agriculture.aiCores},
        {name: MaterialName.HARDWARE, amount: option.agriculture.hardware},
        {name: MaterialName.REAL_ESTATE, amount: option.agriculture.realEstate},
        {name: MaterialName.ROBOTS, amount: option.agriculture.robots},
    ]);
}

async function round3() {
}

async function test() {
}

export async function main(nsContext: NS): Promise<void> {
    init(nsContext);
    nsx = new NetscriptExtension(ns);
    // nsx.killProcessesSpawnFromSameScript();

    config = ns.flags(defaultConfig);
    if (config.help === true) {
        ns.tprint(`Default config: ${defaultConfig}`);
        return;
    }

    ns.disableLog("ALL");
    ns.tail();
    ns.clearLog();

    if (!corp.hasCorporation()) {
        if (!corp.createCorporation("Corp", <boolean>config.selfFund)) {
            ns.print(`Cannot create corporation`);
            return;
        }
    }

    if (config.round1 === true) {
        await round1();
        return;
    }
    if (config.round2 === true) {
        await round2();
        return;
    }
    if (config.round3 === true) {
        await round3();
        return;
    }
    if (config.test) {
        await test();
        return;
    }
}

import {AutocompleteData, CorpIndustryData, Corporation, Division, Material, NS, Product} from "@ns";
import {
    NetscriptExtension,
    NetscriptFlags,
    NetscriptFlagsSchema,
    parseAutoCompleteDataFromDefaultConfig
} from "/libs/NetscriptExtension";
import {
    CityName,
    CorpState,
    DivisionResearches,
    EmployeePosition,
    getMaxAffordableOfficeSize,
    getMaxAffordableUpgradeLevel,
    getMaxAffordableWarehouseLevel,
    MaterialName,
    OfficeSetup,
    ResearchName,
    ResearchPriority,
    UnlockName,
    UpgradeName
} from "/corporationFormulas";
import {
    assignJobs,
    buyAdvert,
    buyBoostMaterials,
    buyTeaAndThrowParty,
    buyUnlock,
    buyUpgrade,
    cities,
    clearPurchaseOrders,
    clearStorage,
    developNewProduct,
    DivisionName,
    exportString,
    generateMaterialsOrders,
    generateOfficeSetups,
    getDivisionResearches,
    getProductMarketPrice,
    hasDivision,
    initDivision,
    Logger,
    researchPrioritiesForProductDivision,
    researchPrioritiesForSupportDivision,
    showWarning,
    stockMaterials,
    upgradeOffices,
    upgradeWarehouse,
    waitUntilAfterStateHappens,
    waitUntilHavingEnoughResearchPoints
} from "/corporationUtils";
import {optimizeOffice} from "/corporationBenchmarkTools";
import {CorporationBenchmark} from "/corporationBenchmark";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function autocomplete(data: AutocompleteData, flags: string[]): string[] {
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
    waitForAgricultureRP: number;
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
        waitForAgricultureRP: 460,
        waitForChemicalRP: 300,
    }
} as const;

interface Round3Option {
}

const PrecalculatedRound3Option = {
    OPTION1: <Round3Option>{},
} as const;

const defaultBudgetRatioForSupportDivision = {
    warehouse: 0.2,
    office: 0.8
};

const defaultBudgetRatioForProductDivision = {
    rawProduction: 0.17,
    wilsonAdvert: 0.32,
    office: 0.14,
    employeeStatUpgrades: 0.14,
    salesBot: 0.03,
    projectInsight: 0.17,
};

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
    ["improveAllDivisions", false],
    ["clearStorage", false],
    ["test", false],
    ["help", false],
];

function init(nsContext: NS) {
    ns = nsContext;
    nsx = new NetscriptExtension(ns);
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

    // Sell produced materials
    for (const city of cities) {
        corp.sellMaterial(DivisionName.AGRICULTURE, city, MaterialName.PLANTS, "MAX", "MP");
        corp.sellMaterial(DivisionName.AGRICULTURE, city, MaterialName.FOOD, "MAX", "MP");
    }

    // Reassign jobs
    assignJobs(
        ns,
        DivisionName.AGRICULTURE,
        generateOfficeSetups(
            cities,
            3,
            [
                {name: EmployeePosition.OPERATIONS, count: 1},
                {name: EmployeePosition.ENGINEER, count: 1},
                {name: EmployeePosition.BUSINESS, count: 1}
            ]
        )
    );

    // Buy boost materials
    await stockMaterials(
        ns,
        DivisionName.AGRICULTURE,
        generateMaterialsOrders(
            cities,
            [
                {name: MaterialName.AI_CORES, count: option.aiCores},
                {name: MaterialName.HARDWARE, count: option.hardware},
                {name: MaterialName.REAL_ESTATE, count: option.realEstate},
                {name: MaterialName.ROBOTS, count: option.robots}
            ]
        )
    );
}

async function round2(option: Round2Option = PrecalculatedRound2Option.OPTION1) {
    ns.print(`Use: ${JSON.stringify(option)}`);
    const startingBudget = ns.corporation.getCorporation().funds;
    if (startingBudget < 431e9) {
        throw new Error("Your budget is too low");
    }
    buyUnlock(ns, UnlockName.EXPORT);
    buyUpgrade(ns, UpgradeName.SMART_STORAGE, option.smartStorageLevel);
    buyUpgrade(ns, UpgradeName.SMART_FACTORIES, option.smartFactoriesLevel);
    // Upgrade Agriculture
    ns.print("Upgrade Agriculture division");
    // Upgrade offices
    upgradeOffices(
        ns,
        DivisionName.AGRICULTURE,
        generateOfficeSetups(
            cities,
            option.agriculture.office.size,
            [
                {name: EmployeePosition.RESEARCH_DEVELOPMENT, count: option.agriculture.office.size}
            ]
        )
    );
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

    await waitUntilHavingEnoughResearchPoints(
        ns,
        [
            {
                divisionName: DivisionName.AGRICULTURE,
                researchPoint: option.waitForAgricultureRP
            },
            {
                divisionName: DivisionName.CHEMICAL,
                researchPoint: option.waitForChemicalRP
            }
        ]
    );

    assignJobs(
        ns,
        DivisionName.CHEMICAL,
        generateOfficeSetups(
            cities,
            option.chemical.office.size,
            [
                {name: EmployeePosition.OPERATIONS, count: option.chemical.office.operations},
                {name: EmployeePosition.ENGINEER, count: option.chemical.office.engineer},
                {name: EmployeePosition.BUSINESS, count: option.chemical.office.business},
                {name: EmployeePosition.MANAGEMENT, count: option.chemical.office.management},
                {name: EmployeePosition.RESEARCH_DEVELOPMENT, count: option.chemical.office.research}
            ]
        )
    );
    assignJobs(
        ns,
        DivisionName.AGRICULTURE,
        generateOfficeSetups(
            cities,
            option.agriculture.office.size,
            [
                {name: EmployeePosition.OPERATIONS, count: option.agriculture.office.operations},
                {name: EmployeePosition.ENGINEER, count: option.agriculture.office.engineer},
                {name: EmployeePosition.BUSINESS, count: option.agriculture.office.business},
                {name: EmployeePosition.MANAGEMENT, count: option.agriculture.office.management},
                {name: EmployeePosition.RESEARCH_DEVELOPMENT, count: option.agriculture.office.research}
            ]
        )
    );

    await Promise.allSettled([
        stockMaterials(
            ns,
            DivisionName.CHEMICAL,
            generateMaterialsOrders(
                cities,
                [
                    {name: MaterialName.AI_CORES, count: option.chemical.aiCores},
                    {name: MaterialName.HARDWARE, count: option.chemical.hardware},
                    {name: MaterialName.REAL_ESTATE, count: option.chemical.realEstate},
                    {name: MaterialName.ROBOTS, count: option.chemical.robots},
                ]
            )
        ),
        stockMaterials(
            ns,
            DivisionName.AGRICULTURE,
            generateMaterialsOrders(
                cities,
                [
                    {name: MaterialName.AI_CORES, count: option.agriculture.aiCores},
                    {name: MaterialName.HARDWARE, count: option.agriculture.hardware},
                    {name: MaterialName.REAL_ESTATE, count: option.agriculture.realEstate},
                    {name: MaterialName.ROBOTS, count: option.agriculture.robots},
                ]
            )
        )
    ]);
}

async function round3(option: Round3Option = PrecalculatedRound3Option.OPTION1) {
    if (hasDivision(ns, DivisionName.TOBACCO)) {
        ns.spawn(ns.getScriptName(), {spawnDelay: 500}, "--improveAllDivisions");
        return;
    }
    ns.print(`Use: ${JSON.stringify(option)}`);
    const startingBudget = ns.corporation.getCorporation().funds;
    if (startingBudget < 10e12) {
        throw new Error("Your budget is too low");
    }
    buyUnlock(ns, UnlockName.MARKET_RESEARCH_DEMAND);
    buyUnlock(ns, UnlockName.MARKET_DATA_COMPETITION);
    // Init division Tobacco
    await initDivision(ns, DivisionName.TOBACCO, 9, 1);

    // Import materials
    for (const city of cities) {
        // Import Plants from Agriculture
        corp.cancelExportMaterial(DivisionName.AGRICULTURE, city, DivisionName.TOBACCO, city, "Plants");
        corp.exportMaterial(DivisionName.AGRICULTURE, city, DivisionName.TOBACCO, city, "Plants", exportString);
    }

    const agricultureDivision = ns.corporation.getDivision(DivisionName.AGRICULTURE);
    const chemicalDivision = ns.corporation.getDivision(DivisionName.CHEMICAL);
    const tobaccoDivision = ns.corporation.getDivision(DivisionName.TOBACCO);

    await improveProductDivision(
        tobaccoDivision,
        ns.corporation.getCorporation().funds * 0.9,
        defaultBudgetRatioForProductDivision,
        false,
        true // debug
    );

    await improveSupportDivision(
        agricultureDivision,
        500e9,
        defaultBudgetRatioForSupportDivision,
        false,
        true // debug
    );

    await improveSupportDivision(
        chemicalDivision,
        110e9,
        defaultBudgetRatioForSupportDivision,
        false,
        true // debug
    );

    await buyResearch();

    await buyTeaAndThrowParty(ns, DivisionName.TOBACCO);
    developNewProduct(
        ns,
        DivisionName.TOBACCO,
        mainProductDevelopmentCity,
        ns.corporation.getCorporation().funds * 0.1
    );

    await Promise.allSettled([
        buyBoostMaterials(ns, agricultureDivision),
        buyBoostMaterials(ns, chemicalDivision),
        buyBoostMaterials(ns, tobaccoDivision),
    ]);

    ns.spawn(ns.getScriptName(), {spawnDelay: 500}, "--improveAllDivisions");
}

async function improveAllDivisions() {
    const agricultureDivision = ns.corporation.getDivision(DivisionName.AGRICULTURE);
    const chemicalDivision = ns.corporation.getDivision(DivisionName.CHEMICAL);
    const tobaccoDivision = ns.corporation.getDivision(DivisionName.TOBACCO);
    let cycleCount = 0;
    // noinspection InfiniteLoopJS
    while (true) {
        ++cycleCount;
        const corporation = ns.corporation.getCorporation();
        const profit = corporation.revenue - corporation.expenses;
        const promises: Promise<void>[] = [];
        console.log(`cycleCount: ${cycleCount}`);

        await buyResearch();

        // Buy Wilson ASAP if we can afford it with the last cycle's profit. Budget for Wilson and Advert is just part of
        // current funds, it's usually too low for our benchmark to calculate the optimal combination. The benchmark is
        // most suitable for big-budget situation, like after accepting investment offer.
        const currentWilsonLevel = ns.corporation.getUpgradeLevel(UpgradeName.WILSON_ANALYTICS);
        const maxWilsonLevel = getMaxAffordableUpgradeLevel(UpgradeName.WILSON_ANALYTICS, currentWilsonLevel, profit);
        if (maxWilsonLevel > currentWilsonLevel) {
            buyUpgrade(ns, UpgradeName.WILSON_ANALYTICS, maxWilsonLevel);
        }

        if (cycleCount % 10 === 0 || corporation.funds > profit * 1000) {
            await improveProductDivision(
                ns.corporation.getDivision(DivisionName.TOBACCO),
                corporation.funds * 0.99,
                defaultBudgetRatioForProductDivision,
                false,
                false
            );
            ns.print("Finish improving product division");
            promises.push(buyBoostMaterials(ns, tobaccoDivision));
        }

        developNewProduct(
            ns,
            DivisionName.TOBACCO,
            mainProductDevelopmentCity,
            corporation.funds * 0.01
        );

        if (cycleCount % 20 === 0) {
            // Use last cycle's profit to improve support divisions.
            await improveSupportDivision(
                ns.corporation.getDivision(DivisionName.AGRICULTURE),
                Math.min(profit * 0.95, ns.corporation.getCorporation().funds),
                defaultBudgetRatioForSupportDivision,
                false,
                false
            );

            await improveSupportDivision(
                ns.corporation.getDivision(DivisionName.CHEMICAL),
                Math.min(profit * 0.05, ns.corporation.getCorporation().funds),
                defaultBudgetRatioForSupportDivision,
                false,
                false
            );
            ns.print("Finish improving support divisions");

            promises.push(buyBoostMaterials(ns, agricultureDivision));
            promises.push(buyBoostMaterials(ns, chemicalDivision));
        }
        await Promise.allSettled(promises);

        await waitUntilAfterStateHappens(ns, CorpState.START);
    }
}

async function buyResearchForDivision(divisionName: string) {
    if (!ns.corporation.hasResearched(divisionName, ResearchName.HI_TECH_RND_LABORATORY)) {
        // Backup office setups and assign all employees to R&D
        const officeSetups: OfficeSetup[] = [];
        for (const city of cities) {
            const office = ns.corporation.getOffice(divisionName, city);
            officeSetups.push({
                city: city,
                size: office.size,
                jobs: {
                    Operations: office.employeeJobs.Operations,
                    Engineer: office.employeeJobs.Engineer,
                    Business: office.employeeJobs.Business,
                    Management: office.employeeJobs.Management,
                    "Research & Development": office.employeeJobs["Research & Development"]
                }
            });
            assignJobs(
                ns,
                divisionName,
                [{
                    city: city,
                    size: office.size,
                    jobs: {
                        Operations: 0,
                        Engineer: 0,
                        Business: 0,
                        Management: 0,
                        "Research & Development": office.size
                    }
                }]
            );
        }
        // Wait until having enough RP
        await waitUntilHavingEnoughResearchPoints(ns, [
            {
                divisionName: divisionName,
                researchPoint: ns.corporation.getResearchCost(divisionName, ResearchName.HI_TECH_RND_LABORATORY)
            }
        ]);
        // Buy research
        ns.corporation.research(divisionName, ResearchName.HI_TECH_RND_LABORATORY);
        // Restore office setups
        assignJobs(
            ns,
            divisionName,
            officeSetups
        );
    }
    let researchPriorities: ResearchPriority[];
    if (divisionName === DivisionName.AGRICULTURE || divisionName === DivisionName.CHEMICAL) {
        researchPriorities = researchPrioritiesForSupportDivision;
    } else {
        researchPriorities = researchPrioritiesForProductDivision;
    }
    for (const researchPriority of researchPriorities) {
        const researchCost = ns.corporation.getResearchCost(divisionName, researchPriority.research);
        if (!ns.corporation.hasResearched(divisionName, researchPriority.research)
            && ns.corporation.getDivision(divisionName).researchPoints >= researchCost * researchPriority.costMultiplier) {
            ns.corporation.research(divisionName, researchPriority.research);
        }
    }
}

async function buyResearch() {
    await Promise.allSettled([
        buyResearchForDivision(DivisionName.AGRICULTURE),
        buyResearchForDivision(DivisionName.CHEMICAL),
        buyResearchForDivision(DivisionName.TOBACCO),
    ]);
}

async function improveSupportDivision(
    division: Division,
    totalBudget: number,
    budgetRatio: {
        warehouse: number;
        office: number;
    },
    dryRun = false,
    enableLogging = false,
    customData?: {
        warehouse: number;
        office: {
            size: number;
            jobs: {
                Operations: number;
                Engineer: number;
                Business: number;
                Management: number;
                "Research & Development": number;
            }
        };
        advert: number;
    }) {
    const logger = new Logger(enableLogging);
    const industryData = ns.corporation.getIndustryData(division.type);
    const currentFunds = ns.corporation.getCorporation().funds;

    const warehouseBudget = totalBudget * budgetRatio.warehouse / 6;
    const officeBudget = totalBudget * budgetRatio.office / 6;
    const officeSetups: OfficeSetup[] = [];
    for (const city of cities) {
        logger.city = city;
        // Warehouse
        const currentWarehouseLevel = ns.corporation.getWarehouse(division.name, city).level;
        let newWarehouseLevel: number;
        if (customData?.warehouse) {
            newWarehouseLevel = customData.warehouse;
        } else {
            newWarehouseLevel = getMaxAffordableWarehouseLevel(currentWarehouseLevel, warehouseBudget);
        }
        logger.log(`Division ${division.name}: currentWarehouseLevel: ${currentWarehouseLevel}, newWarehouseLevel: ${newWarehouseLevel}`);
        if (newWarehouseLevel > currentWarehouseLevel && !dryRun) {
            ns.corporation.upgradeWarehouse(division.name, city, newWarehouseLevel - currentWarehouseLevel);
        }
        logger.log(`Division ${division.name}: currentWarehouseLevel: ${ns.corporation.getWarehouse(division.name, city).level}`);

        // Office
        const office = ns.corporation.getOffice(division.name, city);
        const maxOfficeSize = getMaxAffordableOfficeSize(office.size, officeBudget);
        logger.log(`City: ${city}. currentOfficeSize: ${office.size}, maxOfficeSize: ${maxOfficeSize}`);
        if (maxOfficeSize < 6) {
            throw new Error(`Budget for office is too low. Division: ${division.name}. Office's budget: ${ns.formatNumber(officeBudget)}`);
        }
        if (maxOfficeSize < office.size) {
            continue;
        }
        // 80% of office employees are R&D
        let minRnDEmployee: number;
        if (maxOfficeSize <= 12) {
            minRnDEmployee = 9;
        } else {
            minRnDEmployee = Math.ceil(maxOfficeSize * 0.8);
        }
        const officeSetup: OfficeSetup = {
            city: city,
            size: maxOfficeSize,
            jobs: {
                Operations: 0,
                Engineer: 0,
                Business: 0,
                Management: 0,
                "Research & Development": minRnDEmployee,
            }
        };
        if (customData?.office) {
            officeSetup.size = customData.office.size;
            officeSetup.jobs = customData.office.jobs;
        } else {
            let item: Material;
            switch (division.name) {
                case DivisionName.AGRICULTURE:
                    item = ns.corporation.getMaterial(division.name, city, MaterialName.PLANTS);
                    break;
                case DivisionName.CHEMICAL:
                    item = ns.corporation.getMaterial(division.name, city, MaterialName.CHEMICALS);
                    break;
                default:
                    throw new Error(`Invalid division: ${division.name}`);
            }
            if (maxOfficeSize - minRnDEmployee < 3) {
                throw new Error(`Budget for office is too low. Division: ${division.name}. Office's budget: ${ns.formatNumber(officeBudget)}`);
            }
            if (maxOfficeSize - minRnDEmployee === 3) {
                officeSetup.jobs = {
                    Operations: 1,
                    Engineer: 1,
                    Business: 1,
                    Management: 0,
                    "Research & Development": minRnDEmployee,
                };
            } else {
                const dataArray = await optimizeOffice(
                    ns,
                    division,
                    industryData,
                    city,
                    maxOfficeSize - minRnDEmployee,
                    item,
                    "rawProduction",
                    1,
                    enableLogging
                );
                if (dataArray.length === 0) {
                    showWarning(
                        ns,
                        `Cannot calculate optimal office setup. Division: ${division.name}, `
                        + `maxTotalEmployees: ${maxOfficeSize - minRnDEmployee}`
                    );
                    const operations = Math.floor(maxOfficeSize / 5);
                    const engineer = Math.floor(maxOfficeSize / 5);
                    const business = Math.floor(maxOfficeSize / 5);
                    const management = Math.floor(maxOfficeSize / 5);
                    const rnd = maxOfficeSize - (operations + engineer + business + management);
                    officeSetup.jobs = {
                        Operations: operations,
                        Engineer: engineer,
                        Business: business,
                        Management: management,
                        "Research & Development": rnd,
                    };
                } else {
                    const optimalData = dataArray[dataArray.length - 1];
                    officeSetup.jobs = {
                        Operations: optimalData.operations,
                        Engineer: optimalData.engineer,
                        Business: optimalData.business,
                        Management: optimalData.management,
                        "Research & Development": minRnDEmployee,
                    };
                }
            }
            logger.log("Optimal officeSetup:", JSON.stringify(officeSetup));
        }
        officeSetups.push(officeSetup);
    }
    logger.city = undefined;
    if (!dryRun) {
        upgradeOffices(ns, division.name, officeSetups);
    }
    logger.log(`Spent: ${ns.formatNumber(currentFunds - ns.corporation.getCorporation().funds)}`);
}

function improveProductDivisionRawProduction(
    division: Division,
    industryData: CorpIndustryData,
    divisionResearches: DivisionResearches,
    budget: number,
    dryRun = false,
    benchmark: CorporationBenchmark,
    enableLogging = false) {
    const logger = new Logger(enableLogging);
    const dataArray = benchmark.optimizeStorageAndFactory(
        industryData,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_STORAGE),
        // Assume that all warehouses are at the same level
        ns.corporation.getWarehouse(division.name, CityName.Sector12).level,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_FACTORIES),
        divisionResearches,
        budget,
        enableLogging
    );
    if (dataArray.length === 0) {
        return;
    }
    const optimalData = dataArray[dataArray.length - 1];
    logger.log(`rawProduction: ${JSON.stringify(optimalData)}`);
    if (!dryRun) {
        buyUpgrade(ns, UpgradeName.SMART_STORAGE, optimalData.smartStorageLevel);
        buyUpgrade(ns, UpgradeName.SMART_FACTORIES, optimalData.smartFactoriesLevel);
        for (const city of cities) {
            const currentWarehouseLevel = ns.corporation.getWarehouse(division.name, city).level;
            if (optimalData.warehouseLevel > currentWarehouseLevel) {
                ns.corporation.upgradeWarehouse(
                    division.name,
                    city,
                    optimalData.warehouseLevel - currentWarehouseLevel
                );
            }
        }
    }
}

function improveProductDivisionWilsonAdvert(
    division: Division,
    industryData: CorpIndustryData,
    divisionResearches: DivisionResearches,
    budget: number,
    dryRun = false,
    benchmark: CorporationBenchmark,
    enableLogging = false) {
    const logger = new Logger(enableLogging);
    const dataArray = benchmark.optimizeWilsonAndAdvert(
        industryData,
        ns.corporation.getUpgradeLevel(UpgradeName.WILSON_ANALYTICS),
        ns.corporation.getHireAdVertCount(division.name),
        divisionResearches,
        budget,
        enableLogging
    );
    if (dataArray.length === 0) {
        return;
    }
    const optimalData = dataArray[dataArray.length - 1];
    logger.log(`wilsonAdvert: ${JSON.stringify(optimalData)}`);
    if (!dryRun) {
        buyUpgrade(ns, UpgradeName.WILSON_ANALYTICS, optimalData.wilsonLevel);
        buyAdvert(ns, division.name, optimalData.advertLevel);
    }
}

async function improveProductDivisionMainOffice(
    division: Division,
    industryData: CorpIndustryData,
    budget: number,
    dryRun = false,
    enableLogging = false) {
    const logger = new Logger(enableLogging);
    const office = ns.corporation.getOffice(division.name, mainProductDevelopmentCity);
    const maxOfficeSize = getMaxAffordableOfficeSize(office.size, budget);
    if (maxOfficeSize < office.size) {
        return;
    }
    const officeSetup: OfficeSetup = {
        city: mainProductDevelopmentCity,
        size: maxOfficeSize,
        jobs: {
            Operations: 0,
            Engineer: 0,
            Business: 0,
            Management: 0,
            "Research & Development": 0,
        }
    };
    const products = division.products;
    let item: Product;
    // const sortType = "rawProduction";
    // const sortType = "profit";
    // const sortType = "progress";
    // const sortType = "optimalPrice";
    const sortType = "profit_progress";
    if (products.length === 0) {
        industryData.requiredMaterials;
        item = {
            actualSellAmount: 0,
            advertisingInvestment: ns.corporation.getCorporation().funds * 0.01 / 2,
            competition: 0,
            demand: 0,
            designInvestment: ns.corporation.getCorporation().funds * 0.01 / 2,
            desiredSellAmount: 0,
            desiredSellPrice: 0,
            developmentProgress: 0,
            effectiveRating: 0,
            name: "Sample product",
            productionAmount: 0,
            // Material's market price is different between cities. We use Sector12's price as reference price.
            productionCost: getProductMarketPrice(ns, division, industryData, CityName.Sector12),
            rating: 0,
            size: 0,
            stats: {aesthetics: 0, durability: 0, features: 0, performance: 0, quality: 0, reliability: 0},
            stored: 0
        };
    } else {
        item = ns.corporation.getProduct(division.name, mainProductDevelopmentCity, products[products.length - 1]);
        logger.log(`Use product: ${item.name}`);
    }
    const dataArray = await optimizeOffice(
        ns,
        division,
        industryData,
        mainProductDevelopmentCity,
        maxOfficeSize,
        item,
        sortType,
        1,
        enableLogging
    );
    if (dataArray.length === 0) {
        throw new Error(`Cannot calculate optimal office setup. maxTotalEmployees: ${maxOfficeSize}`);
    }
    const optimalData = dataArray[dataArray.length - 1];
    officeSetup.jobs = {
        Operations: optimalData.operations,
        Engineer: optimalData.engineer,
        Business: optimalData.business,
        Management: optimalData.management,
        "Research & Development": 0,
    };

    logger.log(`mainOffice: ${JSON.stringify(officeSetup)}`);
    if (!dryRun) {
        upgradeOffices(ns, division.name, [officeSetup]);
    }
}

async function improveProductDivisionSupportOffices(
    division: Division,
    budget: number,
    dryRun = false,
    enableLogging = false) {
    const logger = new Logger(enableLogging);
    const officeSetups: OfficeSetup[] = [];
    for (const city of supportProductDevelopmentCities) {
        const office = ns.corporation.getOffice(division.name, city);
        const maxOfficeSize = getMaxAffordableOfficeSize(office.size, budget / 5);
        if (maxOfficeSize < 5) {
            throw new Error(`Budget for office is too low. Division: ${division.name}. Office's budget: ${ns.formatNumber(budget / 5)}`);
        }
        if (maxOfficeSize < office.size) {
            continue;
        }
        officeSetups.push(({
            city: city,
            size: maxOfficeSize,
            jobs: {
                Operations: 1,
                Engineer: 1,
                Business: 1,
                Management: 1,
                "Research & Development": maxOfficeSize - 4,
            }
        }));
    }
    logger.log(`supportOffices: ${JSON.stringify(officeSetups)}`);
    if (!dryRun) {
        upgradeOffices(ns, division.name, officeSetups);
    }
}

async function improveProductDivisionOffices(
    division: Division,
    industryData: CorpIndustryData,
    budget: number,
    dryRun = false,
    enableLogging = false) {
    await improveProductDivisionMainOffice(
        division,
        industryData,
        budget * 0.25,
        dryRun,
        enableLogging
    );
    await improveProductDivisionSupportOffices(
        division,
        budget * 0.75,
        dryRun,
        enableLogging
    );
}

async function improveProductDivision(
    division: Division,
    totalBudget: number,
    budgetRatio: {
        rawProduction: number; // SmartFactories + SmartStorage + Warehouse
        wilsonAdvert: number; // Wilson + Advert
        office: number;
        employeeStatUpgrades: number;
        salesBot: number;
        projectInsight: number;
    },
    dryRun = false,
    enableLogging = false) {
    const logger = new Logger(enableLogging);
    const industryData = ns.corporation.getIndustryData(division.type);
    const divisionResearches = getDivisionResearches(ns, division.name);
    const benchmark = new CorporationBenchmark();
    const currentFunds = ns.corporation.getCorporation().funds;

    // employeeStatUpgrades
    const employeeStatUpgradesBudget = totalBudget * budgetRatio.employeeStatUpgrades;
    const currentCreativityUpgradeLevel = ns.corporation.getUpgradeLevel(UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS);
    const currentCharismaUpgradeLevel = ns.corporation.getUpgradeLevel(UpgradeName.SPEECH_PROCESSOR_IMPLANTS);
    const currentIntelligenceUpgradeLevel = ns.corporation.getUpgradeLevel(UpgradeName.NEURAL_ACCELERATORS);
    const currentEfficiencyUpgradeLevel = ns.corporation.getUpgradeLevel(UpgradeName.FOCUS_WIRES);
    const newCreativityUpgradeLevel = getMaxAffordableUpgradeLevel(
        UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS,
        currentCreativityUpgradeLevel,
        employeeStatUpgradesBudget / 4
    );
    const newCharismaUpgradeLevel = getMaxAffordableUpgradeLevel(
        UpgradeName.SPEECH_PROCESSOR_IMPLANTS,
        currentCharismaUpgradeLevel,
        employeeStatUpgradesBudget / 4
    );
    const newIntelligenceUpgradeLevel = getMaxAffordableUpgradeLevel(
        UpgradeName.NEURAL_ACCELERATORS,
        currentIntelligenceUpgradeLevel,
        employeeStatUpgradesBudget / 4
    );
    const newEfficiencyUpgradeLevel = getMaxAffordableUpgradeLevel(
        UpgradeName.FOCUS_WIRES,
        currentEfficiencyUpgradeLevel,
        employeeStatUpgradesBudget / 4
    );
    if (!dryRun) {
        buyUpgrade(ns, UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS, newCreativityUpgradeLevel);
        buyUpgrade(ns, UpgradeName.SPEECH_PROCESSOR_IMPLANTS, newCharismaUpgradeLevel);
        buyUpgrade(ns, UpgradeName.NEURAL_ACCELERATORS, newIntelligenceUpgradeLevel);
        buyUpgrade(ns, UpgradeName.FOCUS_WIRES, newEfficiencyUpgradeLevel);
    }

    // salesBot
    const salesBotBudget = totalBudget * budgetRatio.salesBot;
    const currentSalesBotUpgradeLevel = ns.corporation.getUpgradeLevel(UpgradeName.ABC_SALES_BOTS);
    const newSalesBotUpgradeLevel = getMaxAffordableUpgradeLevel(
        UpgradeName.ABC_SALES_BOTS,
        currentSalesBotUpgradeLevel,
        salesBotBudget
    );
    if (!dryRun) {
        buyUpgrade(ns, UpgradeName.ABC_SALES_BOTS, newSalesBotUpgradeLevel);
    }

    // projectInsight
    const projectInsightBudget = totalBudget * budgetRatio.projectInsight;
    const currentProjectInsightUpgradeLevel = ns.corporation.getUpgradeLevel(UpgradeName.PROJECT_INSIGHT);
    const newProjectInsightUpgradeLevel = getMaxAffordableUpgradeLevel(
        UpgradeName.PROJECT_INSIGHT,
        currentProjectInsightUpgradeLevel,
        projectInsightBudget
    );
    if (!dryRun) {
        buyUpgrade(ns, UpgradeName.PROJECT_INSIGHT, newProjectInsightUpgradeLevel);
    }

    // rawProduction
    const rawProductionBudget = totalBudget * budgetRatio.rawProduction;
    improveProductDivisionRawProduction(
        division,
        industryData,
        divisionResearches,
        rawProductionBudget,
        dryRun,
        benchmark,
        enableLogging
    );

    // wilsonAdvert
    const wilsonAdvertBudget = totalBudget * budgetRatio.wilsonAdvert;
    improveProductDivisionWilsonAdvert(
        division,
        industryData,
        divisionResearches,
        wilsonAdvertBudget,
        dryRun,
        benchmark,
        enableLogging
    );

    // office
    const officesBudget = totalBudget * budgetRatio.office;
    await improveProductDivisionOffices(
        division,
        industryData,
        officesBudget,
        dryRun,
        enableLogging
    );

    logger.log(`Spent: ${ns.formatNumber(currentFunds - ns.corporation.getCorporation().funds)}`);
}

async function test() {
}

export async function main(nsContext: NS): Promise<void> {
    init(nsContext);

    config = ns.flags(defaultConfig);
    if (config.help === true) {
        ns.tprint(`Default config: ${defaultConfig}`);
        return;
    }

    ns.disableLog("ALL");
    // ns.tail();
    ns.clearLog();

    if (!corp.hasCorporation()) {
        if (!corp.createCorporation("Corp", config.selfFund as boolean)) {
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
    if (config.improveAllDivisions === true) {
        nsx.killProcessesSpawnFromSameScript();
        ns.tail();
        await improveAllDivisions();
        return;
    }
    if (config.clearStorage === true) {
        clearPurchaseOrders(ns);
        const division = ns.corporation.getCorporation().divisions;
        const promises: Promise<void>[] = [];
        for (const divisionName of division) {
            promises.push(clearStorage(ns, divisionName));
        }
        await Promise.allSettled(promises);
        return;
    }
    if (config.test) {
        ns.tail();
        await test();
        return;
    }
}

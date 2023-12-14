import {AutocompleteData, CorpIndustryData, Corporation, Division, Material, NS, Product, ToastVariant} from "@ns";
import {NetscriptFlags, NetscriptFlagsSchema, parseAutoCompleteDataFromDefaultConfig} from "/libs/NetscriptExtension";
import {
    CityName,
    EmployeePosition,
    DivisionResearches,
    getMaxAffordableAdVertLevel,
    getMaxAffordableOfficeSize,
    getMaxAffordableUpgradeLevel,
    getMaxAffordableWarehouseLevel,
    MaterialName,
    OfficeSetup,
    UnlockName,
    UpgradeName, getUpgradeBenefit, getResearchSalesMultiplier
} from "/corporationFormulas";
import {
    assignJobs,
    buyAdvert,
    buyBoostMaterials,
    buyTeaAndThrowParty,
    buyUnlock,
    buyUpgrade,
    cities,
    DivisionName,
    exportString,
    generateMaterialsOrders,
    generateNextProductName,
    generateOfficeSetups, getDivisionResearches, getLatestProductName,
    initDivision, developNewProduct,
    stockMaterials,
    upgradeOffices,
    upgradeWarehouse,
    waitUntilHavingEnoughResearchPoints, calculateProductMarketPrice, getCorporationUpgradeLevels
} from "/corporationUtils";
import {optimizeOffice} from "/corporationBenchmarkTools";
import {CorpUpgradesData} from "/data/CorpUpgradesData";
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

interface Round3Option {
}

const PrecalculatedRound3Option = {
    OPTION1: <Round3Option>{},
} as const;

let ns: NS;
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

    await waitUntilHavingEnoughResearchPoints(ns, [{
        divisionName: DivisionName.CHEMICAL,
        researchPoint: option.waitForChemicalRP
    }]);

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

    await stockMaterials(
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
    );
    await stockMaterials(
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
    );
}

async function round3(option: Round3Option = PrecalculatedRound3Option.OPTION1) {
    ns.print(`Use: ${JSON.stringify(option)}`);
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

    await improveProductDivision(
        ns,
        ns.corporation.getDivision(DivisionName.TOBACCO),
        ns.corporation.getCorporation().funds * 0.8,
        {
            rawProduction: 0.17,
            wilsonAdvert: 0.32,
            office: 0.14,
            employeeStatUpgrades: 0.14,
            salesBot: 0.03,
            projectInsight: 0.17,
        }
    );

    await buyTeaAndThrowParty(ns, DivisionName.TOBACCO);
    developNewProduct(ns, DivisionName.TOBACCO, mainProductDevelopmentCity);
}

async function improveSupportDivision(
    ns: NS,
    division: Division,
    totalBudget: number,
    budgetRatio: {
        warehouse: number;
        office: number;
        advert: number;
    },
    dryRun = false,
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
    const industryData = ns.corporation.getIndustryData(division.type);

    // Advert
    const advertBudget = totalBudget * budgetRatio.advert;
    const currentAdvertLevel = ns.corporation.getHireAdVertCount(division.name);
    let newAdvertLevel: number;
    if (customData?.advert) {
        newAdvertLevel = customData.advert;
    } else {
        newAdvertLevel = getMaxAffordableAdVertLevel(
            currentAdvertLevel,
            advertBudget
        );
    }
    console.log(`Division ${division.name}: currentAdvertLevel: ${currentAdvertLevel}, newAdvertLevel: ${newAdvertLevel}`);
    if (newAdvertLevel > currentAdvertLevel && !dryRun) {
        for (let i = currentAdvertLevel; i < newAdvertLevel; i++) {
            ns.corporation.hireAdVert(division.name);
        }
    }
    console.log(`Division ${division.name}: currentAdvertLevel: ${ns.corporation.getHireAdVertCount(division.name)}`);

    const warehouseBudget = totalBudget * budgetRatio.warehouse / 6;
    const officeBudget = totalBudget * budgetRatio.office / 6;
    const officeSetups: OfficeSetup[] = [];
    for (const city of cities) {
        const printLog = (...data: unknown[]) => {
            if (city === CityName.Sector12) {
                console.log(...data);
            }
        };
        // Warehouse
        const currentWarehouseLevel = ns.corporation.getWarehouse(division.name, city).level;
        let newWarehouseLevel: number;
        if (customData?.warehouse) {
            newWarehouseLevel = customData.warehouse;
        } else {
            newWarehouseLevel = getMaxAffordableWarehouseLevel(currentWarehouseLevel, warehouseBudget);
        }
        console.log(`Division ${division.name}: currentWarehouseLevel: ${currentWarehouseLevel}, newWarehouseLevel: ${newWarehouseLevel}`);
        if (newWarehouseLevel > currentWarehouseLevel && !dryRun) {
            ns.corporation.upgradeWarehouse(division.name, city, newWarehouseLevel - currentWarehouseLevel);
        }
        console.log(`Division ${division.name}: currentWarehouseLevel: ${ns.corporation.getWarehouse(division.name, city).level}`);

        // Office
        const office = ns.corporation.getOffice(division.name, city);
        const maxOfficeSize = getMaxAffordableOfficeSize(office.size, officeBudget);
        printLog(`City: ${city}. currentOfficeSize: ${office.size}, maxOfficeSize: ${maxOfficeSize}`);
        if (maxOfficeSize < 6) {
            throw new Error(`Budget for office is too low. Division: ${division.name}. Office's budget: ${ns.formatNumber(officeBudget)}`);
        }
        if (maxOfficeSize < office.size) {
            continue;
        }
        // Half of office employees are R&D
        const minRnDEmployee = Math.ceil(maxOfficeSize * 0.5);
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
            const dataArray = await optimizeOffice(
                ns,
                division,
                industryData,
                city,
                maxOfficeSize - minRnDEmployee,
                item,
                "rawProduction",
                1,
                city === CityName.Sector12
            );
            if (dataArray.length === 0) {
                if (maxOfficeSize - minRnDEmployee === 3) {
                    officeSetup.jobs = {
                        Operations: 1,
                        Engineer: 1,
                        Business: 1,
                        Management: 0,
                        "Research & Development": minRnDEmployee,
                    };
                } else {
                    throw new Error("Cannot calculate optimal office setup");
                }
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
            printLog("Optimal officeSetup:", JSON.stringify(officeSetup));
        }
        officeSetups.push(officeSetup);
    }
    if (!dryRun) {
        upgradeOffices(ns, division.name, officeSetups);
        await buyBoostMaterials(ns, division);
    }
}

function improveProductDivisionRawProduction(
    ns: NS,
    division: Division,
    industryData: CorpIndustryData,
    divisionResearches: DivisionResearches,
    budget: number,
    dryRun = false,
    benchmark: CorporationBenchmark) {
    const dataArray = benchmark.optimizeStorageAndFactory(
        industryData,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_STORAGE),
        // Assume that all warehouse are at the same level
        ns.corporation.getWarehouse(division.name, CityName.Sector12).level,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_FACTORIES),
        divisionResearches,
        budget
    );
    if (dataArray.length === 0) {
        return;
    }
    const optimalData = dataArray[dataArray.length - 1];
    console.log(`rawProduction optimalData: ${JSON.stringify(optimalData)}`);
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
    ns: NS,
    division: Division,
    industryData: CorpIndustryData,
    divisionResearches: DivisionResearches,
    budget: number,
    dryRun = false,
    benchmark: CorporationBenchmark) {
    const dataArray = benchmark.optimizeWilsonAndAdvert(
        industryData,
        ns.corporation.getUpgradeLevel(UpgradeName.WILSON_ANALYTICS),
        ns.corporation.getHireAdVertCount(division.name),
        divisionResearches,
        budget
    );
    if (dataArray.length === 0) {
        return;
    }
    const optimalData = dataArray[dataArray.length - 1];
    console.log(`wilsonAdvert optimalData: ${JSON.stringify(optimalData)}`);
    if (!dryRun) {
        buyUpgrade(ns, UpgradeName.WILSON_ANALYTICS, optimalData.wilsonLevel);
        buyAdvert(ns, division.name, optimalData.advertLevel);
    }
}

async function improveProductDivisionMainOffice(
    ns: NS,
    division: Division,
    industryData: CorpIndustryData,
    budget: number,
    dryRun = false) {
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
            productionCost: calculateProductMarketPrice(ns, division, industryData, CityName.Sector12),
            rating: 0,
            size: 0,
            stats: {aesthetics: 0, durability: 0, features: 0, performance: 0, quality: 0, reliability: 0},
            stored: 0
        };
    } else {
        item = ns.corporation.getProduct(division.name, mainProductDevelopmentCity, products[products.length - 1]);
        console.log(`Use product: ${item.name}`);
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
        true
    );
    if (dataArray.length === 0) {
        throw new Error("Cannot calculate optimal office setup");
    }
    const optimalData = dataArray[dataArray.length - 1];
    officeSetup.jobs = {
        Operations: optimalData.operations,
        Engineer: optimalData.engineer,
        Business: optimalData.business,
        Management: optimalData.management,
        "Research & Development": 0,
    };

    console.log(`mainOffice optimalData: ${JSON.stringify(officeSetup)}`);
    if (!dryRun) {
        upgradeOffices(ns, division.name, [officeSetup]);
    }
}

async function improveProductDivisionSupportOffices(
    ns: NS,
    division: Division,
    budget: number,
    dryRun = false) {
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
    console.log(`supportOffices optimalData: ${JSON.stringify(officeSetups)}`);
    if (!dryRun) {
        upgradeOffices(ns, division.name, officeSetups);
    }
}

async function improveProductDivisionOffices(
    ns: NS,
    division: Division,
    industryData: CorpIndustryData,
    budget: number,
    dryRun = false) {
    await improveProductDivisionMainOffice(
        ns,
        division,
        industryData,
        budget * 0.25,
        dryRun
    );
    await improveProductDivisionSupportOffices(
        ns,
        division,
        budget * 0.75,
        dryRun
    );
}

async function improveProductDivision(
    ns: NS,
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
    dryRun = false) {
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
        ns,
        division,
        industryData,
        divisionResearches,
        rawProductionBudget,
        dryRun,
        benchmark
    );

    // wilsonAdvert
    const wilsonAdvertBudget = totalBudget * budgetRatio.wilsonAdvert;
    improveProductDivisionWilsonAdvert(
        ns,
        division,
        industryData,
        divisionResearches,
        wilsonAdvertBudget,
        dryRun,
        benchmark
    );

    // office
    const officesBudget = totalBudget * budgetRatio.office;
    await improveProductDivisionOffices(
        ns,
        division,
        industryData,
        officesBudget,
        dryRun
    );

    console.log(`Spent: ${ns.formatNumber(ns.corporation.getCorporation().funds - currentFunds)}`);
    if (!dryRun) {
        await buyBoostMaterials(ns, division);
    }
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
    ns.tail();
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
    if (config.test) {
        await test();
        return;
    }
}

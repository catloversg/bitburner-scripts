import {AutocompleteData, CorpIndustryData, Material, NS, Product} from "@ns";
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
    getAdVertCost,
    getMaxAffordableAdVertLevel,
    getMaxAffordableOfficeSize,
    getMaxAffordableUpgradeLevel,
    getMaxAffordableWarehouseLevel,
    IndustryType,
    MaterialName,
    OfficeSetup,
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
    createDivision,
    createDummyDivisions,
    developNewProduct,
    DivisionName,
    exportString,
    findOptimalAmountOfBoostMaterials,
    generateMaterialsOrders,
    generateOfficeSetups,
    getDivisionResearches,
    getProductIdArray,
    getProductMarketPrice,
    hasDivision,
    Logger,
    researchPrioritiesForProductDivision,
    researchPrioritiesForSupportDivision,
    showWarning,
    stockMaterials,
    upgradeOffices,
    upgradeWarehouse,
    waitForNumberOfCycles,
    waitUntilAfterStateHappens,
    waitUntilHavingEnoughResearchPoints
} from "/corporationUtils";
import {optimizeOffice} from "/corporationBenchmarkTools";
import {CorporationBenchmark, OfficeBenchmarkSortType} from "/corporationBenchmark";
import * as testingTools from "/corporationTestingTools";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function autocomplete(data: AutocompleteData, flags: string[]): string[] {
    return parseAutoCompleteDataFromDefaultConfig(data, defaultConfig);
}

interface Round1Option {
    boostMaterialsRatio: number;
}

const PrecalculatedRound1Option = {
    OPTION1: <Round1Option>{
        boostMaterialsRatio: 0.87
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
    agriculture: {
        office: OfficeOption;
    };
    waitForAgricultureRP: number;
    waitForChemicalRP: number;
}

const PrecalculatedRound2Option = {
    // Minimum funds at start: 431b
    OPTION1: <Round2Option>{
        agriculture: {
            office: <OfficeOption>{
                size: 6,
                operations: 2,
                engineer: 1,
                business: 1,
                management: 2,
                research: 0,
            },
        },
        // 175-100
        // 245-150
        // 315-200
        // 390-250
        // waitForAgricultureRP: 175,
        // waitForChemicalRP: 100,
        waitForAgricultureRP: 245,
        waitForChemicalRP: 150,
        // waitForAgricultureRP: 315,
        // waitForChemicalRP: 200,
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

const budgetRatioForProductDivisionAfterMaxAdvertBenefits = {
    rawProduction: 0.332,
    wilsonAdvert: 0,
    office: 0.267,
    employeeStatUpgrades: 0.267,
    salesBot: 0.067,
    projectInsight: 0.067,
};

const maxRerunWhenOptimizingOfficeForProductDivision = 0;

let ns: NS;
let nsx: NetscriptExtension;
let config: NetscriptFlags;
let enableTestingTools: boolean = false;
let mainProductDevelopmentCity: CityName;
let supportProductDevelopmentCities: CityName[];
let agricultureIndustryData: CorpIndustryData;
let chemicalIndustryData: CorpIndustryData;
let tobaccoIndustryData: CorpIndustryData;

const defaultConfig: NetscriptFlagsSchema = [
    ["benchmark", false],
    ["selfFund", false],
    ["round1", false],
    ["round2", false],
    ["round3", false],
    ["improveAllDivisions", false],
    ["test", false],
    ["help", false],
];

function init(nsContext: NS): void {
    ns = nsContext;
    nsx = new NetscriptExtension(ns);
    mainProductDevelopmentCity = ns.enums.CityName.Sector12;
    supportProductDevelopmentCities = Object.values(ns.enums.CityName)
        .filter(cityName => cityName !== mainProductDevelopmentCity);
}

async function round1(option: Round1Option = PrecalculatedRound1Option.OPTION1): Promise<void> {
    ns.print(`Use: ${JSON.stringify(option)}`);

    // Create Agriculture division
    await createDivision(ns, DivisionName.AGRICULTURE, 3, 1);

    const targetAdvertLevel = 2;
    const advertCost = getAdVertCost(ns.corporation.getHireAdVertCount(DivisionName.AGRICULTURE), targetAdvertLevel);

    const dataArray = new CorporationBenchmark().optimizeStorageAndFactory(
        agricultureIndustryData,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_STORAGE),
        // Assume that all warehouses are at the same level
        ns.corporation.getWarehouse(DivisionName.AGRICULTURE, CityName.Sector12).level,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_FACTORIES),
        getDivisionResearches(ns, DivisionName.AGRICULTURE),
        ns.corporation.getCorporation().funds - advertCost,
        false
    );
    if (dataArray.length === 0) {
        throw new Error("Cannot find optimal data");
    }
    const optimalData = dataArray[dataArray.length - 1];

    buyUpgrade(ns, UpgradeName.SMART_STORAGE, optimalData.smartStorageLevel);
    buyUpgrade(ns, UpgradeName.SMART_FACTORIES, optimalData.smartFactoriesLevel);
    buyAdvert(ns, DivisionName.AGRICULTURE, targetAdvertLevel);

    for (const city of cities) {
        upgradeWarehouse(ns, DivisionName.AGRICULTURE, city, optimalData.warehouseLevel);
        ns.corporation.sellMaterial(DivisionName.AGRICULTURE, city, MaterialName.PLANTS, "MAX", "MP");
        ns.corporation.sellMaterial(DivisionName.AGRICULTURE, city, MaterialName.FOOD, "MAX", "MP");
    }

    await buyTeaAndThrowParty(ns, DivisionName.AGRICULTURE);

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

    const optimalAmountOfBoostMaterials = await findOptimalAmountOfBoostMaterials(
        ns,
        DivisionName.AGRICULTURE,
        agricultureIndustryData,
        CityName.Sector12,
        true,
        option.boostMaterialsRatio
    );
    await stockMaterials(
        ns,
        DivisionName.AGRICULTURE,
        generateMaterialsOrders(
            cities,
            [
                {name: MaterialName.AI_CORES, count: optimalAmountOfBoostMaterials[0]},
                {name: MaterialName.HARDWARE, count: optimalAmountOfBoostMaterials[1]},
                {name: MaterialName.REAL_ESTATE, count: optimalAmountOfBoostMaterials[2]},
                {name: MaterialName.ROBOTS, count: optimalAmountOfBoostMaterials[3]}
            ]
        )
    );
}

async function round2(option: Round2Option = PrecalculatedRound2Option.OPTION1): Promise<void> {
    ns.print(`Use: ${JSON.stringify(option)}`);

    if (enableTestingTools) {
        testingTools.setFunds(431e9);
    }
    const startingBudget = ns.corporation.getCorporation().funds;
    if (startingBudget < 431e9) {
        throw new Error("Your budget is too low");
    }

    buyUnlock(ns, UnlockName.EXPORT);

    // Upgrade Agriculture
    ns.print("Upgrade Agriculture division");
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

    // Create Chemical division
    await createDivision(ns, DivisionName.CHEMICAL, 3, 1);
    // Import materials, sell/export produced materials
    for (const city of cities) {
        // Export Plants from Agriculture to Chemical
        ns.corporation.cancelExportMaterial(DivisionName.AGRICULTURE, city, DivisionName.CHEMICAL, city, "Plants");
        ns.corporation.exportMaterial(DivisionName.AGRICULTURE, city, DivisionName.CHEMICAL, city, "Plants", exportString);

        // Export Chemicals from Chemical to Agriculture
        ns.corporation.cancelExportMaterial(DivisionName.CHEMICAL, city, DivisionName.AGRICULTURE, city, "Chemicals");
        ns.corporation.exportMaterial(DivisionName.CHEMICAL, city, DivisionName.AGRICULTURE, city, "Chemicals", exportString);
        // Sell Chemicals
        ns.corporation.sellMaterial(DivisionName.CHEMICAL, city, MaterialName.CHEMICALS, "MAX", "MP");
    }

    // Create dummy divisions
    createDummyDivisions(ns, 18);

    const dataArray = new CorporationBenchmark().optimizeStorageAndFactory(
        agricultureIndustryData,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_STORAGE),
        // Assume that all warehouses are at the same level
        ns.corporation.getWarehouse(DivisionName.AGRICULTURE, CityName.Sector12).level,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_FACTORIES),
        getDivisionResearches(ns, DivisionName.AGRICULTURE),
        ns.corporation.getCorporation().funds,
        false
    );
    if (dataArray.length === 0) {
        throw new Error("Cannot find optimal data");
    }
    const optimalData = dataArray[dataArray.length - 1];

    buyUpgrade(ns, UpgradeName.SMART_STORAGE, optimalData.smartStorageLevel);
    buyUpgrade(ns, UpgradeName.SMART_FACTORIES, optimalData.smartFactoriesLevel);
    for (const city of cities) {
        upgradeWarehouse(ns, DivisionName.AGRICULTURE, city, optimalData.warehouseLevel);
    }
    buyAdvert(
        ns,
        DivisionName.AGRICULTURE,
        getMaxAffordableAdVertLevel(
            ns.corporation.getHireAdVertCount(DivisionName.AGRICULTURE),
            ns.corporation.getCorporation().funds
        )
    );

    if (enableTestingTools) {
        testingTools.setEnergyAndMorale(DivisionName.AGRICULTURE, 100, 100);
        testingTools.setEnergyAndMorale(DivisionName.CHEMICAL, 100, 100);
        testingTools.setResearchPoints(DivisionName.AGRICULTURE, option.waitForAgricultureRP);
        testingTools.setResearchPoints(DivisionName.CHEMICAL, option.waitForChemicalRP);
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

    await buyTeaAndThrowParty(ns, DivisionName.AGRICULTURE);
    await buyTeaAndThrowParty(ns, DivisionName.CHEMICAL);

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
    assignJobs(
        ns,
        DivisionName.CHEMICAL,
        generateOfficeSetups(
            cities,
            3,
            [
                {name: EmployeePosition.OPERATIONS, count: 1},
                {name: EmployeePosition.ENGINEER, count: 1},
                {name: EmployeePosition.BUSINESS, count: 1},
                {name: EmployeePosition.MANAGEMENT, count: 0},
                {name: EmployeePosition.RESEARCH_DEVELOPMENT, count: 0}
            ]
        )
    );

    const optimalAmountOfBoostMaterialsForAgriculture = await findOptimalAmountOfBoostMaterials(
        ns,
        DivisionName.AGRICULTURE,
        agricultureIndustryData,
        CityName.Sector12,
        true,
        0.8
    );
    const optimalAmountOfBoostMaterialsForChemical = await findOptimalAmountOfBoostMaterials(
        ns,
        DivisionName.CHEMICAL,
        chemicalIndustryData,
        CityName.Sector12,
        true,
        0.95
    );
    await Promise.allSettled([
        stockMaterials(
            ns,
            DivisionName.AGRICULTURE,
            generateMaterialsOrders(
                cities,
                [
                    {name: MaterialName.AI_CORES, count: optimalAmountOfBoostMaterialsForAgriculture[0]},
                    {name: MaterialName.HARDWARE, count: optimalAmountOfBoostMaterialsForAgriculture[1]},
                    {name: MaterialName.REAL_ESTATE, count: optimalAmountOfBoostMaterialsForAgriculture[2]},
                    {name: MaterialName.ROBOTS, count: optimalAmountOfBoostMaterialsForAgriculture[3]},
                ]
            )
        ),
        stockMaterials(
            ns,
            DivisionName.CHEMICAL,
            generateMaterialsOrders(
                cities,
                [
                    {name: MaterialName.AI_CORES, count: optimalAmountOfBoostMaterialsForChemical[0]},
                    {name: MaterialName.HARDWARE, count: optimalAmountOfBoostMaterialsForChemical[1]},
                    {name: MaterialName.REAL_ESTATE, count: optimalAmountOfBoostMaterialsForChemical[2]},
                    {name: MaterialName.ROBOTS, count: optimalAmountOfBoostMaterialsForChemical[3]},
                ]
            )
        )
    ]);
}

async function round3(option: Round3Option = PrecalculatedRound3Option.OPTION1): Promise<void> {
    if (hasDivision(ns, DivisionName.TOBACCO)) {
        ns.spawn(ns.getScriptName(), {spawnDelay: 500}, "--improveAllDivisions");
        return;
    }

    ns.print(`Use: ${JSON.stringify(option)}`);

    if (enableTestingTools) {
        testingTools.setFunds(28e12);
    }
    const startingBudget = ns.corporation.getCorporation().funds;
    if (startingBudget < 10e12) {
        throw new Error("Your budget is too low");
    }

    buyUnlock(ns, UnlockName.MARKET_RESEARCH_DEMAND);
    buyUnlock(ns, UnlockName.MARKET_DATA_COMPETITION);

    if (ns.corporation.getCorporation().divisions.length === 20) {
        throw new Error("You need to sell 1 division");
    }

    // Create Tobacco division
    await createDivision(ns, DivisionName.TOBACCO, 9, 1);

    // Create dummy divisions
    createDummyDivisions(ns, 20 - ns.corporation.getCorporation().divisions.length);

    // Import materials
    for (const city of cities) {
        // We must prioritize Tobacco over Chemical when setting up export routes
        // Export Plants from Agriculture to Tobacco
        ns.corporation.cancelExportMaterial(DivisionName.AGRICULTURE, city, DivisionName.TOBACCO, city, "Plants");
        ns.corporation.exportMaterial(DivisionName.AGRICULTURE, city, DivisionName.TOBACCO, city, "Plants", exportString);

        // Export Plants from Agriculture to Chemical
        ns.corporation.cancelExportMaterial(DivisionName.AGRICULTURE, city, DivisionName.CHEMICAL, city, "Plants");
        ns.corporation.exportMaterial(DivisionName.AGRICULTURE, city, DivisionName.CHEMICAL, city, "Plants", exportString);
    }

    const agricultureDivision = ns.corporation.getDivision(DivisionName.AGRICULTURE);
    const chemicalDivision = ns.corporation.getDivision(DivisionName.CHEMICAL);
    const tobaccoDivision = ns.corporation.getDivision(DivisionName.TOBACCO);

    await improveProductDivision(
        DivisionName.TOBACCO,
        ns.corporation.getCorporation().funds * 0.9,
        false,
        false
    );

    await improveSupportDivision(
        DivisionName.AGRICULTURE,
        500e9,
        defaultBudgetRatioForSupportDivision,
        false,
        false
    );

    await improveSupportDivision(
        DivisionName.CHEMICAL,
        110e9,
        defaultBudgetRatioForSupportDivision,
        false,
        false
    );

    developNewProduct(
        ns,
        DivisionName.TOBACCO,
        mainProductDevelopmentCity,
        1e9
    );

    await Promise.allSettled([
        buyBoostMaterials(ns, agricultureDivision),
        buyBoostMaterials(ns, chemicalDivision),
        buyBoostMaterials(ns, tobaccoDivision),
    ]);

    ns.spawn(ns.getScriptName(), {spawnDelay: 500}, "--improveAllDivisions");
}

async function improveAllDivisions(): Promise<void> {
    const maxNumberOfProductsInRound3 = 2;
    const maxNumberOfProductsInRound4 = 4;
    let cycleCount = 0;
    if (globalThis.corporationCycleCount) {
        cycleCount = globalThis.corporationCycleCount;
    }
    const pendingImprovingDivisions = new Set<string>();
    const pendingBuyingBoostMaterialsDivisions = new Set<string>();
    const buyBoostMaterialsIfNeeded = (divisionName: string) => {
        if (!pendingBuyingBoostMaterialsDivisions.has(divisionName)) {
            pendingBuyingBoostMaterialsDivisions.add(divisionName);
            ns.print(`Buying boost materials for division: ${divisionName}`);
            buyBoostMaterials(ns, ns.corporation.getDivision(divisionName)).then(() => {
                ns.print(`Finish buying boost materials for division: ${divisionName}`);
                pendingBuyingBoostMaterialsDivisions.delete(divisionName);
            });
        }
    };

    await improveProductDivision(
        DivisionName.TOBACCO,
        ns.corporation.getCorporation().funds * 0.99 - 1e9,
        false,
        false
    );
    buyBoostMaterialsIfNeeded(DivisionName.TOBACCO);

    // We use preparingToAcceptOffer to prevent optimizing office right before we switch all offices to "profit" setup.
    // This eliminates a potential race condition.
    let preparingToAcceptOffer = false;
    // noinspection InfiniteLoopJS
    while (true) {
        ++cycleCount;
        const totalFunds = ns.corporation.getCorporation().funds;
        let availableFunds = totalFunds;
        const currentRound = ns.corporation.getInvestmentOffer().round;
        const profit = ns.corporation.getCorporation().revenue - ns.corporation.getCorporation().expenses;
        console.log(
            `cycleCount: ${cycleCount}. Funds: ${ns.formatNumber(ns.corporation.getCorporation().funds)}. Profit: ${ns.formatNumber(profit)}`
            + ((currentRound <= 4) ? `. Offer: ${ns.formatNumber(ns.corporation.getInvestmentOffer().funds)}` : "")
        );

        await buyResearch();

        // Buy Wilson ASAP if we can afford it with the last cycle's profit. Budget for Wilson and Advert is just part of
        // current funds, it's usually too low for our benchmark to calculate the optimal combination. The benchmark is
        // most suitable for big-budget situation, like after accepting investment offer.
        const currentWilsonLevel = ns.corporation.getUpgradeLevel(UpgradeName.WILSON_ANALYTICS);
        const maxWilsonLevel = getMaxAffordableUpgradeLevel(UpgradeName.WILSON_ANALYTICS, currentWilsonLevel, profit);
        if (maxWilsonLevel > currentWilsonLevel) {
            buyUpgrade(ns, UpgradeName.WILSON_ANALYTICS, maxWilsonLevel);
        }

        const tobaccoHasRevenue = ns.corporation.getDivision(DivisionName.TOBACCO).lastCycleRevenue > 0;
        const forceToUpgradeTobacco = (currentRound >= 4) &&
            (ns.corporation.getOfficeSizeUpgradeCost(DivisionName.TOBACCO, CityName.Sector12, 1)
                < profit * 0.001);
        if (forceToUpgradeTobacco) {
            console.debug(
                "forceToUpgradeTobacco",
                `office cost: ${ns.corporation.getOfficeSizeUpgradeCost(DivisionName.TOBACCO, CityName.Sector12, 1)}`
            );
        }
        if (tobaccoHasRevenue
            && !preparingToAcceptOffer
            && (cycleCount % 10 === 0 || forceToUpgradeTobacco || ns.corporation.getCorporation().funds > profit * (currentRound === 3 ? 1000 : 500))
            && !pendingImprovingDivisions.has(DivisionName.TOBACCO)) {
            const budgetForTobaccoDivision = totalFunds * 0.9;
            availableFunds -= budgetForTobaccoDivision;
            pendingImprovingDivisions.add(DivisionName.TOBACCO);
            console.log(`Upgrade ${DivisionName.TOBACCO}, budget: ${ns.formatNumber(budgetForTobaccoDivision)}`);
            console.time(DivisionName.TOBACCO);
            improveProductDivision(
                DivisionName.TOBACCO,
                budgetForTobaccoDivision,
                false,
                false
            ).catch(reason => {
                console.error(`Error occurred when upgrading ${DivisionName.TOBACCO}`, reason);
            }).finally(() => {
                console.timeEnd(DivisionName.TOBACCO);
                pendingImprovingDivisions.delete(DivisionName.TOBACCO);
                buyBoostMaterialsIfNeeded(DivisionName.TOBACCO);
            });
        }

        let needToDevelopNewProduct = true;
        // In round 3 and 4, we only develop up to maxNumberOfProducts
        let maxNumberOfProducts = maxNumberOfProductsInRound3;
        if (currentRound === 4) {
            maxNumberOfProducts = maxNumberOfProductsInRound4;
        }
        if (currentRound === 3 || currentRound === 4) {
            const productIdArray = getProductIdArray(ns, DivisionName.TOBACCO);
            let numberOfDevelopedProducts = 0;
            if (productIdArray.length > 0) {
                numberOfDevelopedProducts = Math.max(...productIdArray) + 1;
            }
            if (numberOfDevelopedProducts >= maxNumberOfProducts) {
                needToDevelopNewProduct = false;

                // If all products are finished, we wait for 15 cycles, then accept investment offer
                const products = ns.corporation.getDivision(DivisionName.TOBACCO).products;
                let allProductsAreFinished = true;
                for (const productName of products) {
                    const product = ns.corporation.getProduct(DivisionName.TOBACCO, mainProductDevelopmentCity, productName);
                    if (product.developmentProgress < 100) {
                        allProductsAreFinished = false;
                        break;
                    }
                }
                const getNewestProduct = () => {
                    return ns.corporation.getProduct(DivisionName.TOBACCO, mainProductDevelopmentCity, products[products.length - 1]);
                };
                let newestProduct = getNewestProduct();
                if (!preparingToAcceptOffer
                    && newestProduct.developmentProgress > 98
                    && newestProduct.developmentProgress < 100) {
                    preparingToAcceptOffer = true;
                }
                if (allProductsAreFinished) {
                    // Wait until newest product's effectiveRating is not 0
                    while (getNewestProduct().effectiveRating === 0) {
                        await waitForNumberOfCycles(ns, 1);
                        ++cycleCount;
                    }

                    // It may take some cycles to stabilize the product's effectiveRating. Waiting for only 1 cycle may
                    // be okay, but we should wait for 2 cycles to ensure that product's effectiveRating has been stabilized.
                    await waitForNumberOfCycles(ns, 2);
                    cycleCount += 2;

                    // Switch all offices to "profit" setup to maximize the offer
                    await switchAllOfficesToProfitSetup(
                        tobaccoIndustryData,
                        // We must use the latest data of product
                        getNewestProduct()
                    );

                    await waitForNumberOfCycles(ns, 15);
                    cycleCount += 15;
                    console.log(`Cycle: ${cycleCount}. Accept offer: ${ns.formatNumber(ns.corporation.getInvestmentOffer().funds)}`);
                    ns.corporation.acceptInvestmentOffer();
                    preparingToAcceptOffer = false;
                    continue;
                }
            }
        }
        if (needToDevelopNewProduct) {
            const productDevelopmentBudget = totalFunds * 0.01;
            availableFunds -= productDevelopmentBudget;
            developNewProduct(
                ns,
                DivisionName.TOBACCO,
                mainProductDevelopmentCity,
                productDevelopmentBudget
            );
        }

        const forceToUpgradeAgriculture = (currentRound === 4) &&
            (ns.corporation.getOfficeSizeUpgradeCost(DivisionName.AGRICULTURE, CityName.Sector12, 1)
                < profit * 0.0001);
        if (forceToUpgradeAgriculture) {
            console.debug("forceToUpgradeAgriculture");
        }
        if (tobaccoHasRevenue
            && (cycleCount % 20 === 0 || forceToUpgradeAgriculture)
            && !pendingImprovingDivisions.has(DivisionName.AGRICULTURE)) {
            const budgetForAgricultureDivision = Math.max(
                Math.min(profit * 0.95, totalFunds * 0.09, availableFunds),
                0
            );
            availableFunds -= budgetForAgricultureDivision;
            pendingImprovingDivisions.add(DivisionName.AGRICULTURE);
            console.log(`Upgrade ${DivisionName.AGRICULTURE}, budget: ${ns.formatNumber(budgetForAgricultureDivision)}`);
            console.time(DivisionName.AGRICULTURE);
            improveSupportDivision(
                DivisionName.AGRICULTURE,
                budgetForAgricultureDivision,
                defaultBudgetRatioForSupportDivision,
                false,
                false
            ).catch(reason => {
                console.error(`Error occurred when upgrading ${DivisionName.AGRICULTURE}`, reason);
            }).finally(() => {
                console.timeEnd(DivisionName.AGRICULTURE);
                pendingImprovingDivisions.delete(DivisionName.AGRICULTURE);
                buyBoostMaterialsIfNeeded(DivisionName.AGRICULTURE);
            });
        }
        const forceToUpgradeChemical = (currentRound === 4) &&
            (ns.corporation.getOfficeSizeUpgradeCost(DivisionName.CHEMICAL, CityName.Sector12, 1)
                < profit * 0.0001);
        if (forceToUpgradeChemical) {
            console.debug("forceToUpgradeChemical");
        }
        if (tobaccoHasRevenue
            && (cycleCount % 20 === 0 || forceToUpgradeChemical)
            && !pendingImprovingDivisions.has(DivisionName.CHEMICAL)) {
            const budgetForChemicalDivision = Math.max(
                Math.min(profit * 0.05, totalFunds * 0.01, availableFunds),
                0
            );
            availableFunds -= budgetForChemicalDivision;
            pendingImprovingDivisions.add(DivisionName.CHEMICAL);
            console.log(`Upgrade ${DivisionName.CHEMICAL}, budget: ${ns.formatNumber(budgetForChemicalDivision)}`);
            console.time(DivisionName.CHEMICAL);
            improveSupportDivision(
                DivisionName.CHEMICAL,
                budgetForChemicalDivision,
                defaultBudgetRatioForSupportDivision,
                false,
                false
            ).catch(reason => {
                console.error(`Error occurred when upgrading ${DivisionName.CHEMICAL}`, reason);
            }).finally(() => {
                console.timeEnd(DivisionName.CHEMICAL);
                pendingImprovingDivisions.delete(DivisionName.CHEMICAL);
                buyBoostMaterialsIfNeeded(DivisionName.CHEMICAL);
            });
        }

        const producedPlants = ns.corporation.getMaterial(DivisionName.AGRICULTURE, mainProductDevelopmentCity, MaterialName.PLANTS).productionAmount;
        const consumedPlants = Math.abs(
            ns.corporation.getMaterial(DivisionName.TOBACCO, mainProductDevelopmentCity, MaterialName.PLANTS).productionAmount
        );
        if (consumedPlants > 0 && producedPlants / consumedPlants < 1) {
            console.debug(`plants ratio: ${producedPlants / consumedPlants}`);
        }

        const mainOffice = ns.corporation.getOffice(DivisionName.TOBACCO, mainProductDevelopmentCity);
        if (mainOffice.employeeJobs.Operations >= mainOffice.numEmployees * 0.19
            || mainOffice.employeeJobs.Engineer <= mainOffice.numEmployees * 0.11
            || mainOffice.employeeJobs.Management <= mainOffice.numEmployees * 0.26
            || mainOffice.employeeJobs.Management >= mainOffice.numEmployees * 0.64) {
            console.error(
                `cycle count: ${cycleCount}, numEmployees: ${mainOffice.numEmployees}, ` +
                `employeeJobs: ${JSON.stringify(mainOffice.employeeJobs)}`
            );
        }

        await waitUntilAfterStateHappens(ns, CorpState.START);
    }
}

async function switchAllOfficesToProfitSetup(industryData: CorpIndustryData, newestProduct: Product) {
    const mainOffice = ns.corporation.getOffice(DivisionName.TOBACCO, mainProductDevelopmentCity);
    const dataArray = await optimizeOffice(
        ns,
        ns.corporation.getDivision(DivisionName.TOBACCO),
        industryData,
        mainProductDevelopmentCity,
        mainOffice.numEmployees,
        0,
        newestProduct,
        true,
        "profit",
        0, // Do not rerun
        true
    );
    const optimalData = dataArray[dataArray.length - 1];
    console.log(`Optimize all offices for "profit"`, optimalData);
    assignJobs(
        ns,
        DivisionName.TOBACCO,
        [
            {
                city: mainProductDevelopmentCity,
                size: mainOffice.numEmployees,
                jobs: {
                    Operations: optimalData.operations,
                    Engineer: optimalData.engineer,
                    Business: optimalData.business,
                    Management: optimalData.management,
                    "Research & Development": 0,
                }
            }
        ]
    );
    // Reuse the ratio of main office. This is not entirely correct, but it's still good enough. We do
    // this to reduce the computing time needed to find and switch the optimal office setups.
    for (const city of supportProductDevelopmentCities) {
        const office = ns.corporation.getOffice(DivisionName.TOBACCO, city);
        const operations = Math.max(
            Math.floor(office.numEmployees * (optimalData.operations / mainOffice.numEmployees)), 1
        );
        const engineer = Math.max(
            Math.floor(office.numEmployees * (optimalData.engineer / mainOffice.numEmployees)), 1
        );
        const business = Math.max(
            Math.floor(office.numEmployees * (optimalData.business / mainOffice.numEmployees)), 1
        );
        const management = office.numEmployees - (operations + engineer + business);
        assignJobs(
            ns,
            DivisionName.TOBACCO,
            [
                {
                    city: city,
                    size: office.numEmployees,
                    jobs: {
                        Operations: operations,
                        Engineer: engineer,
                        Business: business,
                        Management: management,
                        "Research & Development": 0,
                    }
                }
            ]
        );
    }
}

async function buyResearch(): Promise<void> {
    if (ns.corporation.getInvestmentOffer().round <= 3) {
        return;
    }
    const buyResearches = (divisionName: string) => {
        let researchPriorities: ResearchPriority[];
        if (divisionName === DivisionName.AGRICULTURE || divisionName === DivisionName.CHEMICAL) {
            researchPriorities = researchPrioritiesForSupportDivision;
        } else {
            researchPriorities = researchPrioritiesForProductDivision;
        }
        for (const researchPriority of researchPriorities) {
            if (ns.corporation.hasResearched(divisionName, researchPriority.research)) {
                continue;
            }
            const researchCost = ns.corporation.getResearchCost(divisionName, researchPriority.research);
            if (ns.corporation.getDivision(divisionName).researchPoints < researchCost * researchPriority.costMultiplier) {
                break;
            }
            ns.corporation.research(divisionName, researchPriority.research);
        }
    };

    buyResearches(DivisionName.AGRICULTURE);
    buyResearches(DivisionName.CHEMICAL);
    buyResearches(DivisionName.TOBACCO);
}

/**
 * This function assumes that all city setups (office + warehouse) in the division are the same
 *
 * @param divisionName
 * @param totalBudget
 * @param budgetRatio
 * @param dryRun
 * @param enableLogging
 * @param customData
 */
async function improveSupportDivision(
    divisionName: string,
    totalBudget: number,
    budgetRatio: {
        warehouse: number;
        office: number;
    },
    dryRun: boolean,
    enableLogging: boolean,
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
    }
): Promise<void> {
    if (totalBudget < 0) {
        return;
    }
    const logger = new Logger(enableLogging);
    const currentFunds = ns.corporation.getCorporation().funds;

    const warehouseBudget = totalBudget * budgetRatio.warehouse / 6;
    const officeBudget = totalBudget * budgetRatio.office / 6;
    const officeSetups: OfficeSetup[] = [];
    for (const city of cities) {
        logger.city = city;
        // Warehouse
        const currentWarehouseLevel = ns.corporation.getWarehouse(divisionName, city).level;
        let newWarehouseLevel: number;
        if (customData?.warehouse) {
            newWarehouseLevel = customData.warehouse;
        } else {
            newWarehouseLevel = getMaxAffordableWarehouseLevel(currentWarehouseLevel, warehouseBudget);
        }
        if (newWarehouseLevel > currentWarehouseLevel && !dryRun) {
            ns.corporation.upgradeWarehouse(divisionName, city, newWarehouseLevel - currentWarehouseLevel);
        }
        logger.log(
            `Division ${divisionName}: currentWarehouseLevel: ${currentWarehouseLevel}, `
            + `newWarehouseLevel: ${ns.corporation.getWarehouse(divisionName, city).level}`
        );
    }

    // We use Sector-12's office as the base to find the optimal setup for all cities' offices. This is not entirely
    // accurate, because each office has different employee's stats. However, the optimal setup of each office won't be
    // much different even with that concern.
    const city = CityName.Sector12;
    logger.city = city;
    // Office
    const office = ns.corporation.getOffice(divisionName, city);
    const maxOfficeSize = getMaxAffordableOfficeSize(office.size, officeBudget);
    logger.log(`City: ${city}. currentOfficeSize: ${office.size}, maxOfficeSize: ${maxOfficeSize}`);
    if (maxOfficeSize < 6) {
        throw new Error(`Budget for office is too low. Division: ${divisionName}. Office's budget: ${ns.formatNumber(officeBudget)}`);
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
        switch (divisionName) {
            case DivisionName.AGRICULTURE:
                item = ns.corporation.getMaterial(divisionName, city, MaterialName.PLANTS);
                break;
            case DivisionName.CHEMICAL:
                item = ns.corporation.getMaterial(divisionName, city, MaterialName.CHEMICALS);
                break;
            default:
                throw new Error(`Invalid division: ${divisionName}`);
        }
        if (maxOfficeSize - minRnDEmployee < 3) {
            throw new Error(`Budget for office is too low. Division: ${divisionName}. Office's budget: ${ns.formatNumber(officeBudget)}`);
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
            const division = ns.corporation.getDivision(divisionName);
            const industryData = ns.corporation.getIndustryData(division.type);
            const dataArray = await optimizeOffice(
                ns,
                division,
                industryData,
                city,
                maxOfficeSize - minRnDEmployee,
                minRnDEmployee,
                item,
                true,
                "rawProduction",
                0, // Do not rerun
                enableLogging
            );
            if (dataArray.length === 0) {
                showWarning(
                    ns,
                    `Cannot calculate optimal office setup. Division: ${divisionName}, `
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
    for (const city of cities) {
        officeSetups.push({
            city: city,
            size: officeSetup.size,
            jobs: officeSetup.jobs
        });
    }
    logger.city = undefined;
    if (!dryRun) {
        upgradeOffices(ns, divisionName, officeSetups);
    }
    logger.log(`Spent: ${ns.formatNumber(currentFunds - ns.corporation.getCorporation().funds)}`);
}

function improveProductDivisionRawProduction(
    divisionName: string,
    industryData: CorpIndustryData,
    divisionResearches: DivisionResearches,
    budget: number,
    dryRun: boolean,
    benchmark: CorporationBenchmark,
    enableLogging: boolean
): void {
    const logger = new Logger(enableLogging);
    const dataArray = benchmark.optimizeStorageAndFactory(
        industryData,
        ns.corporation.getUpgradeLevel(UpgradeName.SMART_STORAGE),
        // Assume that all warehouses are at the same level
        ns.corporation.getWarehouse(divisionName, CityName.Sector12).level,
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
            const currentWarehouseLevel = ns.corporation.getWarehouse(divisionName, city).level;
            if (optimalData.warehouseLevel > currentWarehouseLevel) {
                ns.corporation.upgradeWarehouse(
                    divisionName,
                    city,
                    optimalData.warehouseLevel - currentWarehouseLevel
                );
            }
        }
    }
}

function improveProductDivisionWilsonAdvert(
    divisionName: string,
    industryData: CorpIndustryData,
    divisionResearches: DivisionResearches,
    budget: number,
    dryRun: boolean,
    benchmark: CorporationBenchmark,
    enableLogging: boolean
): void {
    const logger = new Logger(enableLogging);
    const dataArray = benchmark.optimizeWilsonAndAdvert(
        industryData,
        ns.corporation.getUpgradeLevel(UpgradeName.WILSON_ANALYTICS),
        ns.corporation.getHireAdVertCount(divisionName),
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
        buyAdvert(ns, divisionName, optimalData.advertLevel);
    }
}

async function improveProductDivisionMainOffice(
    divisionName: string,
    industryData: CorpIndustryData,
    budget: number,
    dryRun: boolean,
    enableLogging: boolean
): Promise<void> {
    const logger = new Logger(enableLogging);
    const division = ns.corporation.getDivision(divisionName);
    const office = ns.corporation.getOffice(divisionName, mainProductDevelopmentCity);
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
    let sortType: OfficeBenchmarkSortType;
    if (ns.corporation.getInvestmentOffer().round === 3) {
        sortType = "progress";
    } else {
        sortType = "profit_progress";
    }
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
        item = ns.corporation.getProduct(divisionName, mainProductDevelopmentCity, products[products.length - 1]);
        logger.log(`Use product: ${JSON.stringify(item)}`);
    }
    const dataArray = await optimizeOffice(
        ns,
        division,
        industryData,
        mainProductDevelopmentCity,
        maxOfficeSize,
        0,
        item,
        false,
        sortType,
        maxRerunWhenOptimizingOfficeForProductDivision,
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
        upgradeOffices(ns, divisionName, [officeSetup]);
    }
}

async function improveProductDivisionSupportOffices(
    divisionName: string,
    budget: number,
    dryRun: boolean,
    enableLogging: boolean
): Promise<void> {
    const logger = new Logger(enableLogging);
    const officeSetups: OfficeSetup[] = [];
    if (budget > ns.corporation.getCorporation().funds) {
        // Bypass usage of logger. If this happens, there is race condition. We must be notified about it.
        console.warn(
            `Budget is higher than current funds. Budget: ${ns.formatNumber(budget)}, `
            + `funds: ${ns.formatNumber(ns.corporation.getCorporation().funds)}`
        );
        budget = ns.corporation.getCorporation().funds * 0.9;
    }
    let budgetForEachOffice = budget / 5;
    for (const city of supportProductDevelopmentCities) {
        const office = ns.corporation.getOffice(divisionName, city);
        const maxOfficeSize = getMaxAffordableOfficeSize(office.size, budgetForEachOffice);
        if (maxOfficeSize < 5) {
            throw new Error(`Budget for office is too low. Division: ${divisionName}. Office's budget: ${ns.formatNumber(budgetForEachOffice)}`);
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
        upgradeOffices(ns, divisionName, officeSetups);
    }
}

async function improveProductDivisionOffices(
    divisionName: string,
    industryData: CorpIndustryData,
    budget: number,
    dryRun: boolean,
    enableLogging: boolean
): Promise<void> {
    await improveProductDivisionMainOffice(
        divisionName,
        industryData,
        budget * 0.25,
        dryRun,
        enableLogging
    );
    await improveProductDivisionSupportOffices(
        divisionName,
        budget * 0.75,
        dryRun,
        enableLogging
    );
}

async function improveProductDivision(
    divisionName: string,
    totalBudget: number,
    dryRun: boolean,
    enableLogging: boolean
): Promise<void> {
    if (totalBudget < 0) {
        return;
    }
    const logger = new Logger(enableLogging);
    const division = ns.corporation.getDivision(divisionName);
    const industryData = ns.corporation.getIndustryData(division.type);
    const divisionResearches = getDivisionResearches(ns, divisionName);
    const benchmark = new CorporationBenchmark();
    const currentFunds = ns.corporation.getCorporation().funds;

    let budgetRatio = defaultBudgetRatioForProductDivision;
    if (division.awareness === Number.MAX_VALUE) {
        budgetRatio = budgetRatioForProductDivisionAfterMaxAdvertBenefits;
    }

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
        division.name,
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
        division.name,
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
        division.name,
        industryData,
        officesBudget,
        dryRun,
        enableLogging
    );

    logger.log(`Spent: ${ns.formatNumber(currentFunds - ns.corporation.getCorporation().funds)}`);
}

async function test(): Promise<void> {
}

export async function main(nsContext: NS): Promise<void> {
    init(nsContext);

    if (ns.getResetInfo().currentNode !== 3) {
        throw new Error("This script is specialized for BN3");
    }

    config = ns.flags(defaultConfig);
    if (config.help === true) {
        ns.tprint(`Default config: ${defaultConfig}`);
        return;
    }

    ns.disableLog("ALL");
    // ns.tail();
    ns.clearLog();

    if (!ns.corporation.hasCorporation()) {
        if (!ns.corporation.createCorporation("Corp", config.selfFund as boolean)) {
            ns.print(`Cannot create corporation`);
            return;
        }
    }

    agricultureIndustryData = ns.corporation.getIndustryData(IndustryType.AGRICULTURE);
    chemicalIndustryData = ns.corporation.getIndustryData(IndustryType.CHEMICAL);
    tobaccoIndustryData = ns.corporation.getIndustryData(IndustryType.TOBACCO);

    if (config.benchmark === true && testingTools.isTestingToolsAvailable()) {
        enableTestingTools = true;
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
    if (config.test) {
        ns.tail();
        await test();
        return;
    }
}

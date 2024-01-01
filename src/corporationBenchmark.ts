import {CorpIndustryData, Division, Material, Product} from "@ns";
import * as comlink from "/libs/comlink";
import {getOptimalBoostMaterialQuantities, getProductMarkup, isProduct, Logger} from "/corporationUtils";
import {
    CityName,
    CorporationUpgradeLevels,
    DivisionResearches,
    formatNumber,
    getAdVertCost,
    getAdvertisingFactors,
    getBusinessFactor,
    getDivisionProductionMultiplier,
    getDivisionRawProduction,
    getEmployeeProductionByJobs,
    getMarketFactor,
    getMaxAffordableAdVertLevel,
    getMaxAffordableUpgradeLevel,
    getMaxAffordableWarehouseLevel,
    getResearchAdvertisingMultiplier,
    getResearchRPMultiplier,
    getResearchSalesMultiplier,
    getUpgradeBenefit,
    getUpgradeCost,
    getUpgradeWarehouseCost,
    getWarehouseSize,
    UpgradeName
} from "/corporationFormulas";
import {CorpMaterialsData} from "/data/CorpMaterialsData";
import {CorpUpgradesData} from "/data/CorpUpgradesData";
import {PriorityQueue} from "/libs/priorityQueue";
import {scaleValueToRange} from "/libs/utils";

export enum BenchmarkType {
    STORAGE_FACTORY,
    WILSON_ADVERT,
    OFFICE
}

export interface StorageFactoryBenchmarkData {
    smartStorageLevel: number;
    warehouseLevel: number;
    smartFactoriesLevel: number;
    upgradeSmartStorageCost: number;
    upgradeWarehouseCost: number;
    warehouseSize: number;
    totalCost: number;
    production: number;
    costPerProduction: number;
    boostMaterials: number[];
    boostMaterialMultiplier: number;
}

export interface WilsonAdvertBenchmarkData {
    wilsonLevel: number;
    advertLevel: number;
    totalCost: number;
    popularity: number;
    awareness: number;
    ratio: number;
    advertisingFactor: number;
    costPerAdvertisingFactor: number;
}

export interface OfficeBenchmarkData {
    operations: number;
    engineer: number;
    business: number;
    management: number;
    totalExperience: number;
    rawProduction: number;
    maxSalesVolume: number;
    optimalPrice: number;
    productDevelopmentProgress: number;
    estimatedRP: number;
    productRating: number;
    productMarkup: number;
    profit: number;
}

export type OfficeBenchmarkSortType = "rawProduction" | "progress" | "profit" | "profit_progress";

export interface OfficeBenchmarkCustomData {
    office: {
        avgMorale: number;
        avgEnergy: number;
        avgIntelligence: number;
        avgCharisma: number;
        avgCreativity: number;
        avgEfficiency: number;
        totalExperience: number;
    };
    corporationUpgradeLevels: CorporationUpgradeLevels;
    divisionResearches: DivisionResearches;
    performanceModifier: number;
}

export interface EmployeeJobRequirement {
    engineer: number;
    business: number;
}

const defaultMinForNormalization = 0;
const defaultMaxForNormalization = 20;
const referenceValueModifier = 10;
const balancingModifierForProfitProgress = {
    profit: 1,
    progress: 35
};

export async function getReferenceData(
    division: Division,
    industryData: CorpIndustryData,
    maxNonRnDEmployees: number,
    item: Material | Product,
    useCurrentItemData: boolean,
    customData: OfficeBenchmarkCustomData
): Promise<OfficeBenchmarkData> {
    const operations = Math.floor(maxNonRnDEmployees * 0.06);
    const engineer = Math.floor(maxNonRnDEmployees * 0.3);
    const business = Math.floor(maxNonRnDEmployees * 0.08);
    const management = maxNonRnDEmployees - (operations + engineer + business);
    return await calculateOfficeBenchmarkData(
        division,
        industryData,
        item,
        useCurrentItemData,
        customData,
        operations,
        engineer,
        business,
        management,
        0,
        getUpgradeBenefit(
            UpgradeName.ABC_SALES_BOTS,
            customData.corporationUpgradeLevels[UpgradeName.ABC_SALES_BOTS]
        ),
        getResearchSalesMultiplier(customData.divisionResearches),
        false
    );
}

export function normalizeProfit(profit: number, referenceValue: number): number {
    return scaleValueToRange(
        profit,
        referenceValue / referenceValueModifier,
        referenceValue * referenceValueModifier,
        defaultMinForNormalization,
        defaultMaxForNormalization
    );
}

export function normalizeProgress(progress: number): number {
    return scaleValueToRange(progress, 0, 100, defaultMinForNormalization, defaultMaxForNormalization);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getComparator(benchmarkType: BenchmarkType, sortType?: string, referenceData?: OfficeBenchmarkData): (a: any, b: any) => number {
    switch (benchmarkType) {
        case BenchmarkType.STORAGE_FACTORY:
            return (a: StorageFactoryBenchmarkData, b: StorageFactoryBenchmarkData) => {
                if (!a || !b) {
                    return 1;
                }
                if (a.production !== b.production) {
                    return a.production - b.production;
                }
                return b.totalCost - a.totalCost;
            };
        case BenchmarkType.WILSON_ADVERT:
            return (a: WilsonAdvertBenchmarkData, b: WilsonAdvertBenchmarkData) => {
                if (!a || !b) {
                    return 1;
                }
                if (sortType === "totalCost") {
                    return b.totalCost - a.totalCost;
                }
                if (a.advertisingFactor !== b.advertisingFactor) {
                    return a.advertisingFactor - b.advertisingFactor;
                }
                return b.totalCost - a.totalCost;
            };
        case BenchmarkType.OFFICE:
            return (a: OfficeBenchmarkData, b: OfficeBenchmarkData) => {
                if (!a || !b) {
                    return 1;
                }
                if (a.totalExperience !== b.totalExperience) {
                    return a.totalExperience - b.totalExperience;
                }
                if (sortType === "rawProduction") {
                    return a.rawProduction - b.rawProduction;
                }
                if (sortType === "progress") {
                    return a.productDevelopmentProgress - b.productDevelopmentProgress;
                }
                if (sortType === "profit") {
                    return a.profit - b.profit;
                }
                if (!referenceData) {
                    throw new Error(`Invalid reference data`);
                }
                const normalizedProfitOfA = normalizeProfit(a.profit, referenceData.profit);
                const normalizedProgressOfA = normalizeProgress(a.productDevelopmentProgress);
                const normalizedProfitOfB = normalizeProfit(b.profit, referenceData.profit);
                const normalizedProgressOfB = normalizeProgress(b.productDevelopmentProgress);
                if (!Number.isFinite(normalizedProfitOfA) || !Number.isFinite(normalizedProfitOfB)) {
                    throw new Error(
                        `Invalid profit: a.profit: ${a.profit.toExponential()}, b.profit: ${b.profit.toExponential()}`
                        + `, referenceData.profit: ${referenceData.profit.toExponential()}`
                    );
                }
                if (sortType === "profit_progress") {
                    return (balancingModifierForProfitProgress.profit * normalizedProfitOfA
                            + balancingModifierForProfitProgress.progress * normalizedProgressOfA)
                        - (balancingModifierForProfitProgress.profit * normalizedProfitOfB
                            + balancingModifierForProfitProgress.progress * normalizedProgressOfB);
                }
                throw new Error(`Invalid sort type: ${sortType}`);
            };
        default:
            throw new Error(`Invalid benchmark type`);
    }
}

const awarenessMap = new Map<string, number>();
const popularityMap = new Map<string, number>();

const defaultLengthOfBenchmarkDataArray = 10;

export const defaultPerformanceModifierForOfficeBenchmark = 40;
export const minStepForOfficeBenchmark = 2;

export async function calculateOfficeBenchmarkData(
    division: Division,
    industryData: CorpIndustryData,
    item: Material | Product,
    useCurrentItemData: boolean,
    customData: {
        office: {
            avgMorale: number;
            avgEnergy: number;
            avgIntelligence: number;
            avgCharisma: number;
            avgCreativity: number;
            avgEfficiency: number;
            totalExperience: number
        };
        corporationUpgradeLevels: CorporationUpgradeLevels;
        divisionResearches: DivisionResearches;
        step?: number
    },
    operations: number,
    engineer: number,
    business: number,
    management: number,
    rnd: number,
    salesBotUpgradeBenefit: number,
    researchSalesMultiplier: number,
    enableLogging = false
): Promise<OfficeBenchmarkData> {
    const itemIsProduct = isProduct(item);
    const employeesProduction = getEmployeeProductionByJobs(
        {
            avgIntelligence: customData.office.avgIntelligence,
            avgCharisma: customData.office.avgCharisma,
            avgCreativity: customData.office.avgCreativity,
            avgEfficiency: customData.office.avgEfficiency,
            avgMorale: customData.office.avgMorale,
            avgEnergy: customData.office.avgEnergy,
            totalExperience: customData.office.totalExperience,
            employeeJobs: {
                operations: operations,
                engineer: engineer,
                business: business,
                management: management,
                researchAndDevelopment: rnd,
                intern: 0,
                unassigned: 0
            }
        },
        customData.corporationUpgradeLevels,
        customData.divisionResearches
    );
    const rawProduction = getDivisionRawProduction(
        itemIsProduct,
        {
            operationsProduction: employeesProduction.operationsProduction,
            engineerProduction: employeesProduction.engineerProduction,
            managementProduction: employeesProduction.managementProduction,
        },
        division.productionMult,
        customData.corporationUpgradeLevels,
        customData.divisionResearches
    );

    let productDevelopmentProgress = 0;
    let estimatedRP = 0;
    let productEffectiveRating = 0;
    let productMarkup = 0;
    let demand: number;
    let competition: number;

    let itemMultiplier: number;
    let markupLimit: number;
    let marketPrice: number;

    if (itemIsProduct) {
        // Calculate progress
        const totalProductionForProductDev = employeesProduction.operationsProduction
            + employeesProduction.engineerProduction
            + employeesProduction.managementProduction;
        const managementFactor = 1 + employeesProduction.managementProduction / (1.2 * totalProductionForProductDev);
        productDevelopmentProgress = 0.01 * (
                Math.pow(employeesProduction.engineerProduction, 0.34)
                + Math.pow(employeesProduction.operationsProduction, 0.2)
            )
            * managementFactor;

        if (!useCurrentItemData) {
            // Estimate RP gain
            const cycles = 100 / productDevelopmentProgress;
            const employeesProductionInSupportCities = getEmployeeProductionByJobs(
                {
                    // Reuse employees' stats of main office. This is fine because we only calculate the estimated value,
                    // not the exact value.
                    avgIntelligence: customData.office.avgIntelligence,
                    avgCharisma: customData.office.avgCharisma,
                    avgCreativity: customData.office.avgCreativity,
                    avgEfficiency: customData.office.avgEfficiency,
                    avgMorale: customData.office.avgMorale,
                    avgEnergy: customData.office.avgEnergy,
                    totalExperience: customData.office.totalExperience,
                    employeeJobs: {
                        operations: 1,
                        engineer: 1,
                        business: 1,
                        management: 1,
                        researchAndDevelopment: operations + engineer + business + management - 4,
                        intern: 0,
                        unassigned: 0
                    }
                },
                customData.corporationUpgradeLevels,
                customData.divisionResearches
            );
            const researchPointGainPerCycle =
                5 // 5 support cities
                * 4 * 0.004 * Math.pow(employeesProductionInSupportCities.researchAndDevelopmentProduction, 0.5)
                * getUpgradeBenefit(UpgradeName.PROJECT_INSIGHT, customData.corporationUpgradeLevels[UpgradeName.PROJECT_INSIGHT])
                * getResearchRPMultiplier(customData.divisionResearches);
            estimatedRP = division.researchPoints + researchPointGainPerCycle * cycles;

            // Calculate product.stats
            const productStats: Record<string, number> = {
                quality: 0,
                performance: 0,
                durability: 0,
                reliability: 0,
                aesthetics: 0,
                features: 0,
            };
            // If we assume that office setup does not change, we can use employeesProduction instead of creationJobFactors
            const totalProduction =
                employeesProduction.engineerProduction
                + employeesProduction.managementProduction
                + employeesProduction.researchAndDevelopmentProduction
                + employeesProduction.operationsProduction
                + employeesProduction.businessProduction;

            const engineerRatio = employeesProduction.engineerProduction / totalProduction;
            const managementRatio = employeesProduction.managementProduction / totalProduction;
            const researchAndDevelopmentRatio = employeesProduction.researchAndDevelopmentProduction / totalProduction;
            const operationsRatio = employeesProduction.operationsProduction / totalProduction;
            const businessRatio = employeesProduction.businessProduction / totalProduction;
            // Reuse designInvestment of latest product
            const designInvestmentMultiplier = 1 + (Math.pow(item.designInvestment, 0.1)) / 100;
            const scienceMultiplier = 1 + (Math.pow(estimatedRP, industryData.scienceFactor!)) / 800;
            const balanceMultiplier =
                1.2 * engineerRatio
                + 0.9 * managementRatio
                + 1.3 * researchAndDevelopmentRatio
                + 1.5 * operationsRatio
                + businessRatio;
            const totalMultiplier = balanceMultiplier * designInvestmentMultiplier * scienceMultiplier;
            productStats.quality = totalMultiplier * (
                0.1 * employeesProduction.engineerProduction
                + 0.05 * employeesProduction.managementProduction
                + 0.05 * employeesProduction.researchAndDevelopmentProduction
                + 0.02 * employeesProduction.operationsProduction
                + 0.02 * employeesProduction.businessProduction
            );
            productStats.performance = totalMultiplier * (
                0.15 * employeesProduction.engineerProduction
                + 0.02 * employeesProduction.managementProduction
                + 0.02 * employeesProduction.researchAndDevelopmentProduction
                + 0.02 * employeesProduction.operationsProduction
                + 0.02 * employeesProduction.businessProduction
            );
            productStats.durability = totalMultiplier * (
                0.05 * employeesProduction.engineerProduction
                + 0.02 * employeesProduction.managementProduction
                + 0.08 * employeesProduction.researchAndDevelopmentProduction
                + 0.05 * employeesProduction.operationsProduction
                + 0.05 * employeesProduction.businessProduction
            );
            productStats.reliability = totalMultiplier * (
                0.02 * employeesProduction.engineerProduction
                + 0.08 * employeesProduction.managementProduction
                + 0.02 * employeesProduction.researchAndDevelopmentProduction
                + 0.05 * employeesProduction.operationsProduction
                + 0.08 * employeesProduction.businessProduction
            );
            productStats.aesthetics = totalMultiplier * (
                +0.08 * employeesProduction.managementProduction
                + 0.05 * employeesProduction.researchAndDevelopmentProduction
                + 0.02 * employeesProduction.operationsProduction
                + 0.1 * employeesProduction.businessProduction
            );
            productStats.features = totalMultiplier * (
                0.08 * employeesProduction.engineerProduction
                + 0.05 * employeesProduction.managementProduction
                + 0.02 * employeesProduction.researchAndDevelopmentProduction
                + 0.05 * employeesProduction.operationsProduction
                + 0.05 * employeesProduction.businessProduction
            );

            // Calculate product.rating
            let productRating = 0;
            const weights = industryData.product!.ratingWeights;
            for (const [statName, coefficient] of Object.entries(weights)) {
                productRating += productStats[statName] * coefficient;
            }

            // If we assume that input materials' average quality is high enough, we can use productRating
            // directly instead of having to calculate effectiveRating. Calculating effectiveRating is not important
            // here because we only want to know the relative difference between different office setups.
            productEffectiveRating = productRating;

            // Calculate product.markup
            // Reuse advertisingInvestment of latest product
            const advertisingInvestmentMultiplier = 1 + (Math.pow(item.advertisingInvestment, 0.1)) / 100;
            const businessManagementRatio = Math.max(
                businessRatio + managementRatio,
                1 / totalProduction
            );
            productMarkup = 100 / (
                advertisingInvestmentMultiplier * Math.pow(productStats.quality + 0.001, 0.65) * businessManagementRatio
            );

            // Calculate demand/competition
            demand = division.awareness === 0
                ? 20
                : Math.min(
                    100,
                    advertisingInvestmentMultiplier * (100 * (division.popularity / division.awareness))
                );
            // Hard-coded value of getRandomInt(0, 70). We don't want RNG here.
            competition = 35;
        } else {
            productEffectiveRating = item.effectiveRating;
            productMarkup = await getProductMarkup(
                division,
                industryData,
                CityName.Sector12,
                item,
                undefined
            );
            if (!item.demand || !item.competition) {
                throw new Error(`You need to unlock "Market Research - Demand" and "Market Data - Competition"`);
            }
            demand = item.demand;
            competition = item.competition;
        }

        itemMultiplier = 0.5 * Math.pow(productEffectiveRating, 0.65);
        markupLimit = Math.max(productEffectiveRating, 0.001) / productMarkup;
        // Reuse marketPrice of latest product. productionCost only depends on input materials' market
        // price and coefficient.
        marketPrice = item.productionCost;
    } else {
        if (!item.demand || !item.competition) {
            throw new Error(`You need to unlock "Market Research - Demand" and "Market Data - Competition"`);
        }
        demand = item.demand;
        competition = item.competition;
        itemMultiplier = item.quality + 0.001;
        markupLimit = item.quality / CorpMaterialsData[item.name].baseMarkup;
        marketPrice = item.marketPrice;
    }

    const marketFactor = getMarketFactor(demand, competition);
    const businessFactor = getBusinessFactor(employeesProduction.businessProduction);
    const advertisingFactor = getAdvertisingFactors(
        division.awareness,
        division.popularity,
        industryData.advertisingFactor!)[0];
    const maxSalesVolume =
        itemMultiplier *
        businessFactor *
        advertisingFactor *
        marketFactor *
        salesBotUpgradeBenefit *
        researchSalesMultiplier;

    let marginErrorRatio = 1;
    if (!itemIsProduct) {
        // Add margin error in case of output materials
        marginErrorRatio = 0.9;
    }
    if (maxSalesVolume < rawProduction * marginErrorRatio && business > 0) {
        const logger = new Logger(enableLogging);
        logger.warn(`WARNING: operations: ${operations}, engineer: ${engineer}, business: ${business}, management: ${management}`);
        logger.warn(`WARNING: rawProduction: ${rawProduction}, maxSalesVolume: ${maxSalesVolume}`);
    }

    const optimalPrice = markupLimit / Math.sqrt(rawProduction / maxSalesVolume) + marketPrice;

    const profit = (rawProduction * 10) * optimalPrice;

    return {
        operations: operations,
        engineer: engineer,
        business: business,
        management: management,
        totalExperience: customData.office.totalExperience,
        rawProduction: rawProduction,
        maxSalesVolume: maxSalesVolume,
        optimalPrice: optimalPrice,
        productDevelopmentProgress: productDevelopmentProgress,
        estimatedRP: estimatedRP,
        productRating: productEffectiveRating,
        productMarkup: productMarkup,
        profit: profit,
    };
}

export class CorporationBenchmark {
    public getScriptUrl(): string {
        return import.meta.url;
    }

    public optimizeStorageAndFactory(
        industryData: CorpIndustryData,
        currentSmartStorageLevel: number,
        currentWarehouseLevel: number,
        currentSmartFactoriesLevel: number,
        divisionResearches: DivisionResearches,
        maxCost: number,
        enableLogging = false,
        boostMaterialTotalSizeRatio = 0.8
    ): StorageFactoryBenchmarkData[] {
        if (currentSmartStorageLevel < 0 || currentWarehouseLevel < 0 || currentSmartFactoriesLevel < 0) {
            throw new Error("Invalid parameter");
        }
        const logger = new Logger(enableLogging);
        const maxSmartStorageLevel = getMaxAffordableUpgradeLevel(UpgradeName.SMART_STORAGE, currentSmartStorageLevel, maxCost);
        const maxWarehouseLevel = getMaxAffordableWarehouseLevel(currentWarehouseLevel, maxCost / 6);
        const comparator = getComparator(BenchmarkType.STORAGE_FACTORY);
        const priorityQueue = new PriorityQueue(comparator);
        let minSmartStorageLevel = currentSmartStorageLevel;
        if (maxSmartStorageLevel - minSmartStorageLevel > 1000) {
            minSmartStorageLevel = maxSmartStorageLevel - 1000;
        }
        let minWarehouseLevel = currentWarehouseLevel;
        if (maxWarehouseLevel - minWarehouseLevel > 1000) {
            minWarehouseLevel = maxWarehouseLevel - 1000;
        }
        logger.log(`minSmartStorageLevel: ${minSmartStorageLevel}`);
        logger.log(`minWarehouseLevel: ${minWarehouseLevel}`);
        logger.log(`maxSmartStorageLevel: ${maxSmartStorageLevel}`);
        logger.log(`maxWarehouseLevel: ${maxWarehouseLevel}`);
        logger.time("StorageAndFactory benchmark");
        for (let smartStorageLevel = minSmartStorageLevel; smartStorageLevel <= maxSmartStorageLevel; smartStorageLevel++) {
            const upgradeSmartStorageCost = getUpgradeCost(
                UpgradeName.SMART_STORAGE,
                currentSmartStorageLevel,
                smartStorageLevel
            );
            for (let warehouseLevel = minWarehouseLevel; warehouseLevel <= maxWarehouseLevel; warehouseLevel++) {
                const upgradeWarehouseCost = getUpgradeWarehouseCost(
                    currentWarehouseLevel,
                    warehouseLevel
                ) * 6;
                if (upgradeSmartStorageCost + upgradeWarehouseCost > maxCost) {
                    break;
                }
                const warehouseSize = getWarehouseSize(
                    smartStorageLevel,
                    warehouseLevel,
                    divisionResearches
                );
                const boostMaterials = getOptimalBoostMaterialQuantities(industryData, warehouseSize * boostMaterialTotalSizeRatio);
                const boostMaterialMultiplier = getDivisionProductionMultiplier(industryData, boostMaterials);
                const budgetForSmartFactoriesUpgrade = maxCost - (upgradeSmartStorageCost + upgradeWarehouseCost);
                const maxAffordableSmartFactoriesLevel = getMaxAffordableUpgradeLevel(
                    UpgradeName.SMART_FACTORIES,
                    currentSmartFactoriesLevel,
                    budgetForSmartFactoriesUpgrade
                );
                const upgradeSmartFactoriesCost = getUpgradeCost(
                    UpgradeName.SMART_FACTORIES,
                    currentSmartFactoriesLevel,
                    maxAffordableSmartFactoriesLevel
                );
                const totalCost = upgradeSmartStorageCost + upgradeWarehouseCost + upgradeSmartFactoriesCost;
                const smartFactoriesMultiplier = 1 + CorpUpgradesData[UpgradeName.SMART_FACTORIES].benefit * maxAffordableSmartFactoriesLevel;
                const production = boostMaterialMultiplier * smartFactoriesMultiplier;
                const dataEntry = {
                    smartStorageLevel: smartStorageLevel,
                    warehouseLevel: warehouseLevel,
                    smartFactoriesLevel: maxAffordableSmartFactoriesLevel,
                    upgradeSmartStorageCost: upgradeSmartStorageCost,
                    upgradeWarehouseCost: upgradeWarehouseCost,
                    warehouseSize: warehouseSize,
                    totalCost: totalCost,
                    production: production,
                    costPerProduction: totalCost / production,
                    boostMaterials: boostMaterials,
                    boostMaterialMultiplier: boostMaterialMultiplier
                };
                if (priorityQueue.size() < defaultLengthOfBenchmarkDataArray) {
                    priorityQueue.push(dataEntry);
                } else if (comparator(dataEntry, priorityQueue.front()) > 0) {
                    priorityQueue.pop();
                    priorityQueue.push(dataEntry);
                }
            }
        }
        logger.timeEnd("StorageAndFactory benchmark");
        const data: StorageFactoryBenchmarkData[] = priorityQueue.toArray();
        data.forEach(data => {
            logger.log(
                `{storage:${data.smartStorageLevel}, warehouse:${data.warehouseLevel}, factory:${data.smartFactoriesLevel}, ` +
                `totalCost:${formatNumber(data.totalCost)}, ` +
                `warehouseSize:${formatNumber(data.warehouseSize)}, ` +
                `production:${formatNumber(data.production)}, ` +
                `costPerProduction:${formatNumber(data.costPerProduction)}, ` +
                `boostMaterialMultiplier:${formatNumber(data.boostMaterialMultiplier)}, ` +
                `boostMaterials:${data.boostMaterials}}`
            );
        });
        return data;
    }

    public optimizeWilsonAndAdvert(
        industryData: CorpIndustryData,
        currentWilsonLevel: number,
        currentAdvertLevel: number,
        divisionResearches: DivisionResearches,
        maxCost: number,
        enableLogging = false
    ): WilsonAdvertBenchmarkData[] {
        if (currentWilsonLevel < 0 || currentAdvertLevel < 0) {
            throw new Error("Invalid parameter");
        }
        const logger = new Logger(enableLogging);
        const maxWilsonLevel = getMaxAffordableUpgradeLevel(UpgradeName.WILSON_ANALYTICS, currentWilsonLevel, maxCost);
        const maxAdvertLevel = getMaxAffordableAdVertLevel(currentAdvertLevel, maxCost);
        logger.log(`maxWilsonLevel: ${maxWilsonLevel}`);
        logger.log(`maxAdvertLevel: ${maxAdvertLevel}`);
        const researchAdvertisingMultiplier = getResearchAdvertisingMultiplier(divisionResearches);
        const comparator = getComparator(BenchmarkType.WILSON_ADVERT);
        const priorityQueue = new PriorityQueue(comparator);
        logger.time("WilsonAndAdvert benchmark");
        for (let wilsonLevel = currentWilsonLevel; wilsonLevel <= maxWilsonLevel; wilsonLevel++) {
            const wilsonCost = getUpgradeCost(UpgradeName.WILSON_ANALYTICS, currentWilsonLevel, wilsonLevel);
            for (let advertLevel = currentAdvertLevel + 1; advertLevel <= maxAdvertLevel; advertLevel++) {
                const advertCost = getAdVertCost(currentAdvertLevel, advertLevel);
                const totalCost = wilsonCost + advertCost;
                if (totalCost > maxCost) {
                    break;
                }
                const previousAwareness = awarenessMap.get(`${wilsonLevel}|${advertLevel - 1}`) ?? 0;
                const previousPopularity = popularityMap.get(`${wilsonLevel}|${advertLevel - 1}`) ?? 0;
                const advertisingMultiplier = (1 + CorpUpgradesData[UpgradeName.WILSON_ANALYTICS].benefit * wilsonLevel) * researchAdvertisingMultiplier;
                let awareness = (previousAwareness + 3 * advertisingMultiplier) * (1.005 * advertisingMultiplier);
                // Hard-coded value of getRandomInt(1, 3). We don't want RNG here.
                // let popularity = (previousPopularity + advertisingMultiplier) * ((1 + getRandomInt(1, 3) / 200) * advertisingMultiplier);
                let popularity = (previousPopularity + advertisingMultiplier) * ((1 + 2 / 200) * advertisingMultiplier);
                awareness = Math.min(awareness, Number.MAX_VALUE);
                popularity = Math.min(popularity, Number.MAX_VALUE);
                awarenessMap.set(`${wilsonLevel}|${advertLevel}`, awareness);
                popularityMap.set(`${wilsonLevel}|${advertLevel}`, popularity);
                const [advertisingFactor] = getAdvertisingFactors(awareness, popularity, industryData.advertisingFactor!);
                const dataEntry = {
                    wilsonLevel: wilsonLevel,
                    advertLevel: advertLevel,
                    totalCost: totalCost,
                    popularity: popularity,
                    awareness: awareness,
                    ratio: (popularity / awareness),
                    advertisingFactor: advertisingFactor,
                    costPerAdvertisingFactor: totalCost / advertisingFactor
                };
                if (priorityQueue.size() < defaultLengthOfBenchmarkDataArray) {
                    priorityQueue.push(dataEntry);
                } else if (comparator(dataEntry, priorityQueue.front()) > 0) {
                    priorityQueue.pop();
                    priorityQueue.push(dataEntry);
                }
            }
        }
        logger.timeEnd("WilsonAndAdvert benchmark");
        const data: WilsonAdvertBenchmarkData[] = priorityQueue.toArray();
        data.forEach(data => {
            logger.log(
                `{wilson:${data.wilsonLevel}, advert:${data.advertLevel}, ` +
                `totalCost:${formatNumber(data.totalCost)}, ` +
                `advertisingFactor:${formatNumber(data.advertisingFactor)}, ` +
                `popularity:${formatNumber(data.popularity)}, ` +
                `awareness:${formatNumber(data.awareness)}, ` +
                `ratio:${formatNumber(data.ratio)}, ` +
                `costPerAdvertisingFactor:${formatNumber(data.costPerAdvertisingFactor)}}`
            );
        });
        return data;
    }

    public async optimizeOffice(
        division: Division,
        industryData: CorpIndustryData,
        operationsJob: {
            min: number;
            max: number;
        },
        engineerJob: {
            min: number;
            max: number;
        },
        managementJob: {
            min: number;
            max: number;
        },
        rndEmployee: number,
        nonRnDEmployees: number,
        item: Material | Product,
        useCurrentItemData: boolean,
        customData: OfficeBenchmarkCustomData,
        sortType: OfficeBenchmarkSortType,
        referenceData: OfficeBenchmarkData,
        enableLogging = false,
        employeeJobsRequirement?: EmployeeJobRequirement
    ): Promise<{ step: number; data: OfficeBenchmarkData[]; }> {
        const salesBotUpgradeBenefit = getUpgradeBenefit(
            UpgradeName.ABC_SALES_BOTS,
            customData.corporationUpgradeLevels[UpgradeName.ABC_SALES_BOTS]
        );
        const researchSalesMultiplier = getResearchSalesMultiplier(customData.divisionResearches);

        let performanceModifier = defaultPerformanceModifierForOfficeBenchmark;
        if (customData.performanceModifier) {
            performanceModifier = customData.performanceModifier;
        }
        const operationsStep = Math.max(
            Math.floor((operationsJob.max - operationsJob.min) / performanceModifier),
            minStepForOfficeBenchmark
        );
        const engineerStep = Math.max(
            Math.floor((engineerJob.max - engineerJob.min) / performanceModifier),
            minStepForOfficeBenchmark
        );
        const managementStep = Math.max(
            Math.floor((managementJob.max - managementJob.min) / performanceModifier),
            minStepForOfficeBenchmark
        );
        let maxStep = Math.max(
            operationsStep,
            engineerStep,
            managementStep,
        );

        const comparator = getComparator(BenchmarkType.OFFICE, sortType, referenceData);
        const priorityQueue = new PriorityQueue(comparator);
        // We use maxStep for all loops instead of specific step for each loop to maximize performance. The result is
        // still good enough.
        for (let operations = operationsJob.min; operations <= operationsJob.max; operations += maxStep) {
            for (let engineer = engineerJob.min; engineer <= engineerJob.max; engineer += maxStep) {
                for (let management = managementJob.min; management <= managementJob.max; management += maxStep) {
                    if (operations + engineer === 0
                        || operations + engineer + management >= nonRnDEmployees) {
                        continue;
                    }
                    let effectiveEngineer = engineer;
                    let business = nonRnDEmployees - (operations + engineer + management);
                    if (employeeJobsRequirement) {
                        // Currently, we only set employeeJobsRequirement when we find optimal setup for support divisions.
                        // In this case, employeeJobsRequirement.business is always 0.
                        if (employeeJobsRequirement.business !== 0) {
                            throw new Error(`Invalid valid of employeeJobsRequirement.business: ${employeeJobsRequirement.business}`);
                        }
                        // "Transfer" business to engineer. Engineer is important for quality of output materials of
                        // support divisions.
                        effectiveEngineer += business;
                        business = 0;
                    }
                    const dataEntry = await calculateOfficeBenchmarkData(
                        division,
                        industryData,
                        item,
                        useCurrentItemData,
                        customData,
                        operations,
                        effectiveEngineer,
                        business,
                        management,
                        rndEmployee,
                        salesBotUpgradeBenefit,
                        researchSalesMultiplier,
                        enableLogging
                    );
                    if (priorityQueue.size() < defaultLengthOfBenchmarkDataArray) {
                        priorityQueue.push(dataEntry);
                    } else if (comparator(dataEntry, priorityQueue.front()) > 0) {
                        priorityQueue.pop();
                        priorityQueue.push(dataEntry);
                    }
                }
            }
        }
        return {
            step: maxStep,
            data: priorityQueue.toArray()
        };
    }
}

comlink.expose(new CorporationBenchmark());

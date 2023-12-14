import {CorpIndustryData, Division, Material, Product} from "@ns";
import * as comlink from "/libs/comlink";
import {isProduct, optimizeBoostMaterialQuantities} from "/corporationUtils";
import {
    calculateDivisionRawProduction,
    calculateEmployeeProductionByJobs,
    CorporationUpgradeLevels,
    DivisionResearches,
    formatNumber,
    getAdVertCost,
    getAdvertisingFactors,
    getBusinessFactor,
    getDivisionProductionMultiplier,
    getMarketFactor,
    getMaxAffordableAdVertLevel,
    getMaxAffordableUpgradeLevel,
    getMaxAffordableWarehouseLevel,
    getResearchAdvertisingMultiplier,
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
    productRating: number;
    productMarkup: number;
    productDevelopmentProgress: number;
    profit: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getComparator(benchmarkType: BenchmarkType, sortType?: string): (a: any, b: any) => number {
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
                if (sortType === "optimalPrice") {
                    return a.optimalPrice - b.optimalPrice;
                }
                if (sortType === "profit") {
                    return a.profit - b.profit;
                }
                if (sortType === "progress") {
                    return a.productDevelopmentProgress - b.productDevelopmentProgress;
                }
                if (sortType === "profit_progress") {
                    return (a.profit * a.productDevelopmentProgress) - (b.profit * b.productDevelopmentProgress);
                }
                return a.profit - b.profit;
            };
        default:
            throw new Error(`Invalid benchmark type`);
    }
}

const awarenessMap = new Map<string, number>();
const popularityMap = new Map<string, number>();

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
        boostMaterialTotalSizeRatio = 0.8) {
        if (currentSmartStorageLevel < 0 || currentWarehouseLevel < 0 || currentSmartFactoriesLevel < 0) {
            throw new Error("Invalid parameter");
        }
        const maxSmartStorageLevel = getMaxAffordableUpgradeLevel(UpgradeName.SMART_STORAGE, currentSmartStorageLevel, maxCost);
        const maxWarehouseLevel = getMaxAffordableWarehouseLevel(currentWarehouseLevel, maxCost / 6);
        const comparator = getComparator(BenchmarkType.STORAGE_FACTORY);
        const priorityQueue = new PriorityQueue(comparator);
        let minSmartStorageLevel = currentSmartStorageLevel;
        if (maxSmartStorageLevel - minSmartStorageLevel > 1000) {
            minSmartStorageLevel = Math.floor((currentSmartStorageLevel + maxSmartStorageLevel) * 2 / 3);
        }
        let minWarehouseLevel = currentWarehouseLevel;
        if (maxWarehouseLevel - currentWarehouseLevel > 1000) {
            minWarehouseLevel = Math.floor((currentWarehouseLevel + maxWarehouseLevel) * 2 / 3);
        }
        console.log("minSmartStorageLevel", minSmartStorageLevel);
        console.log("minWarehouseLevel", minWarehouseLevel);
        console.log("maxSmartStorageLevel", maxSmartStorageLevel);
        console.log("maxWarehouseLevel", maxWarehouseLevel);
        console.time("StorageAndFactory benchmark");
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
                const boostMaterials = optimizeBoostMaterialQuantities(industryData, warehouseSize * boostMaterialTotalSizeRatio);
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
                if (priorityQueue.size() < 20) {
                    priorityQueue.push(dataEntry);
                } else if (comparator(dataEntry, priorityQueue.front()) > 0) {
                    priorityQueue.pop();
                    priorityQueue.push(dataEntry);
                }
            }
        }
        console.timeEnd("StorageAndFactory benchmark");
        const data: StorageFactoryBenchmarkData[] = priorityQueue.toArray();
        data.forEach(data => {
            console.log(
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
        maxCost: number) {
        if (currentWilsonLevel < 0 || currentAdvertLevel < 0) {
            throw new Error("Invalid parameter");
        }
        const maxWilsonLevel = getMaxAffordableUpgradeLevel(UpgradeName.WILSON_ANALYTICS, currentWilsonLevel, maxCost);
        const maxAdvertLevel = getMaxAffordableAdVertLevel(currentAdvertLevel, maxCost);
        console.log(`maxWilsonLevel: ${maxWilsonLevel}`);
        console.log(`maxAdvertLevel: ${maxAdvertLevel}`);
        const researchAdvertisingMultiplier = getResearchAdvertisingMultiplier(divisionResearches);
        const comparator = getComparator(BenchmarkType.WILSON_ADVERT);
        const priorityQueue = new PriorityQueue(comparator);
        console.time("WilsonAndAdvert benchmark");
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
                if (priorityQueue.size() < 20) {
                    priorityQueue.push(dataEntry);
                } else if (comparator(dataEntry, priorityQueue.front()) > 0) {
                    priorityQueue.pop();
                    priorityQueue.push(dataEntry);
                }
            }
        }
        console.timeEnd("WilsonAndAdvert benchmark");
        const data: WilsonAdvertBenchmarkData[] = priorityQueue.toArray();
        data.forEach(data => {
            console.log(
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

    public async calculateOfficeBenchmarkData(
        division: Division,
        industryData: CorpIndustryData,
        item: Material | Product,
        customData: {
            office: {
                avgMorale: number;
                avgEnergy: number;
                avgIntelligence: number,
                avgCharisma: number,
                avgCreativity: number,
                avgEfficiency: number,
                totalExperience: number;
            },
            corporationUpgradeLevels: CorporationUpgradeLevels,
            divisionResearches: DivisionResearches,
            step?: number;
        },
        operations: number,
        engineer: number,
        management: number,
        business: number,
        salesBotUpgradeBenefit: number,
        researchSalesMultiplier: number
    ): Promise<OfficeBenchmarkData | null> {
        const itemIsProduct = isProduct(item);
        const employeesProduction = calculateEmployeeProductionByJobs(
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
                    researchAndDevelopment: 0,
                    intern: 0,
                    unassigned: 0
                }
            },
            customData.corporationUpgradeLevels,
            customData.divisionResearches
        );
        const rawProduction = calculateDivisionRawProduction(
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

        let productRating = 0;
        let productMarkup = 0;
        let demand: number;
        let competition: number;
        let productDevelopmentProgress = 0;

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
            const scienceMultiplier = 1 + (Math.pow(division.researchPoints, industryData.scienceFactor!)) / 800;
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
            const weights = industryData.product!.ratingWeights;
            for (const [statName, coefficient] of Object.entries(weights)) {
                productRating += productStats[statName] * coefficient;
            }

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

            // If we assume that input materials' average quality is high enough, we can use productRating
            // directly instead of having to calculate effectiveRating.
            itemMultiplier = 0.5 * Math.pow(productRating, 0.65);
            markupLimit = Math.max(productRating, 0.001) / productMarkup;
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

        if (itemIsProduct) {
            if (maxSalesVolume < rawProduction) {
                // console.log(`operations: ${operations}, engineer: ${engineer}, business: ${business}, management: ${management}`);
                // console.log(`rawProduction: ${rawProduction}, maxSalesVolume: ${maxSalesVolume}`);
                return null;
            }
        } else {
            // Add margin error in case of output materials
            if (maxSalesVolume < rawProduction * 0.9) {
                // console.log(`operations: ${operations}, engineer: ${engineer}, business: ${business}, management: ${management}`);
                // console.log(`rawProduction: ${rawProduction}, maxSalesVolume: ${maxSalesVolume}`);
                return null;
            }
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
            productRating: productRating,
            productMarkup: productMarkup,
            productDevelopmentProgress: productDevelopmentProgress,
            profit: profit,
        };
    }

    /**
     *
     * @param division
     * @param industryData
     * @param operationsJob
     * @param engineerJob
     * @param managementJob
     * @param maxTotalEmployees Does not count RnD. For example, if office has 3 RnD and maxTotalEmployees is 6, office's
     * total employees is 9.
     * @param item
     * @param customData
     * @param sortType
     */
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
        maxTotalEmployees: number,
        item: Material | Product,
        customData: {
            office: {
                avgMorale: number;
                avgEnergy: number;
                avgIntelligence: number,
                avgCharisma: number,
                avgCreativity: number,
                avgEfficiency: number,
                totalExperience: number;
            },
            corporationUpgradeLevels: CorporationUpgradeLevels,
            divisionResearches: DivisionResearches,
            step?: number;
        },
        sortType: string
    ): Promise<{ step: number; data: OfficeBenchmarkData[]; }> {
        const salesBotUpgradeBenefit = getUpgradeBenefit(
            UpgradeName.ABC_SALES_BOTS,
            customData.corporationUpgradeLevels[UpgradeName.ABC_SALES_BOTS]
        );
        const researchSalesMultiplier = getResearchSalesMultiplier(customData.divisionResearches);

        let step = Math.max(
            Math.floor((operationsJob.max - operationsJob.min) / 60),
            Math.floor((engineerJob.max - engineerJob.min) / 60),
            Math.floor((managementJob.max - managementJob.min) / 60),
            1
        );
        if (customData.step) {
            step = customData.step;
        }

        const comparator = getComparator(BenchmarkType.OFFICE, sortType);
        const priorityQueue = new PriorityQueue(comparator);
        for (let operations = operationsJob.min; operations <= operationsJob.max; operations += step) {
            for (let engineer = engineerJob.min; engineer <= engineerJob.max; engineer += step) {
                for (let management = managementJob.min; management <= managementJob.max; management += step) {
                    if (operations + engineer === 0
                        || operations + engineer + management >= maxTotalEmployees) {
                        continue;
                    }
                    const business = maxTotalEmployees - (operations + engineer + management);
                    const dataEntry = await this.calculateOfficeBenchmarkData(
                        division,
                        industryData,
                        item,
                        customData,
                        operations,
                        engineer,
                        management,
                        business,
                        salesBotUpgradeBenefit,
                        researchSalesMultiplier
                    );
                    if (!dataEntry) {
                        continue;
                    }
                    if (priorityQueue.size() < 20) {
                        priorityQueue.push(dataEntry);
                    } else if (comparator(dataEntry, priorityQueue.front()) > 0) {
                        priorityQueue.pop();
                        priorityQueue.push(dataEntry);
                    }
                }
            }
        }
        return {
            step: step,
            data: priorityQueue.toArray()
        };
    }
}

comlink.expose(new CorporationBenchmark());

import {CorpIndustryData, Division, Material, Product} from "@ns";
import * as comlink from "/libs/comlink";
import {getProductMarkup, isProduct, optimizeBoostMaterialQuantities} from "/corporationUtils";
import {
    calculateDivisionRawProduction,
    calculateEmployeeProductionByJobs,
    calculateEmployeeStats,
    CityName,
    CorpEmployeePosition,
    CorporationUpgradeLevels,
    DivisionResearches,
    formatNumber,
    getAdVertCost,
    getAdvertisingFactors,
    getBusinessFactor,
    getDivisionProductionMultiplier,
    getMarketFactor,
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
    STORAGE_FACTORY_UPGRADE,
    WILSON_ADVERT,
    OFFICE
}

interface StorageFactoryUpgradeData {
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

interface WilsonAdvertUpgradeData {
    wilsonLevel: number;
    advertLevel: number;
    totalCost: number;
    popularity: number;
    awareness: number;
    ratio: number;
    advertisingFactor: number;
    costPerAdvertisingFactor: number;
}

interface OfficeBenchmarkData {
    operations: number;
    engineer: number;
    business: number;
    management: number;
    totalExperience: number;
    rawProduction: number;
    maxSellAmount: number;
    optimalPrice: number;
    profit: number;
    productDevelopmentProgress: number;
}

export function getComparator(benchmarkType: BenchmarkType, sortType: string): (a: any, b: any) => number {
    switch (benchmarkType) {
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
            throw new Error(`Invalid benchmark type: ${benchmarkType}`);
    }
}

export class CorporationBenchmark {
    // Key: divisionName|city|productName
    private productMarkupMap = new Map<string, number>();

    public getScriptUrl() {
        return import.meta.url;
    }

    public optimizeStorageAndFactoryUpgrade(
        industryData: CorpIndustryData,
        minSmartStorageLevel = 0,
        minWarehouseLevel = 1,
        minSmartFactoriesLevel = 0,
        maxAdditionalLevel: number,
        divisionResearches: DivisionResearches,
        maxCost = Number.MAX_SAFE_INTEGER,
        boostMaterialTotalSizeRatio = 0.8) {
        let data: StorageFactoryUpgradeData[] = [];
        for (let smartStorageLevel = minSmartStorageLevel;
             smartStorageLevel <= minSmartStorageLevel + maxAdditionalLevel;
             smartStorageLevel++) {
            for (let warehouseLevel = minWarehouseLevel;
                 warehouseLevel <= minWarehouseLevel + maxAdditionalLevel;
                 warehouseLevel++) {
                const upgradeSmartStorageCost = getUpgradeCost(
                    UpgradeName.SMART_STORAGE,
                    minSmartStorageLevel,
                    smartStorageLevel - minSmartStorageLevel
                );
                const upgradeWarehouseCost = getUpgradeWarehouseCost(
                    minWarehouseLevel,
                    warehouseLevel - minWarehouseLevel
                ) * 6;
                const warehouseSize = getWarehouseSize(
                    smartStorageLevel,
                    warehouseLevel,
                    divisionResearches
                );
                const boostMaterials = optimizeBoostMaterialQuantities(industryData, warehouseSize * boostMaterialTotalSizeRatio);
                const boostMaterialMultiplier = getDivisionProductionMultiplier(industryData, boostMaterials);
                for (let smartFactoriesLevel = minSmartFactoriesLevel;
                     smartFactoriesLevel <= minSmartFactoriesLevel + maxAdditionalLevel;
                     smartFactoriesLevel++) {
                    const upgradeSmartFactoriesCost = getUpgradeCost(
                        UpgradeName.SMART_FACTORIES,
                        minSmartFactoriesLevel,
                        smartFactoriesLevel - minSmartFactoriesLevel
                    );
                    const smartFactoriesMultiplier = 1 + CorpUpgradesData[UpgradeName.SMART_FACTORIES].benefit * smartFactoriesLevel;
                    const production = boostMaterialMultiplier * smartFactoriesMultiplier;
                    const totalCost = upgradeSmartStorageCost + upgradeWarehouseCost + upgradeSmartFactoriesCost;
                    if (totalCost > maxCost) {
                        break;
                    }
                    data.push({
                        smartStorageLevel: smartStorageLevel,
                        warehouseLevel: warehouseLevel,
                        smartFactoriesLevel: smartFactoriesLevel,
                        upgradeSmartStorageCost: upgradeSmartStorageCost,
                        upgradeWarehouseCost: upgradeWarehouseCost,
                        warehouseSize: warehouseSize,
                        totalCost: totalCost,
                        production: production,
                        costPerProduction: totalCost / production,
                        boostMaterials: boostMaterials,
                        boostMaterialMultiplier: boostMaterialMultiplier
                    });
                }
            }
        }
        data.sort((a, b) => {
            if (a.production !== b.production) {
                return a.production - b.production;
            }
            return b.totalCost - a.totalCost;
        });
        if (data.length > 200) {
            data = data.slice(-200);
        }
        console.clear();
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
        minWilsonLevel: number,
        maxAdditionalWilsonLevel: number,
        minAdvertLevel: number,
        maxAdditionalAdvertLevel: number,
        divisionResearches: DivisionResearches,
        maxCost = Number.MAX_SAFE_INTEGER) {
        const researchAdvertisingMultiplier = getResearchAdvertisingMultiplier(divisionResearches);
        const awarenessMap = new Map<string, number>();
        const popularityMap = new Map<string, number>();
        let data: WilsonAdvertUpgradeData[] = [];
        for (let wilsonLevel = minWilsonLevel; wilsonLevel <= minWilsonLevel + maxAdditionalWilsonLevel; wilsonLevel++) {
            for (let advertLevel = minAdvertLevel; advertLevel <= minAdvertLevel + maxAdditionalAdvertLevel; advertLevel++) {
                const wilsonCost = getUpgradeCost(UpgradeName.WILSON_ANALYTICS, minWilsonLevel, wilsonLevel - minWilsonLevel);
                const advertCost = getAdVertCost(minAdvertLevel, advertLevel);
                const totalCost = wilsonCost + advertCost;
                if (totalCost > maxCost) {
                    break;
                }
                let previousAwareness = awarenessMap.get(`${wilsonLevel}|${advertLevel - 1}`) ?? 0;
                let previousPopularity = popularityMap.get(`${wilsonLevel}|${advertLevel - 1}`) ?? 0;
                const advertisingMultiplier = (1 + CorpUpgradesData[UpgradeName.WILSON_ANALYTICS].benefit * wilsonLevel) * researchAdvertisingMultiplier;
                let awareness = (previousAwareness + 3 * advertisingMultiplier) * (1.005 * advertisingMultiplier);
                // Hardcode value of getRandomInt(1, 3), we don't want RNG here
                // let popularity = (previousPopularity + advertisingMultiplier) * ((1 + getRandomInt(1, 3) / 200) * advertisingMultiplier);
                let popularity = (previousPopularity + advertisingMultiplier) * ((1 + 2 / 200) * advertisingMultiplier);
                awareness = Math.min(awareness, Number.MAX_VALUE);
                popularity = Math.min(popularity, Number.MAX_VALUE);
                awarenessMap.set(`${wilsonLevel}|${advertLevel}`, awareness);
                popularityMap.set(`${wilsonLevel}|${advertLevel}`, popularity);
                const [advertisingFactor] = getAdvertisingFactors(awareness, popularity, industryData.advertisingFactor!);
                data.push({
                    wilsonLevel: wilsonLevel,
                    advertLevel: advertLevel + 1, // Must +1 because we calculate by accumulating value
                    totalCost: totalCost,
                    popularity: popularity,
                    awareness: awareness,
                    ratio: (popularity / awareness),
                    advertisingFactor: advertisingFactor,
                    costPerAdvertisingFactor: totalCost / advertisingFactor
                });
            }
        }
        data.sort((a, b) => {
            if (a.advertisingFactor !== b.advertisingFactor) {
                return a.advertisingFactor - b.advertisingFactor;
            }
            return b.totalCost - a.totalCost;
            // return a.totalCost - b.totalCost;
            // return a.costPerAdvertFactor - b.costPerAdvertFactor;
        });
        if (data.length > 200) {
            data = data.slice(-200);
        }
        console.clear();
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

    public async optimizeOffice(
        division: Division,
        industryData: CorpIndustryData,
        city: CityName,
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
                totalExperience: number;
                numEmployees: number;
                employeeJobs: Record<CorpEmployeePosition, number>;
                employeeProductionByJob: Record<CorpEmployeePosition, number>;
            },
            corporationUpgradeLevels: CorporationUpgradeLevels,
            divisionResearches: DivisionResearches,
            demandCompetition?: {
                demand: number;
                competition: number;
            };
            totalExperience?: {
                minTotalExperience: number;
                maxTotalExperience: number;
            };
            step?: number;
        },
        sortType: string
    ): Promise<{ step: number; data: OfficeBenchmarkData[]; }> {
        const itemIsProduct = isProduct(item);

        let demand = 0;
        let competition = 0;
        if (customData.demandCompetition) {
            demand = customData.demandCompetition.demand;
            competition = customData.demandCompetition.competition;
            if (!demand || !competition) {
                throw new Error("Invalid demand/competition data");
            }
        } else {
            demand = item.demand!;
            competition = item.competition!;
            if (!demand || !competition) {
                throw new Error(`You need to unlock "Market Research - Demand" and "Market Data - Competition"`);
            }
        }

        let minTotalExperience = customData.office.totalExperience;
        let maxTotalExperience = minTotalExperience;
        if (customData.totalExperience) {
            minTotalExperience = customData.totalExperience.minTotalExperience;
            maxTotalExperience = customData.totalExperience.maxTotalExperience;
        }
        const totalExperienceIncrementStep = Math.max((maxTotalExperience - minTotalExperience) / 5, 100);

        const avgStats = await calculateEmployeeStats(
            customData.office,
            customData.corporationUpgradeLevels,
            customData.divisionResearches
        );

        let itemMultiplier = 1;
        if (itemIsProduct) {
            itemMultiplier = 0.5 * Math.pow(item.effectiveRating, 0.65);
        } else {
            itemMultiplier = item.quality + 0.001;
        }
        let productMarkup;
        let markupLimit: number;
        let marketPrice: number;
        if (itemIsProduct) {
            const productKey = `${division.name}|${city}|${item.name}`;
            productMarkup = this.productMarkupMap.get(productKey);
            if (!productMarkup) {
                productMarkup = await getProductMarkup(
                    division.researchPoints,
                    industryData.scienceFactor!,
                    item
                );
                this.productMarkupMap.set(productKey, productMarkup);
            }
            markupLimit = Math.max(item.effectiveRating, 0.001) / productMarkup;
            marketPrice = item.productionCost;
        } else {
            markupLimit = item.quality / CorpMaterialsData[item.name].baseMarkup;
            marketPrice = item.marketPrice;
        }
        const marketFactor = getMarketFactor(demand, competition);
        const salesBotUpgradeBenefit = getUpgradeBenefit(
            UpgradeName.ABC_SALES_BOTS,
            customData.corporationUpgradeLevels[UpgradeName.ABC_SALES_BOTS]
        );
        const researchSalesMultiplier = getResearchSalesMultiplier(customData.divisionResearches);

        let step = Math.max(Math.floor(maxTotalEmployees / 60), 1);
        if (customData.step) {
            step = customData.step;
        }
        const maxBusiness = Math.floor(maxTotalEmployees / 2);

        const comparator = getComparator(BenchmarkType.OFFICE, sortType);
        const priorityQueue = new PriorityQueue(comparator);
        for (let totalExperience = minTotalExperience;
             totalExperience <= maxTotalExperience;
             totalExperience += totalExperienceIncrementStep) {
            for (let operations = operationsJob.min; operations <= operationsJob.max; operations += step) {
                for (let engineer = engineerJob.min; engineer <= engineerJob.max; engineer += step) {
                    for (let management = managementJob.min; management <= managementJob.max; management += step) {
                        if (operations + engineer === 0
                            || operations + engineer + management > maxTotalEmployees) {
                            continue;
                        }
                        for (let business = Math.min(maxTotalEmployees - (operations + engineer + management), maxBusiness);
                             business > 0;
                             business -= step) {
                            const employeesProduction = calculateEmployeeProductionByJobs(
                                {
                                    avgIntelligence: avgStats.avgIntelligence,
                                    avgCharisma: avgStats.avgCharisma,
                                    avgCreativity: avgStats.avgCreativity,
                                    avgEfficiency: avgStats.avgEfficiency,
                                    avgMorale: customData.office.avgMorale,
                                    avgEnergy: customData.office.avgEnergy,
                                    totalExperience: totalExperience,
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

                            const businessFactor = getBusinessFactor(employeesProduction.businessProduction);
                            const advertisingFactor = getAdvertisingFactors(
                                division.awareness,
                                division.popularity,
                                industryData.advertisingFactor!)
                                [0];
                            const maxSellAmount =
                                itemMultiplier *
                                businessFactor *
                                advertisingFactor *
                                marketFactor *
                                salesBotUpgradeBenefit *
                                researchSalesMultiplier;

                            if (itemIsProduct || customData.demandCompetition) {
                                if (maxSellAmount < rawProduction) {
                                    // console.log(`operations: ${operations}, engineer: ${engineer}, business: ${business}, management: ${management}`);
                                    // console.log(`rawProduction: ${rawProduction}, maxSellAmount: ${maxSellAmount}`);
                                    break;
                                }
                            } else {
                                // Add margin error in case of output materials and no custom data for demand/competition
                                if (maxSellAmount < rawProduction * 0.9) {
                                    // console.log(`operations: ${operations}, engineer: ${engineer}, business: ${business}, management: ${management}`);
                                    // console.log(`rawProduction: ${rawProduction}, maxSellAmount: ${maxSellAmount}`);
                                    break;
                                }
                            }

                            const optimalPrice = markupLimit / Math.sqrt(rawProduction / maxSellAmount) + marketPrice;

                            const profit = (rawProduction * 10) * optimalPrice;

                            let productDevelopmentProgress = 0;
                            if (itemIsProduct) {
                                const totalProductionForProductDev = employeesProduction.operationsProduction
                                    + employeesProduction.engineerProduction
                                    + employeesProduction.managementProduction;
                                const managementFactor = 1 + employeesProduction.managementProduction / (1.2 * totalProductionForProductDev);
                                productDevelopmentProgress = 0.01 * (
                                        Math.pow(employeesProduction.engineerProduction, 0.34)
                                        + Math.pow(employeesProduction.operationsProduction, 0.2)
                                    )
                                    * managementFactor;
                            }

                            const dataEntry = {
                                operations: operations,
                                engineer: engineer,
                                business: business,
                                management: management,
                                totalExperience: totalExperience,
                                rawProduction: rawProduction,
                                maxSellAmount: maxSellAmount,
                                optimalPrice: optimalPrice,
                                profit: profit,
                                productDevelopmentProgress: productDevelopmentProgress,
                            };
                            if (priorityQueue.size() <= 100) {
                                priorityQueue.push(dataEntry);
                            } else if (comparator(dataEntry, priorityQueue.front()) > 0) {
                                priorityQueue.pop();
                                priorityQueue.push(dataEntry);
                            }
                        }
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

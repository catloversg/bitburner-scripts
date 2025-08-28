import type {CityName, CorpIndustryData, Division, Material, NS, Product,} from "@ns";
import * as comlink from "/libs/comlink";
import {Remote} from "/libs/comlink";
import {
    BalancingModifierForProfitProgress,
    BenchmarkType,
    ComparatorCustomData,
    CorporationOptimizer,
    defaultPerformanceModifierForOfficeBenchmark,
    EmployeeJobRequirement,
    getComparator,
    getReferenceData,
    minStepForOfficeBenchmark,
    OfficeBenchmarkCustomData,
    OfficeBenchmarkData,
    OfficeBenchmarkSortType
} from "/corporationOptimizer";
import {calculateEmployeeStats, formatNumber, ResearchName} from "/corporationFormulas";
import {
    getCorporationUpgradeLevels,
    getDivisionResearches,
    isProduct,
    Logger,
    sampleProductName
} from "/corporationUtils";
import {generateBlobUrl} from "/scriptUtils";
import {ScriptFilePath} from "/libs/paths/ScriptFilePath";
import {NetscriptExtension} from "/libs/NetscriptExtension";

let workerModuleUrl = new CorporationOptimizer().getScriptUrl();

async function validateWorkerModuleUrl(ns: NS): Promise<void> {
    let fetchResult;
    let valid = true;
    try {
        fetchResult = await fetch(workerModuleUrl);
    } catch (_) {
        valid = false;
    }
    if (fetchResult && !fetchResult.ok) {
        valid = false;
    }
    if (!valid) {
        workerModuleUrl = generateBlobUrl(ns, "corporationOptimizer.js" as ScriptFilePath);
    }
}

type Workload = (
    worker: Worker,
    workerWrapper: Remote<CorporationOptimizer>,
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
    }
) => Promise<void>;

async function splitWorkload(
    nsx: NetscriptExtension,
    divisionName: string,
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
    workload: Workload,
    logger: Logger
): Promise<void> {
    const numberOfThreads = globalThis.navigator?.hardwareConcurrency ?? 8;
    const workers: Worker[] = [];
    const promises: Promise<void>[] = [];
    let current = operationsJob.min;
    const step = Math.floor((operationsJob.max - operationsJob.min) / numberOfThreads);
    const loggerLabel = `Office benchmark execution time: ${divisionName}|${city}|${Date.now()}`;
    logger.time(loggerLabel);
    for (let i = 0; i < numberOfThreads; ++i) {
        const from = current;
        if (from > operationsJob.max) {
            break;
        }
        const to = Math.min(current + step, operationsJob.max);
        logger.log(`from: ${from}, to: ${to}`);
        const worker = new Worker(workerModuleUrl, {type: "module"});
        workers.push(worker);
        const workerWrapper = comlink.wrap<CorporationOptimizer>(worker);
        promises.push(
            workload(
                worker,
                workerWrapper,
                {
                    min: from,
                    max: to
                },
                {
                    min: engineerJob.min,
                    max: engineerJob.max
                },
                {
                    min: managementJob.min,
                    max: managementJob.max
                }
            )
        );
        current += (step + 1);
    }
    nsx.addAtExitCallback(() => {
        workers.forEach(worker => {
            worker.terminate();
        });
    });
    await Promise.allSettled(promises);
    logger.timeLog(loggerLabel);
}

export async function optimizeOffice(
    nsx: NetscriptExtension,
    division: Division,
    industryData: CorpIndustryData,
    city: CityName,
    nonRnDEmployees: number,
    rndEmployee: number,
    item: Material | Product,
    useCurrentItemData: boolean,
    sortType: OfficeBenchmarkSortType,
    balancingModifierForProfitProgress: BalancingModifierForProfitProgress,
    maxRerun = 1,
    performanceModifier = defaultPerformanceModifierForOfficeBenchmark,
    enableLogging = false,
    employeeJobsRequirement?: EmployeeJobRequirement
): Promise<OfficeBenchmarkData[]> {
    if (useCurrentItemData && item.name === sampleProductName) {
        throw new Error("Do not use useCurrentItemData = true with sample product");
    }

    await validateWorkerModuleUrl(nsx.ns);

    const logger = new Logger(enableLogging);
    const data: OfficeBenchmarkData[] = [];
    const office = nsx.ns.corporation.getOffice(division.name, city);

    let avgMorale = office.avgMorale;
    let avgEnergy = office.avgEnergy;
    const corporationUpgradeLevels = getCorporationUpgradeLevels(nsx.ns);
    const divisionResearches = getDivisionResearches(nsx.ns, division.name);

    if (nonRnDEmployees < 4) {
        throw new Error(`Invalid employees' data. maxTotalEmployees: ${nonRnDEmployees}`);
    }

    const numberOfNewEmployees =
        nonRnDEmployees
        + rndEmployee
        - office.numEmployees;
    if (numberOfNewEmployees < 0) {
        throw new Error(`Invalid employees' data. maxTotalEmployees: ${nonRnDEmployees}, numberOfNewEmployees: ${numberOfNewEmployees}`);
    }
    const totalExperience = office.totalExperience + 75 * numberOfNewEmployees;
    // Calculate avgStats based on current office data
    let avgStats;
    try {
        avgStats = await calculateEmployeeStats(
            {
                avgMorale: office.avgMorale,
                avgEnergy: office.avgEnergy,
                totalExperience: office.totalExperience,
                numEmployees: office.numEmployees,
                employeeJobs: office.employeeJobs,
                employeeProductionByJob: office.employeeProductionByJob,
            },
            corporationUpgradeLevels,
            divisionResearches
        );
    } catch (e) {
        logger.warn(e);
        avgStats = {
            avgIntelligence: 75,
            avgCharisma: 75,
            avgCreativity: 75,
            avgEfficiency: 75,
        };
    }
    for (let i = 0; i < numberOfNewEmployees; i++) {
        // avgMorale = (avgMorale * office.numEmployees + 75) / (office.numEmployees + 1);
        // avgEnergy = (avgEnergy * office.numEmployees + 75) / (office.numEmployees + 1);
        // Assume that we always maintain max morale/energy
        avgMorale = divisionResearches[ResearchName.STIMU] ? 110 : 100;
        avgEnergy = divisionResearches[ResearchName.GO_JUICE] ? 110 : 100;
        avgStats.avgIntelligence = (avgStats.avgIntelligence * office.numEmployees + 75) / (office.numEmployees + 1);
        avgStats.avgCharisma = (avgStats.avgCharisma * office.numEmployees + 75) / (office.numEmployees + 1);
        avgStats.avgCreativity = (avgStats.avgCreativity * office.numEmployees + 75) / (office.numEmployees + 1);
        avgStats.avgEfficiency = (avgStats.avgEfficiency * office.numEmployees + 75) / (office.numEmployees + 1);
    }

    const customData: OfficeBenchmarkCustomData = {
        office: {
            avgMorale: avgMorale,
            avgEnergy: avgEnergy,
            avgIntelligence: avgStats.avgIntelligence,
            avgCharisma: avgStats.avgCharisma,
            avgCreativity: avgStats.avgCreativity,
            avgEfficiency: avgStats.avgEfficiency,
            totalExperience: totalExperience,
        },
        corporationUpgradeLevels: corporationUpgradeLevels,
        divisionResearches: divisionResearches,
        performanceModifier: performanceModifier
    };
    const printDataEntryLog = (dataEntry: OfficeBenchmarkData) => {
        let message = `{operations:${dataEntry.operations}, engineer:${dataEntry.engineer}, `
            + `business:${dataEntry.business}, management:${dataEntry.management}, `;
        message += `totalExperience:${formatNumber(dataEntry.totalExperience)}, `;
        message +=
            `rawProduction:${formatNumber(dataEntry.rawProduction)}, ` +
            `maxSalesVolume:${formatNumber(dataEntry.maxSalesVolume)}, ` +
            `optimalPrice:${formatNumber(dataEntry.optimalPrice)}, ` +
            `profit:${dataEntry.profit.toExponential(5)}, ` +
            `salesEfficiency: ${Math.min(dataEntry.maxSalesVolume / dataEntry.rawProduction, 1).toFixed(3)}`;
        if (isProduct(item)) {
            message += `, progress: ${dataEntry.productDevelopmentProgress.toFixed(5)}`;
            message += `, progressCycle: ${Math.ceil(100 / dataEntry.productDevelopmentProgress)}`;
            message += `, estimatedRP: ${formatNumber(dataEntry.estimatedRP)}`;
            message += `, rating: ${formatNumber(dataEntry.productRating)}`;
            message += `, markup: ${formatNumber(dataEntry.productMarkup)}`;
            message += `, profit_progress: ${(dataEntry.profit * dataEntry.productDevelopmentProgress).toExponential(5)}}`;
        } else {
            message += "}";
        }
        logger.log(message);
    };

    const referenceData = await getReferenceData(
        division,
        industryData,
        nonRnDEmployees,
        item,
        useCurrentItemData,
        customData
    );
    const comparatorCustomData: ComparatorCustomData = {
        referenceData: referenceData,
        balancingModifierForProfitProgress: balancingModifierForProfitProgress
    };

    // nonRnDEmployeesWithRequirement is only used for calculating min/max
    let nonRnDEmployeesWithRequirement = nonRnDEmployees;
    if (employeeJobsRequirement) {
        nonRnDEmployeesWithRequirement = nonRnDEmployees - employeeJobsRequirement.engineer - employeeJobsRequirement.business;
    }
    const min = 1;
    const max = Math.floor(nonRnDEmployeesWithRequirement * 0.6);
    let maxUsedStep = 0;
    let error: unknown;
    const workload: Workload = async (
        worker: Worker,
        workerWrapper: Remote<CorporationOptimizer>,
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
        }
    ) => {
        maxUsedStep = 0;
        return workerWrapper.optimizeOffice(
            division,
            industryData,
            {
                min: operationsJob.min,
                max: operationsJob.max
            },
            {
                min: engineerJob.min,
                max: engineerJob.max
            },
            {
                min: managementJob.min,
                max: managementJob.max
            },
            rndEmployee,
            nonRnDEmployees, // Do not use nonRnDEmployeesWithRequirement
            item,
            useCurrentItemData,
            customData,
            sortType,
            comparatorCustomData,
            enableLogging,
            employeeJobsRequirement
        ).then(result => {
            maxUsedStep = Math.max(maxUsedStep, result.step);
            data.push(...result.data);
            worker.terminate();
        }).catch(reason => {
            // Bypass usage of logger
            console.error(reason);
            error = reason;
        });
    };
    const operationsMin = min;
    const operationsMax = max;
    let engineerMin = min;
    let engineerMax = max;
    const managementMin = min;
    const managementMax = max;
    if (employeeJobsRequirement) {
        engineerMin = employeeJobsRequirement.engineer;
        engineerMax = employeeJobsRequirement.engineer;
    }
    await splitWorkload(
        nsx,
        division.name,
        city,
        {
            min: operationsMin,
            max: operationsMax
        },
        {
            min: engineerMin,
            max: engineerMax
        },
        {
            min: managementMin,
            max: managementMax
        },
        workload,
        logger
    );
    if (error) {
        throw new Error(`Error occurred in worker: ${JSON.stringify(error)}`);
    }
    data.sort(getComparator(BenchmarkType.OFFICE, sortType, comparatorCustomData));

    let count = 0;
    while (true) {
        logger.log(`maxUsedStep: ${maxUsedStep}`);
        if (count >= maxRerun) {
            break;
        }
        if (maxUsedStep === minStepForOfficeBenchmark) {
            break;
        }
        logger.log("Rerun benchmark to get more accurate data");
        const currentBestResult = data[data.length - 1];
        logger.log("Current best result:");
        printDataEntryLog(currentBestResult);
        // Do not use nonRnDEmployeesWithRequirement in following calculations
        let newEngineerMin = Math.max(currentBestResult.engineer - maxUsedStep, 1);
        let newEngineerMax = Math.min(currentBestResult.engineer + maxUsedStep, nonRnDEmployees - 3);
        if (employeeJobsRequirement) {
            newEngineerMin = employeeJobsRequirement.engineer;
            newEngineerMax = employeeJobsRequirement.engineer;
        }
        await splitWorkload(
            nsx,
            division.name,
            city,
            {
                min: Math.max(currentBestResult.operations - maxUsedStep, 1),
                max: Math.min(currentBestResult.operations + maxUsedStep, nonRnDEmployees - 3)
            },
            {
                min: newEngineerMin,
                max: newEngineerMax
            },
            {
                min: Math.max(currentBestResult.management - maxUsedStep, 1),
                max: Math.min(currentBestResult.management + maxUsedStep, nonRnDEmployees - 3)
            },
            workload,
            logger
        );
        if (error) {
            throw new Error(`Error occurred in worker: ${JSON.stringify(error)}`);
        }
        data.sort(getComparator(BenchmarkType.OFFICE, sortType, comparatorCustomData));
        ++count;
    }

    let dataForLogging = data;
    if (dataForLogging.length > 10) {
        dataForLogging = dataForLogging.slice(-10);
    }
    dataForLogging.forEach(dataEntry => {
        printDataEntryLog(dataEntry);
    });

    return data;
}

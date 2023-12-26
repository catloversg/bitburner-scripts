import {CorpIndustryData, Division, Material, NS, Product,} from "@ns";
import * as comlink from "/libs/comlink";
import {Remote} from "/libs/comlink";
import {
    BenchmarkType,
    CorporationBenchmark,
    getComparator,
    OfficeBenchmarkData,
    OfficeBenchmarkSortType
} from "/corporationBenchmark";
import {calculateEmployeeStats, CityName, formatNumber, ResearchName} from "/corporationFormulas";
import {getCorporationUpgradeLevels, getDivisionResearches, isProduct, Logger} from "/corporationUtils";
import {generateBlobUrl} from "/scriptUtils";
import {ScriptFilePath} from "/libs/paths/ScriptFilePath";

let workerModuleUrl = new CorporationBenchmark().getScriptUrl();

async function validateWorkerModuleUrl(ns: NS) {
    let fetchResult;
    let valid = true;
    try {
        fetchResult = await fetch(workerModuleUrl);
    } catch (e) {
        valid = false;
    }
    if (fetchResult && !fetchResult.ok) {
        valid = false;
    }
    if (!valid) {
        workerModuleUrl = generateBlobUrl(ns, "corporationBenchmark.js" as ScriptFilePath);
    }
}

type Workload = (
    worker: Worker,
    workerWrapper: Remote<CorporationBenchmark>,
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
    ns: NS,
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
    logger: Logger) {
    const numberOfThreads = globalThis.navigator?.hardwareConcurrency ?? 8;
    const workers: Worker[] = [];
    const promises: Promise<void>[] = [];
    let current = operationsJob.min;
    const step = Math.floor((operationsJob.max - operationsJob.min) / numberOfThreads);
    const loggerLabel = `Office benchmark execution time: ${divisionName}|${city}`;
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
        const workerWrapper = comlink.wrap<CorporationBenchmark>(worker);
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
    ns.atExit(() => {
        workers.forEach(worker => {
            worker.terminate();
        });
    });
    await Promise.allSettled(promises);
    logger.timeLog(loggerLabel);
}

export async function optimizeOffice(
    ns: NS,
    division: Division,
    industryData: CorpIndustryData,
    city: CityName,
    maxNonRnDEmployees: number,
    rndJob: number,
    item: Material | Product,
    useCurrentItemData: boolean,
    sortType: OfficeBenchmarkSortType,
    maxRerun = 1,
    enableLogging = false) {
    await validateWorkerModuleUrl(ns);

    const logger = new Logger(enableLogging);
    const data: OfficeBenchmarkData[] = [];
    const office = ns.corporation.getOffice(division.name, city);

    let avgMorale = office.avgMorale;
    let avgEnergy = office.avgEnergy;
    const corporationUpgradeLevels = getCorporationUpgradeLevels(ns);
    const divisionResearches = getDivisionResearches(ns, division.name);

    if (maxNonRnDEmployees < 4) {
        throw new Error(`Invalid employees' data. maxTotalEmployees: ${maxNonRnDEmployees}`);
    }

    const numberOfNewEmployees =
        maxNonRnDEmployees
        + rndJob
        - office.numEmployees;
    if (numberOfNewEmployees < 0) {
        throw new Error(`Invalid employees' data. maxTotalEmployees: ${maxNonRnDEmployees}, numberOfNewEmployees: ${numberOfNewEmployees}`);
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

    const customData = {
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
        divisionResearches: divisionResearches
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
            message += `, estimatedRP: ${formatNumber(dataEntry.estimatedRP)}`;
            message += `, rating: ${formatNumber(dataEntry.productRating)}`;
            message += `, markup: ${formatNumber(dataEntry.productMarkup)}`;
            message += `, profit_progress: ${(dataEntry.profit * dataEntry.productDevelopmentProgress).toExponential(5)}}`;
        } else {
            message += "}";
        }
        logger.log(message);
    };

    const min = 1;
    const max = Math.floor(maxNonRnDEmployees * 0.6);
    let maxUsedStep = 0;
    let error: unknown;
    const workload: Workload = async (
        worker: Worker,
        workerWrapper: Remote<CorporationBenchmark>,
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
            rndJob,
            maxNonRnDEmployees,
            item,
            useCurrentItemData,
            customData,
            sortType
        ).then(result => {
            maxUsedStep = Math.max(maxUsedStep, result.step);
            data.push(...result.data);
            worker.terminate();
        }).catch(reason => {
            logger.error(reason);
            error = reason;
        });
    };
    let operationsMax = max;
    let engineerMin = min;
    let managementMin = min;
    let managementMax = max;
    if (sortType === "progress" || sortType === "profit_progress") {
        operationsMax = Math.floor(maxNonRnDEmployees * 0.15);
        engineerMin = Math.floor(maxNonRnDEmployees * 0.1);
        managementMin = Math.floor(maxNonRnDEmployees * 0.25);
        managementMax = Math.floor(maxNonRnDEmployees * 0.7);
    }
    await splitWorkload(
        ns,
        division.name,
        city,
        {
            min: min,
            max: operationsMax
        },
        {
            min: engineerMin,
            max: max
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
    data.sort(getComparator(BenchmarkType.OFFICE, sortType));

    let count = 0;
    while (true) {
        logger.log(`maxUsedStep: ${maxUsedStep}`);
        if (count >= maxRerun) {
            break;
        }
        if (maxUsedStep === 1) {
            break;
        }
        logger.log("Rerun benchmark to get more accurate data");
        const currentBestResult = data[data.length - 1];
        logger.log("Current best result:");
        printDataEntryLog(currentBestResult);
        await splitWorkload(
            ns,
            division.name,
            city,
            {
                min: Math.max(currentBestResult.operations - maxUsedStep, 1),
                max: Math.min(currentBestResult.operations + maxUsedStep, maxNonRnDEmployees - 3)
            },
            {
                min: Math.max(currentBestResult.engineer - maxUsedStep, 1),
                max: Math.min(currentBestResult.engineer + maxUsedStep, maxNonRnDEmployees - 3)
            },
            {
                min: Math.max(currentBestResult.management - maxUsedStep, 1),
                max: Math.min(currentBestResult.management + maxUsedStep, maxNonRnDEmployees - 3)
            },
            workload,
            logger
        );
        if (error) {
            throw new Error(`Error occurred in worker: ${JSON.stringify(error)}`);
        }
        data.sort(getComparator(BenchmarkType.OFFICE, sortType));
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

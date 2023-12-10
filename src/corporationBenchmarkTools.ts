import {Material, NS, Product,} from "@ns";
import * as comlink from "/libs/comlink";
import {Remote} from "/libs/comlink";
import {BenchmarkType, CorporationBenchmark, getComparator, OfficeBenchmarkData} from "/corporationBenchmark";
import {CityName, formatNumber} from "/corporationFormulas";
import {getCorporationUpgradeLevels, getDivisionResearches, isProduct} from "/corporationUtils";
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
    workload: Workload) {
    let numberOfThreads = globalThis.navigator?.hardwareConcurrency ?? 8;
    const workers: Worker[] = [];
    const promises: Promise<any>[] = [];
    let current = operationsJob.min;
    const step = Math.floor((operationsJob.max - operationsJob.min) / numberOfThreads);
    console.time("Office benchmark execution time");
    for (let i = 0; i < numberOfThreads; ++i) {
        const from = current;
        if (from > operationsJob.max) {
            break;
        }
        const to = Math.min(current + step, operationsJob.max);
        console.log(`from: ${from}, to: ${to}`);
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
    console.timeEnd("Office benchmark execution time");
}

export async function optimizeOffice(
    ns: NS,
    divisionName: string,
    city: CityName,
    maxTotalEmployees: number,
    item: Material | Product,
    sortType: "rawProduction" | "profit" | "progress" | "profit_progress",
    maxRerun = 1) {
    await validateWorkerModuleUrl(ns);

    const data: OfficeBenchmarkData[] = [];
    const division = ns.corporation.getDivision(divisionName);
    const industryData = ns.corporation.getIndustryData(division.type);
    const office = ns.corporation.getOffice(division.name, city);
    const customData = {
        office: {
            avgMorale: office.avgMorale,
            avgEnergy: office.avgEnergy,
            totalExperience: office.totalExperience,
            numEmployees: office.numEmployees,
            employeeJobs: office.employeeJobs,
            employeeProductionByJob: office.employeeProductionByJob
        },
        corporationUpgradeLevels: getCorporationUpgradeLevels(ns),
        divisionResearches: getDivisionResearches(ns, division.name)
    };
    const printLog = (dataEntry: OfficeBenchmarkData) => {
        let message = `{operations:${dataEntry.operations}, engineer:${dataEntry.engineer}, `
            + `business:${dataEntry.business}, management:${dataEntry.management}, `;
        message += `totalExperience:${formatNumber(dataEntry.totalExperience)}, `;
        message +=
            `rawProduction:${formatNumber(dataEntry.rawProduction)}, ` +
            `maxSalesVolume:${formatNumber(dataEntry.maxSalesVolume)}, ` +
            `optimalPrice:${formatNumber(dataEntry.optimalPrice)}, ` +
            `profit:${(dataEntry.profit)}, ` +
            `salesEfficiency: ${Math.min(dataEntry.maxSalesVolume / dataEntry.rawProduction, 1).toFixed(3)}`;
        if (isProduct(item)) {
            message += `, progress: ${dataEntry.productDevelopmentProgress.toFixed(5)}, `;
            message += `, profit_progress: ${(dataEntry.profit * dataEntry.productDevelopmentProgress).toFixed(5)}}`;
        } else {
            message += "}";
        }
        console.log(message);
    };

    const min = 1;
    const max = Math.floor(maxTotalEmployees * 0.6);
    let maxUsedStep = 0;
    let error: any;
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
            city,
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
            maxTotalEmployees,
            item,
            customData,
            sortType
        ).then(result => {
            maxUsedStep = Math.max(maxUsedStep, result.step);
            data.push(...result.data);
            worker.terminate();
        }).catch(reason => {
            console.error(reason);
            error = reason;
        });
    };
    await splitWorkload(
        ns,
        {
            min: min,
            max: max
        },
        {
            min: min,
            max: max
        },
        {
            min: min,
            max: max
        },
        workload
    );
    if (error) {
        throw new Error(`Error occurred in worker: ${error}`);
    }
    data.sort(getComparator(BenchmarkType.OFFICE, sortType));

    let count = 0;
    while (true) {
        console.log(`maxUsedStep: ${maxUsedStep}`);
        if (count >= maxRerun) {
            break;
        }
        if (maxUsedStep === 1) {
            break;
        }
        console.log("Rerun benchmark to get more accurate data");
        const currentBestResult = data[data.length - 1];
        console.log("Current best result:");
        printLog(currentBestResult);
        await splitWorkload(
            ns,
            {
                min: currentBestResult.operations - maxUsedStep,
                max: currentBestResult.operations + maxUsedStep
            },
            {
                min: currentBestResult.engineer - maxUsedStep,
                max: currentBestResult.engineer + maxUsedStep
            },
            {
                min: currentBestResult.management - maxUsedStep,
                max: currentBestResult.management + maxUsedStep
            },
            workload
        );
        if (error) {
            throw new Error(`Error occurred in worker: ${error}`);
        }
        data.sort(getComparator(BenchmarkType.OFFICE, sortType));
        ++count;
    }

    let dataForLogging = data;
    if (dataForLogging.length > 20) {
        dataForLogging = dataForLogging.slice(-20);
    }
    dataForLogging.forEach(dataEntry => {
        printLog(dataEntry);
    });
    return data;
}

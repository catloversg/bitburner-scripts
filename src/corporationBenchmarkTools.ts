import {Material, NS, Product,} from "@ns";
import * as comlink from "/libs/comlink";
import {BenchmarkType, CorporationBenchmark, getComparator} from "/corporationBenchmark";
import {CityName, formatNumber} from "/corporationFormulas";
import {getCorporationUpgradeLevels, getDivisionResearches, isProduct} from "/corporationUtils";

const workerModuleUrl = new CorporationBenchmark().getScriptUrl();

export async function optimizeOffice(
    ns: NS,
    divisionName: string,
    city: CityName,
    maxTotalEmployees: number,
    item: Material | Product,
    sortType: "rawProduction" | "profit" | "progress" | "profit_progress") {
    console.clear();
    const data: any[] = [];
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

    let numberOfThreads = globalThis.navigator?.hardwareConcurrency ?? 8;
    const min = 1;
    const max = Math.floor(maxTotalEmployees * 0.6);
    const workers: Worker[] = [];
    const promises: Promise<any>[] = [];
    let current = min;
    const step = Math.floor((max - min) / numberOfThreads);
    console.time("Office benchmark execution time");
    for (let i = 0; i < numberOfThreads; ++i) {
        const from = current;
        if (from > max) {
            break;
        }
        const to = Math.min(current + step, max);
        console.log(`from: ${from}, to: ${to}`);
        const worker = new Worker(workerModuleUrl, {type: "module"});
        workers.push(worker);
        const corporationWorker = comlink.wrap<CorporationBenchmark>(worker);
        const promise = corporationWorker.optimizeOffice(
            division,
            industryData,
            city,
            {
                min: from,
                max: to
            },
            {
                min: min,
                max: max
            },
            {
                min: min,
                max: max
            },
            maxTotalEmployees,
            item,
            customData,
            sortType
        ).then(result => {
            console.log(`Use step: ${result.step}`);
            data.push(...result.data);
            worker.terminate();
        }).catch(reason => {
            console.error(reason);
        });
        promises.push(promise);
        current += (step + 1);
    }
    ns.atExit(() => {
        workers.forEach(worker => {
            worker.terminate();
        });
    });
    await Promise.allSettled(promises);
    console.timeEnd("Office benchmark execution time");

    data.sort(getComparator(BenchmarkType.OFFICE, sortType));
    let dataForLogging = data;
    if (dataForLogging.length > 100) {
        dataForLogging = dataForLogging.slice(-100);
    }
    dataForLogging.forEach(data => {
        let message = `{operations:${data.operations}, engineer:${data.engineer}, business:${data.business}, management:${data.management}, `;
        message += `totalExperience:${formatNumber(data.totalExperience)}, `;
        message +=
            `rawProduction:${formatNumber(data.rawProduction)}, ` +
            `maxSellAmount:${formatNumber(data.maxSellAmount)}, ` +
            `optimalPrice:${formatNumber(data.optimalPrice)}, ` +
            `profit:${formatNumber(data.profit)}, ` +
            `salesEfficiency: ${Math.min(data.maxSellAmount / data.rawProduction, 1).toFixed(3)}`;
        if (isProduct(item)) {
            message += `, progress: ${data.productDevelopmentProgress.toFixed(5)}}`;
        } else {
            message += "}";
        }
        console.log(message);
    });
    return data;
}

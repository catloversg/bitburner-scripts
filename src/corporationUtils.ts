import {
    CorpIndustryData,
    CorpIndustryName,
    CorpMaterialName,
    Division,
    Material,
    NS,
    Office,
    Product,
    Warehouse
} from "@ns";
import {getRecordEntries, getRecordKeys, PartialRecord} from "/libs/Record";
import {parseNumber} from "/libs/utils";
import {Ceres} from "/libs/Ceres";
import {
    CeresSolverResult,
    CityName,
    CorporationUpgradeLevels,
    CorpState,
    DivisionResearches,
    EmployeePosition,
    ExportRoute,
    getAdvertisingFactors,
    getBusinessFactor,
    getDivisionRawProduction,
    getMarketFactor,
    getResearchRPMultiplier,
    getResearchSalesMultiplier,
    getUpgradeBenefit,
    IndustryType,
    MaterialName,
    MaterialOrder,
    OfficeSetup,
    OfficeSetupJobs,
    productMarketPriceMultiplier,
    ResearchName,
    ResearchPriority,
    UnlockName,
    UpgradeName
} from "/corporationFormulas";
import {CorpMaterialsData} from "/data/CorpMaterialsData";

export enum DivisionName {
    AGRICULTURE = "Agriculture",
    CHEMICAL = "Chemical",
    TOBACCO = "Tobacco",
}

export const cities: CityName[] = [
    CityName.Sector12,
    CityName.Aevum,
    CityName.Chongqing,
    CityName.NewTokyo,
    CityName.Ishima,
    CityName.Volhaven
];

export const materials = Object.values(MaterialName);

export const boostMaterials = [
    MaterialName.AI_CORES,
    MaterialName.HARDWARE,
    MaterialName.REAL_ESTATE,
    MaterialName.ROBOTS,
];

const costMultiplierForEmployeeStatsResearch = 5;
const costMultiplierForProductionResearch = 10;

export const researchPrioritiesForSupportDivision: ResearchPriority[] = [
    {research: ResearchName.HI_TECH_RND_LABORATORY, costMultiplier: 1},
    {research: ResearchName.AUTO_DRUG, costMultiplier: 13.5},
    {research: ResearchName.GO_JUICE, costMultiplier: costMultiplierForEmployeeStatsResearch},
    {research: ResearchName.OVERCLOCK, costMultiplier: costMultiplierForEmployeeStatsResearch},
    {research: ResearchName.STIMU, costMultiplier: costMultiplierForEmployeeStatsResearch},
    {research: ResearchName.CPH4_INJECT, costMultiplier: costMultiplierForEmployeeStatsResearch},

    {research: ResearchName.SELF_CORRECTING_ASSEMBLERS, costMultiplier: costMultiplierForProductionResearch},
    {research: ResearchName.DRONES, costMultiplier: 50},
    {research: ResearchName.DRONES_ASSEMBLY, costMultiplier: costMultiplierForProductionResearch},
    {research: ResearchName.DRONES_TRANSPORT, costMultiplier: costMultiplierForProductionResearch},
];

export const researchPrioritiesForProductDivision: ResearchPriority[] = [
    ...researchPrioritiesForSupportDivision,
    {research: ResearchName.UPGRADE_FULCRUM, costMultiplier: costMultiplierForProductionResearch},
    {research: ResearchName.UPGRADE_CAPACITY_1, costMultiplier: 10},
    // {research: ResearchName.UPGRADE_CAPACITY_2, costMultiplier: 10},
];

export const exportString = "(IPROD+IINV/10)*(-1)";

export const dummyDivisionNamePrefix = "z-";

// Key: divisionName|city
const smartSupplyData: Map<string, number> = new Map<string, number>();

// Key: divisionName|city|productName
const productMarkupData: Map<string, number> = new Map<string, number>();

const setOfDivisionsWaitingForRP: Set<string> = new Set<string>();

export class Logger {
    readonly #enableLogging: boolean;
    city?: CityName;

    constructor(enableLogging: boolean, city?: CityName) {
        this.#enableLogging = enableLogging;
        this.city = city;
    }

    public log(...args: unknown[]) {
        if (!this.#enableLogging) {
            return;
        }
        if (this.city === undefined || this.city === CityName.Sector12) {
            console.log(...args);
        }
    }

    public warn(...args: unknown[]) {
        if (!this.#enableLogging) {
            return;
        }
        if (this.city === undefined || this.city === CityName.Sector12) {
            console.warn(...args);
        }
    }

    public error(...args: unknown[]) {
        if (!this.#enableLogging) {
            return;
        }
        if (this.city === undefined || this.city === CityName.Sector12) {
            console.error(...args);
        }
    }

    public time(label: string) {
        if (!this.#enableLogging) {
            return;
        }
        if (this.city === undefined || this.city === CityName.Sector12) {
            console.time(label);
        }
    }

    public timeEnd(label: string) {
        if (!this.#enableLogging) {
            return;
        }
        if (this.city === undefined || this.city === CityName.Sector12) {
            console.timeEnd(label);
        }
    }

    public timeLog(label: string) {
        if (!this.#enableLogging) {
            return;
        }
        if (this.city === undefined || this.city === CityName.Sector12) {
            console.timeLog(label);
        }
    }
}

export function showWarning(ns: NS, warningMessage: string): void {
    console.warn(warningMessage);
    ns.print(warningMessage);
    ns.toast(warningMessage, "warning");
}

export function loopAllDivisionsAndCities(ns: NS, callback: (divisionName: string, city: CityName) => void): void {
    for (const division of ns.corporation.getCorporation().divisions) {
        if (division.startsWith(dummyDivisionNamePrefix)) {
            continue;
        }
        for (const city of cities) {
            callback(division, city);
        }
    }
}

export async function loopAllDivisionsAndCitiesAsyncCallback(
    ns: NS,
    callback: (divisionName: string, city: CityName) => Promise<void>
): Promise<void> {
    for (const division of ns.corporation.getCorporation().divisions) {
        if (division.startsWith(dummyDivisionNamePrefix)) {
            continue;
        }
        for (const city of cities) {
            await callback(division, city);
        }
    }
}

export async function waitUntilAfterStateHappens(ns: NS, state: CorpState): Promise<void> {
    while (true) {
        if (ns.corporation.getCorporation().nextState === state) {
            await ns.corporation.nextUpdate();
            break;
        }
        await ns.corporation.nextUpdate();
    }
}

export async function waitForNumberOfCycles(ns: NS, numberOfCycles: number): Promise<void> {
    const currentState = ns.corporation.getCorporation().prevState;
    let count = 0;
    while (count < numberOfCycles) {
        await waitUntilAfterStateHappens(ns, currentState as CorpState);
        ++count;
    }
}

export function hasDivision(ns: NS, divisionName: string): boolean {
    return ns.corporation.getCorporation().divisions.includes(divisionName);

}

export function buyUpgrade(ns: NS, upgrade: UpgradeName, targetLevel: number): void {
    for (let i = ns.corporation.getUpgradeLevel(upgrade); i < targetLevel; i++) {
        ns.corporation.levelUpgrade(upgrade);
    }
    if (ns.corporation.getUpgradeLevel(upgrade) < targetLevel) {
        ns.print(`ERROR: Cannot buy enough upgrade level`);
    }
}

export function buyAdvert(ns: NS, divisionName: string, targetLevel: number): void {
    for (let i = ns.corporation.getHireAdVertCount(divisionName); i < targetLevel; i++) {
        ns.corporation.hireAdVert(divisionName);
    }
    if (ns.corporation.getHireAdVertCount(divisionName) < targetLevel) {
        ns.print(`ERROR: Cannot buy enough Advert level`);
    }
}

export function buyUnlock(ns: NS, unlockName: UnlockName): void {
    if (ns.corporation.hasUnlock(unlockName)) {
        return;
    }
    ns.corporation.purchaseUnlock(unlockName);
}

/**
 * Warehouse starts at level 1
 *
 * @param ns
 * @param divisionName
 * @param city
 * @param targetLevel
 */
export function upgradeWarehouse(ns: NS, divisionName: string, city: CityName, targetLevel: number): void {
    const amount = targetLevel - ns.corporation.getWarehouse(divisionName, city).level;
    if (amount < 1) {
        return;
    }
    ns.corporation.upgradeWarehouse(divisionName, city, amount);
}

/**
 * Buying tea/throwing party for each office
 *
 * @param ns
 * @param divisionName
 */
export async function buyTeaAndThrowParty(ns: NS, divisionName: string): Promise<void> {
    let epsilon = 0.5;
    let minAcceptableEnergy = 99;
    let minAcceptableMorale = 99;
    if (ns.corporation.hasResearched(divisionName, ResearchName.GO_JUICE)) {
        minAcceptableEnergy = 109;
    }
    if (ns.corporation.hasResearched(divisionName, ResearchName.STIMU)) {
        minAcceptableMorale = 109;
    }
    while (true) {
        let finish = true;
        for (const city of cities) {
            const office = ns.corporation.getOffice(divisionName, city);
            if (office.avgEnergy < minAcceptableEnergy + epsilon) {
                ns.corporation.buyTea(divisionName, city);
                finish = false;
            }
            if (office.avgMorale < minAcceptableMorale + epsilon) {
                ns.corporation.throwParty(divisionName, city, 500000);
                finish = false;
            }
        }
        if (finish) {
            break;
        }
        await ns.corporation.nextUpdate();
    }
}

/**
 * Buying tea/throwing party once for each office in all divisions
 */
export function buyTeaAndThrowPartyForAllDivisions(ns: NS): void {
    // If we are in round 3+, we buy tea and throw party every cycle to maintain max energy/morale
    if (ns.corporation.getInvestmentOffer().round >= 3 || ns.corporation.getCorporation().public) {
        loopAllDivisionsAndCities(ns, (divisionName: string, city: CityName) => {
            ns.corporation.buyTea(divisionName, city);
            ns.corporation.throwParty(divisionName, city, 500000);
        });
        return;
    }
    let epsilon = 0.5;
    loopAllDivisionsAndCities(ns, (divisionName: string, city: CityName) => {
        let minAcceptableEnergy = 99;
        let minAcceptableMorale = 99;
        if (ns.corporation.hasResearched(divisionName, ResearchName.GO_JUICE)) {
            minAcceptableEnergy = 109;
        }
        if (ns.corporation.hasResearched(divisionName, ResearchName.STIMU)) {
            minAcceptableMorale = 109;
        }
        const office = ns.corporation.getOffice(divisionName, city);
        if (office.avgEnergy < minAcceptableEnergy + epsilon) {
            ns.corporation.buyTea(divisionName, city);
        }
        if (office.avgMorale < minAcceptableMorale + epsilon) {
            ns.corporation.throwParty(divisionName, city, 500000);
        }
    });
}

export function generateOfficeSetups(cities: CityName[], size: number, jobs: {
    name: EmployeePosition;
    count: number;
}[]): OfficeSetup[] {
    const officeSetupJobs: OfficeSetupJobs = {
        Operations: 0,
        Engineer: 0,
        Business: 0,
        Management: 0,
        "Research & Development": 0,
    };
    for (const job of jobs) {
        switch (job.name) {
            case EmployeePosition.OPERATIONS:
                officeSetupJobs.Operations = job.count;
                break;
            case EmployeePosition.ENGINEER:
                officeSetupJobs.Engineer = job.count;
                break;
            case EmployeePosition.BUSINESS:
                officeSetupJobs.Business = job.count;
                break;
            case EmployeePosition.MANAGEMENT:
                officeSetupJobs.Management = job.count;
                break;
            case EmployeePosition.RESEARCH_DEVELOPMENT:
                officeSetupJobs["Research & Development"] = job.count;
                break;
            default:
                throw new Error(`Invalid job: ${job.name}`);
        }
    }
    const officeSetups: OfficeSetup[] = [];
    // const officeSetupJobs
    for (const city of cities) {
        officeSetups.push({
            city: city,
            size: size,
            jobs: officeSetupJobs
        });
    }
    return officeSetups;
}

export function assignJobs(ns: NS, divisionName: string, officeSetups: OfficeSetup[]): void {
    for (const officeSetup of officeSetups) {
        // Reset all jobs
        for (const jobName of Object.values(EmployeePosition)) {
            ns.corporation.setAutoJobAssignment(divisionName, officeSetup.city, jobName, 0);
        }
        // Assign jobs
        for (const [jobName, count] of Object.entries(officeSetup.jobs)) {
            if (!ns.corporation.setAutoJobAssignment(divisionName, officeSetup.city, jobName, count)) {
                ns.print(`Cannot assign job properly. City: ${officeSetup.city}, job: ${jobName}, count: ${count}`);
            }
        }
    }
}

export function upgradeOffices(ns: NS, divisionName: string, officeSetups: OfficeSetup[]): void {
    for (const officeSetup of officeSetups) {
        const office = ns.corporation.getOffice(divisionName, officeSetup.city);
        if (officeSetup.size < office.size) {
            ns.print(`Office's new size is smaller than current size. City: ${officeSetup.city}`);
            continue;
        }
        if (officeSetup.size > office.size) {
            // Upgrade office
            ns.corporation.upgradeOfficeSize(divisionName, officeSetup.city, officeSetup.size - office.size);
        }
        // Hire employees
        // eslint-disable-next-line no-empty
        while (ns.corporation.hireEmployee(divisionName, officeSetup.city, EmployeePosition.RESEARCH_DEVELOPMENT)) {
        }
    }
    // Assign jobs
    assignJobs(ns, divisionName, officeSetups);
    ns.print(`Upgrade offices completed`);
}

export function clearPurchaseOrders(ns: NS, clearInputMaterialOrders: boolean = true): void {
    loopAllDivisionsAndCities(ns, (divisionName, city) => {
        for (const materialName of boostMaterials) {
            ns.corporation.buyMaterial(divisionName, city, materialName, 0);
            ns.corporation.sellMaterial(divisionName, city, materialName, "0", "MP");
        }
        if (clearInputMaterialOrders) {
            const division = ns.corporation.getDivision(divisionName);
            const industrialData = ns.corporation.getIndustryData(division.type);
            for (const materialName of getRecordKeys(industrialData.requiredMaterials)) {
                ns.corporation.buyMaterial(divisionName, city, materialName, 0);
                ns.corporation.sellMaterial(divisionName, city, materialName, "0", "MP");
            }
        }
    });
}

export function generateMaterialsOrders(
    cities: CityName[],
    materials: {
        name: MaterialName;
        count: number;
    }[]
): MaterialOrder[] {
    const orders: MaterialOrder[] = [];
    for (const city of cities) {
        orders.push({
            city: city,
            materials: materials
        });
    }
    return orders;
}

export async function stockMaterials(
    ns: NS,
    divisionName: string,
    orders: MaterialOrder[],
    discardExceeded = false
): Promise<void> {
    let nsExited = false;
    // Clear purchase order of boost materials when script exits
    ns.atExit(() => {
        nsExited = true;
        clearPurchaseOrders(ns, false);
    });
    let count = 0;
    while (!nsExited) {
        if (count === 3) {
            const warningMessage = `It takes too many cycles to stock up on materials. Division: ${divisionName}, `
                + `orders: ${JSON.stringify(orders)}`;
            showWarning(ns, warningMessage);
            break;
        }
        let finish = true;
        for (const order of orders) {
            for (const material of order.materials) {
                const storedAmount = ns.corporation.getMaterial(divisionName, order.city, material.name).stored;
                if (storedAmount === material.count) {
                    ns.corporation.buyMaterial(divisionName, order.city, material.name, 0);
                    ns.corporation.sellMaterial(divisionName, order.city, material.name, "0", "MP");
                    continue;
                }
                // Buy
                if (storedAmount < material.count) {
                    ns.corporation.buyMaterial(divisionName, order.city, material.name, (material.count - storedAmount) / 10);
                    ns.corporation.sellMaterial(divisionName, order.city, material.name, "0", "MP");
                    finish = false;
                }
                // Discard
                else if (discardExceeded) {
                    ns.corporation.buyMaterial(divisionName, order.city, material.name, 0);
                    ns.corporation.sellMaterial(divisionName, order.city, material.name, ((storedAmount - material.count) / 10).toString(), "0");
                    finish = false;
                }
            }
        }
        if (finish) {
            break;
        }
        await waitUntilAfterStateHappens(ns, CorpState.PURCHASE);
        ++count;
    }
}

export function getCorporationUpgradeLevels(ns: NS): CorporationUpgradeLevels {
    const corporationUpgradeLevels: CorporationUpgradeLevels = {
        [UpgradeName.SMART_FACTORIES]: 0,
        [UpgradeName.SMART_STORAGE]: 0,
        [UpgradeName.DREAM_SENSE]: 0,
        [UpgradeName.WILSON_ANALYTICS]: 0,
        [UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS]: 0,
        [UpgradeName.SPEECH_PROCESSOR_IMPLANTS]: 0,
        [UpgradeName.NEURAL_ACCELERATORS]: 0,
        [UpgradeName.FOCUS_WIRES]: 0,
        [UpgradeName.ABC_SALES_BOTS]: 0,
        [UpgradeName.PROJECT_INSIGHT]: 0
    };
    for (const upgradeName of Object.values(UpgradeName)) {
        corporationUpgradeLevels[upgradeName] = ns.corporation.getUpgradeLevel(upgradeName);
    }
    return corporationUpgradeLevels;
}

export function getDivisionResearches(ns: NS, divisionName: string): DivisionResearches {
    const divisionResearches: DivisionResearches = {
        [ResearchName.HI_TECH_RND_LABORATORY]: false,
        [ResearchName.AUTO_BREW]: false,
        [ResearchName.AUTO_PARTY]: false,
        [ResearchName.AUTO_DRUG]: false,
        [ResearchName.CPH4_INJECT]: false,
        [ResearchName.DRONES]: false,
        [ResearchName.DRONES_ASSEMBLY]: false,
        [ResearchName.DRONES_TRANSPORT]: false,
        [ResearchName.GO_JUICE]: false,
        [ResearchName.HR_BUDDY_RECRUITMENT]: false,
        [ResearchName.HR_BUDDY_TRAINING]: false,
        [ResearchName.MARKET_TA_1]: false,
        [ResearchName.MARKET_TA_2]: false,
        [ResearchName.OVERCLOCK]: false,
        [ResearchName.SELF_CORRECTING_ASSEMBLERS]: false,
        [ResearchName.STIMU]: false,
        [ResearchName.UPGRADE_CAPACITY_1]: false,
        [ResearchName.UPGRADE_CAPACITY_2]: false,
        [ResearchName.UPGRADE_DASHBOARD]: false,
        [ResearchName.UPGRADE_FULCRUM]: false
    };
    for (const researchName of Object.values(ResearchName)) {
        divisionResearches[researchName] = ns.corporation.hasResearched(divisionName, researchName);
    }
    return divisionResearches;
}

export async function createDivision(ns: NS, divisionName: string, officeSize: number, warehouseLevel: number): Promise<Division> {
    // Create division if not exists
    if (!hasDivision(ns, divisionName)) {
        ns.corporation.expandIndustry(<CorpIndustryName>divisionName, divisionName);
    }
    const division = ns.corporation.getDivision(divisionName);
    ns.print(`Initializing division: ${divisionName}`);

    // Expand to all cities
    for (const city of cities) {
        if (!division.cities.includes(city)) {
            ns.corporation.expandCity(divisionName, city);
            ns.print(`Expand ${divisionName} to ${city}`);
        }
        // Buy warehouse
        if (!ns.corporation.hasWarehouse(divisionName, city)) {
            ns.corporation.purchaseWarehouse(divisionName, city);
        }
    }
    // Set up all cities
    upgradeOffices(
        ns,
        divisionName,
        generateOfficeSetups(
            cities,
            officeSize,
            [
                {
                    name: EmployeePosition.RESEARCH_DEVELOPMENT,
                    count: officeSize
                }
            ]
        )
    );
    for (const city of cities) {
        upgradeWarehouse(ns, divisionName, city, warehouseLevel);
        // Enable Smart Supply
        if (ns.corporation.hasUnlock(UnlockName.SMART_SUPPLY)) {
            ns.corporation.setSmartSupply(divisionName, city, true);
        }
    }
    return ns.corporation.getDivision(divisionName);
}

export function getOptimalBoostMaterialQuantities(
    industryData: CorpIndustryData,
    spaceConstraint: number,
    round: boolean = true
): number[] {
    const {aiCoreFactor, hardwareFactor, realEstateFactor, robotFactor} = industryData;
    const boostMaterialCoefficients = [aiCoreFactor!, hardwareFactor!, realEstateFactor!, robotFactor!];
    const boostMaterialSizes = boostMaterials.map(mat => CorpMaterialsData[mat].size);

    const calculateOptimalQuantities = (
        matCoefficients: number[],
        matSizes: number[]
    ): number[] => {
        const sumOfCoefficients = matCoefficients.reduce((a, b) => a + b, 0);
        const sumOfSizes = matSizes.reduce((a, b) => a + b, 0);
        const result = [];
        for (let i = 0; i < matSizes.length; ++i) {
            let matCount =
                (spaceConstraint - 500 * ((matSizes[i] / matCoefficients[i]) * (sumOfCoefficients - matCoefficients[i]) - (sumOfSizes - matSizes[i])))
                / (sumOfCoefficients / matCoefficients[i])
                / matSizes[i];
            if (matCoefficients[i] <= 0 || matCount < 0) {
                return calculateOptimalQuantities(
                    matCoefficients.toSpliced(i, 1),
                    matSizes.toSpliced(i, 1)
                ).toSpliced(i, 0, 0);
            } else {
                if (round) {
                    matCount = Math.round(matCount);
                }
                result.push(matCount);
            }
        }
        return result;
    };
    return calculateOptimalQuantities(boostMaterialCoefficients, boostMaterialSizes);
}

export function getExportRoutes(ns: NS): ExportRoute[] {
    const exportRoutes: ExportRoute[] = [];
    for (const material of materials) {
        loopAllDivisionsAndCities(ns, (divisionName, sourceCity) => {
            const exports = ns.corporation.getMaterial(divisionName, sourceCity, material).exports;
            if (exports.length === 0) {
                return;
            }
            for (const exportRoute of exports) {
                exportRoutes.push({
                    material: material,
                    sourceCity: sourceCity,
                    sourceDivision: divisionName,
                    destinationDivision: exportRoute.division,
                    destinationCity: exportRoute.city,
                    destinationAmount: exportRoute.amount,
                });
            }
        });
    }
    return exportRoutes;
}

function buildSmartSupplyKey(divisionName: string, city: CityName): string {
    return `${divisionName}|${city}`;
}

export function getLimitedRawProduction(
    ns: NS,
    division: Division,
    city: CityName,
    industrialData: CorpIndustryData,
    warehouse: Warehouse,
    isProduct: boolean,
    productSize?: number
): number {
    const office = ns.corporation.getOffice(division.name, city);
    let rawProduction = getDivisionRawProduction(
        isProduct,
        {
            operationsProduction: office.employeeProductionByJob.Operations,
            engineerProduction: office.employeeProductionByJob.Engineer,
            managementProduction: office.employeeProductionByJob.Management
        },
        division.productionMult,
        getCorporationUpgradeLevels(ns),
        getDivisionResearches(ns, division.name)
    );
    rawProduction = rawProduction * 10;

    // Calculate required storage space of each output unit. It is the net change in warehouse's storage space when
    // producing an output unit.
    let requiredStorageSpaceOfEachOutputUnit = 0;
    if (isProduct) {
        requiredStorageSpaceOfEachOutputUnit += productSize!;
    } else {
        for (const outputMaterialName of industrialData.producedMaterials!) {
            requiredStorageSpaceOfEachOutputUnit += ns.corporation.getMaterialData(outputMaterialName).size;
        }
    }
    for (const [requiredMaterialName, requiredMaterialCoefficient] of getRecordEntries(industrialData.requiredMaterials)) {
        requiredStorageSpaceOfEachOutputUnit -= ns.corporation.getMaterialData(requiredMaterialName).size * requiredMaterialCoefficient;
    }
    // Limit the raw production if needed
    if (requiredStorageSpaceOfEachOutputUnit > 0) {
        const maxNumberOfOutputUnits = Math.floor(
            (warehouse.size - warehouse.sizeUsed) / requiredStorageSpaceOfEachOutputUnit
        );
        rawProduction = Math.min(rawProduction, maxNumberOfOutputUnits);
    }

    rawProduction = Math.max(rawProduction, 0);
    return rawProduction;
}

export function setSmartSupplyData(ns: NS): void {
    // Only set smart supply data after "PURCHASE" state
    if (ns.corporation.getCorporation().prevState !== CorpState.PURCHASE) {
        return;
    }
    loopAllDivisionsAndCities(ns, (divisionName, city) => {
        const division = ns.corporation.getDivision(divisionName);
        const industrialData = ns.corporation.getIndustryData(division.type);
        const warehouse = ns.corporation.getWarehouse(division.name, city);
        let totalRawProduction = 0;

        if (industrialData.makesMaterials) {
            totalRawProduction += getLimitedRawProduction(
                ns,
                division,
                city,
                industrialData,
                warehouse,
                false
            );
        }

        if (industrialData.makesProducts) {
            for (const productName of division.products) {
                const product = ns.corporation.getProduct(divisionName, city, productName);
                if (product.developmentProgress < 100) {
                    continue;
                }
                totalRawProduction += getLimitedRawProduction(
                    ns,
                    division,
                    city,
                    industrialData,
                    warehouse,
                    true,
                    product.size
                );
            }
        }

        smartSupplyData.set(buildSmartSupplyKey(divisionName, city), totalRawProduction);
    });
}

function detectWarehouseCongestion(
    ns: NS,
    division: Division,
    industrialData: CorpIndustryData,
    city: CityName,
    warehouseCongestionData: Map<string, number>
): boolean {
    const requiredMaterials = getRecordEntries(industrialData.requiredMaterials);
    let isWarehouseCongested = false;
    const warehouseCongestionDataKey = `${division.name}|${city}`;
    const items: (Material | Product)[] = [];
    if (industrialData.producedMaterials) {
        for (const materialName of industrialData.producedMaterials) {
            items.push(ns.corporation.getMaterial(division.name, city, materialName));
        }
    }
    if (industrialData.makesProducts) {
        for (const productName of division.products) {
            const product = ns.corporation.getProduct(division.name, city, productName);
            if (product.developmentProgress < 100) {
                continue;
            }
            items.push(product);
        }
    }
    for (const item of items) {
        if (item.productionAmount !== 0) {
            warehouseCongestionData.set(warehouseCongestionDataKey, 0);
            continue;
        }
        // item.productionAmount === 0 means that division does not produce material/product last cycle.
        let numberOfCongestionTimes = warehouseCongestionData.get(warehouseCongestionDataKey)! + 1;
        if (Number.isNaN(numberOfCongestionTimes)) {
            numberOfCongestionTimes = 0;
        }
        warehouseCongestionData.set(warehouseCongestionDataKey, numberOfCongestionTimes);
        break;
    }
    // If that happens more than 5 times, the warehouse is very likely congested.
    if (warehouseCongestionData.get(warehouseCongestionDataKey)! > 5) {
        isWarehouseCongested = true;
    }
    // We need to mitigate this situation. Discarding stored input material is the simplest solution.
    if (isWarehouseCongested) {
        showWarning(ns, `Warehouse may be congested. Division: ${division.name}, city: ${city}.`);
        for (const [materialName] of requiredMaterials) {
            // Clear purchase
            ns.corporation.buyMaterial(division.name, city, materialName, 0);
            // Discard stored input material
            ns.corporation.sellMaterial(division.name, city, materialName, "MAX", "0");
        }
        warehouseCongestionData.set(warehouseCongestionDataKey, 0);
    } else {
        for (const [materialName] of requiredMaterials) {
            const material = ns.corporation.getMaterial(division.name, city, materialName);
            if (material.desiredSellAmount !== 0) {
                // Stop discarding input material
                ns.corporation.sellMaterial(division.name, city, materialName, "0", "0");
            }
        }
    }
    return isWarehouseCongested;
}

/**
 * Custom Smart Supply script
 *
 * @param ns
 * @param warehouseCongestionData
 */
export function buyOptimalAmountOfInputMaterials(ns: NS, warehouseCongestionData: Map<string, number>): void {
    if (ns.corporation.getCorporation().nextState !== "PURCHASE") {
        return;
    }
    // Loop and set buy amount
    loopAllDivisionsAndCities(ns, (divisionName, city) => {
        const division = ns.corporation.getDivision(divisionName);
        const industrialData = ns.corporation.getIndustryData(division.type);
        const office = ns.corporation.getOffice(division.name, city);
        const requiredMaterials = getRecordEntries(industrialData.requiredMaterials);

        // Detect warehouse congestion
        let isWarehouseCongested = false;
        if (!setOfDivisionsWaitingForRP.has(divisionName)
            && office.employeeJobs["Research & Development"] !== office.numEmployees) {
            isWarehouseCongested = detectWarehouseCongestion(
                ns,
                division,
                industrialData,
                city,
                warehouseCongestionData
            );
        }
        if (isWarehouseCongested) {
            return;
        }

        const warehouse = ns.corporation.getWarehouse(division.name, city);
        const inputMaterials: PartialRecord<CorpMaterialName, {
            requiredQuantity: number,
            coefficient: number;
        }> = {};
        for (const [materialName, materialCoefficient] of requiredMaterials) {
            inputMaterials[materialName] = {
                requiredQuantity: 0,
                coefficient: materialCoefficient
            };
        }

        // Find required quantity of input materials to produce material/product
        for (const inputMaterialData of Object.values(inputMaterials)) {
            const requiredQuantity = (smartSupplyData.get(buildSmartSupplyKey(divisionName, city)) ?? 0)
                * inputMaterialData.coefficient;
            inputMaterialData.requiredQuantity += requiredQuantity;
        }

        // Limit the input material units to max number of units that we can store in warehouse's free space
        for (const [materialName, inputMaterialData] of getRecordEntries(inputMaterials)) {
            const materialData = ns.corporation.getMaterialData(materialName);
            const maxAcceptableQuantity = Math.floor((warehouse.size - warehouse.sizeUsed) / materialData.size);
            const limitedRequiredQuantity = Math.min(inputMaterialData.requiredQuantity, maxAcceptableQuantity);
            if (limitedRequiredQuantity > 0) {
                inputMaterialData.requiredQuantity = limitedRequiredQuantity;
            }
        }

        // Find which input material creates the least number of output units
        let leastAmountOfOutputUnits = Number.MAX_VALUE;
        for (const {requiredQuantity, coefficient} of Object.values(inputMaterials)) {
            const amountOfOutputUnits = requiredQuantity / coefficient;
            if (amountOfOutputUnits < leastAmountOfOutputUnits) {
                leastAmountOfOutputUnits = amountOfOutputUnits;
            }
        }

        // Align all the input materials to the smallest amount
        for (const inputMaterialData of Object.values(inputMaterials)) {
            inputMaterialData.requiredQuantity = leastAmountOfOutputUnits * inputMaterialData.coefficient;
        }

        // Calculate the total size of all input materials we are trying to buy
        let requiredSpace = 0;
        for (const [materialName, inputMaterialData] of getRecordEntries(inputMaterials)) {
            requiredSpace += inputMaterialData.requiredQuantity * ns.corporation.getMaterialData(materialName).size;
        }

        // If there is not enough free space, we apply a multiplier to required quantity to not overfill warehouse
        const freeSpace = warehouse.size - warehouse.sizeUsed;
        if (requiredSpace > freeSpace) {
            const constrainedStorageSpaceMultiplier = freeSpace / requiredSpace;
            for (const inputMaterialData of Object.values(inputMaterials)) {
                inputMaterialData.requiredQuantity = Math.floor(inputMaterialData.requiredQuantity * constrainedStorageSpaceMultiplier);
            }
        }

        // Deduct the number of stored input material units from the required quantity
        for (const [materialName, inputMaterialData] of getRecordEntries(inputMaterials)) {
            const material = ns.corporation.getMaterial(divisionName, city, materialName);
            inputMaterialData.requiredQuantity = Math.max(0, inputMaterialData.requiredQuantity - material.stored);
        }

        // Buy input materials
        for (const [materialName, inputMaterialData] of getRecordEntries(inputMaterials)) {
            ns.corporation.buyMaterial(divisionName, city, materialName, inputMaterialData.requiredQuantity / 10);
        }
    });
}

/**
 * @param ns
 * @param divisionName
 * @param industryData
 * @param city
 * @param useWarehouseSize If false, function uses unused storage size after PRODUCTION state
 * @param ratio
 */
export async function findOptimalAmountOfBoostMaterials(
    ns: NS,
    divisionName: string,
    industryData: CorpIndustryData,
    city: CityName,
    useWarehouseSize: boolean,
    ratio: number
): Promise<number[]> {
    const warehouseSize = ns.corporation.getWarehouse(divisionName, city).size;
    if (useWarehouseSize) {
        return getOptimalBoostMaterialQuantities(industryData, warehouseSize * ratio);
    }
    await waitUntilAfterStateHappens(ns, CorpState.PRODUCTION);
    const availableSpace = ns.corporation.getWarehouse(divisionName, city).size
        - ns.corporation.getWarehouse(divisionName, city).sizeUsed;
    return getOptimalBoostMaterialQuantities(industryData, availableSpace * ratio);
}

export async function waitUntilHavingEnoughResearchPoints(ns: NS, conditions: {
    divisionName: string;
    researchPoint: number;
}[]): Promise<void> {
    ns.print(`Waiting for research points: ${JSON.stringify(conditions)}`);
    while (true) {
        let finish = true;
        for (const condition of conditions) {
            if (ns.corporation.getDivision(condition.divisionName).researchPoints >= condition.researchPoint) {
                setOfDivisionsWaitingForRP.delete(condition.divisionName);
                continue;
            }
            setOfDivisionsWaitingForRP.add(condition.divisionName);
            finish = false;
        }
        if (finish) {
            break;
        }
        await ns.corporation.nextUpdate();
    }
    ns.print(`Finished waiting for research points. Conditions: ${JSON.stringify(conditions)}`);
}

/**
 * This function assumes that all product's names were generated by {@link generateNextProductName}
 *
 * @param ns
 * @param divisionName
 */
export function getProductIdArray(ns: NS, divisionName: string): number[] {
    const products = ns.corporation.getDivision(divisionName).products;
    return products
        .map(productName => {
            const productNameParts = productName.split("-");
            if (productNameParts.length != 3) {
                return NaN;
            }
            return parseNumber(productNameParts[1]);
        })
        .filter(productIndex => !Number.isNaN(productIndex));
}

/**
 * ["Tobacco-00000|1e12", "Tobacco-00001|1e12", "Tobacco-00002|1e12"] => "Tobacco-00003|1e12"
 * 1e12 is designInvest + marketingInvest
 *
 * @param ns
 * @param divisionName
 * @param productDevelopmentBudget
 */
export function generateNextProductName(ns: NS, divisionName: string, productDevelopmentBudget: number): string {
    if (!Number.isFinite(productDevelopmentBudget) || productDevelopmentBudget < 1e3) {
        throw new Error(`Invalid budget: ${productDevelopmentBudget}`);
    }
    const productIdArray = getProductIdArray(ns, divisionName);
    if (productIdArray.length === 0) {
        return `${divisionName}-00000-${productDevelopmentBudget.toExponential(5)}`;
    }
    return `${divisionName}-${(Math.max(...productIdArray) + 1).toString().padStart(5, "0")}-${productDevelopmentBudget.toExponential(5)}`;
}

function getMaxNumberOfProducts(ns: NS, divisionName: string): number {
    let maxNumberOfProducts = 3;
    if (ns.corporation.hasResearched(divisionName, ResearchName.UPGRADE_CAPACITY_1)) {
        maxNumberOfProducts = 4;
    }
    if (ns.corporation.hasResearched(divisionName, ResearchName.UPGRADE_CAPACITY_2)) {
        maxNumberOfProducts = 5;
    }
    return maxNumberOfProducts;
}

export function developNewProduct(
    ns: NS,
    divisionName: string,
    mainProductDevelopmentCity: CityName,
    productDevelopmentBudget: number
): string | null {
    const products = ns.corporation.getDivision(divisionName).products;

    let hasDevelopingProduct = false;
    let bestProduct = null;
    let worstProduct = null;
    let maxProductRating = Number.MIN_VALUE;
    let minProductRating = Number.MAX_VALUE;
    for (const productName of products) {
        const product = ns.corporation.getProduct(divisionName, mainProductDevelopmentCity, productName);
        //Check if there is any developing product
        if (product.developmentProgress < 100) {
            hasDevelopingProduct = true;
            break;
        }
        // Determine the best and worst product
        const productRating = product.rating;
        if (productRating < minProductRating) {
            worstProduct = product;
            minProductRating = productRating;
        }
        if (productRating > maxProductRating) {
            bestProduct = product;
            maxProductRating = productRating;
        }
    }

    // Do nothing if there is any developing product
    if (hasDevelopingProduct) {
        return null;
    }
    if (!bestProduct && products.length > 0) {
        throw new Error("Cannot find the best product");
    }
    if (!worstProduct && products.length > 0) {
        throw new Error("Cannot find the worst product to discontinue");
    }
    // New product's budget should be greater than X% of current best product's budget.
    if (bestProduct) {
        const bestProductBudget = bestProduct.designInvestment + bestProduct.advertisingInvestment;
        if (productDevelopmentBudget < bestProductBudget * 0.5 && products.length >= 3) {
            const warningMessage = `Budget for new product is too low: ${ns.formatNumber(productDevelopmentBudget)}. `
                + `Current best product's budget: ${ns.formatNumber(bestProductBudget)}`;
            console.warn(warningMessage);
            showWarning(
                ns,
                warningMessage
            );
        }
    }

    if (worstProduct && products.length === getMaxNumberOfProducts(ns, divisionName)) {
        ns.corporation.discontinueProduct(divisionName, worstProduct.name);
    }
    const productName = generateNextProductName(ns, divisionName, productDevelopmentBudget);
    ns.corporation.makeProduct(
        divisionName,
        mainProductDevelopmentCity,
        productName,
        productDevelopmentBudget / 2,
        productDevelopmentBudget / 2,
    );
    return productName;
}

export function getNewestProductName(ns: NS, divisionName: string): string | null {
    const products = ns.corporation.getDivision(divisionName).products;
    if (products.length === 0) {
        return null;
    }
    return products[products.length - 1];
}

export async function calculateProductMarkup(
    divisionRP: number,
    industryScienceFactor: number,
    product: Product,
    employeeProductionByJob?: {
        operationsProduction: number;
        engineerProduction: number;
        businessProduction: number;
        managementProduction: number;
        researchAndDevelopmentProduction: number;
    }
): Promise<number> {
    const designInvestmentMultiplier = 1 + Math.pow(product.designInvestment, 0.1) / 100;
    const researchPointMultiplier = 1 + Math.pow(divisionRP, industryScienceFactor) / 800;
    const k = designInvestmentMultiplier * researchPointMultiplier;
    const balanceMultiplier = function (
        creationJobFactorsEngineer: number,
        creationJobFactorsManagement: number,
        creationJobFactorsRnD: number,
        creationJobFactorsOperations: number,
        creationJobFactorsBusiness: number): number {
        const totalCreationJobFactors = creationJobFactorsEngineer + creationJobFactorsManagement + creationJobFactorsRnD + creationJobFactorsOperations + creationJobFactorsBusiness;
        const engineerRatio = creationJobFactorsEngineer / totalCreationJobFactors;
        const managementRatio = creationJobFactorsManagement / totalCreationJobFactors;
        const researchAndDevelopmentRatio = creationJobFactorsRnD / totalCreationJobFactors;
        const operationsRatio = creationJobFactorsOperations / totalCreationJobFactors;
        const businessRatio = creationJobFactorsBusiness / totalCreationJobFactors;
        return 1.2 * engineerRatio + 0.9 * managementRatio + 1.3 * researchAndDevelopmentRatio + 1.5 * operationsRatio + businessRatio;

    };
    const f1 = function ([creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness]: number[]) {
        return k
            * balanceMultiplier(creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness)
            * (0.1 * creationJobFactorsEngineer + 0.05 * creationJobFactorsManagement + 0.05 * creationJobFactorsRnD + 0.02 * creationJobFactorsOperations + 0.02 * creationJobFactorsBusiness)
            - product.stats.quality;
    };
    const f2 = function ([creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness]: number[]) {
        return k
            * balanceMultiplier(creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness)
            * (0.15 * creationJobFactorsEngineer + 0.02 * creationJobFactorsManagement + 0.02 * creationJobFactorsRnD + 0.02 * creationJobFactorsOperations + 0.02 * creationJobFactorsBusiness)
            - product.stats.performance;
    };
    const f3 = function ([creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness]: number[]) {
        return k
            * balanceMultiplier(creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness)
            * (0.05 * creationJobFactorsEngineer + 0.02 * creationJobFactorsManagement + 0.08 * creationJobFactorsRnD + 0.05 * creationJobFactorsOperations + 0.05 * creationJobFactorsBusiness)
            - product.stats.durability;
    };
    const f4 = function ([creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness]: number[]) {
        return k
            * balanceMultiplier(creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness)
            * (0.02 * creationJobFactorsEngineer + 0.08 * creationJobFactorsManagement + 0.02 * creationJobFactorsRnD + 0.05 * creationJobFactorsOperations + 0.08 * creationJobFactorsBusiness)
            - product.stats.reliability;
    };
    const f5 = function ([creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness]: number[]) {
        return k
            * balanceMultiplier(creationJobFactorsEngineer, creationJobFactorsManagement, creationJobFactorsRnD, creationJobFactorsOperations, creationJobFactorsBusiness)
            * (0.08 * creationJobFactorsManagement + 0.05 * creationJobFactorsRnD + 0.02 * creationJobFactorsOperations + 0.1 * creationJobFactorsBusiness)
            - product.stats.aesthetics;
    };
    let solverResult: CeresSolverResult = {
        success: false,
        message: "",
        x: [],
        report: "string",
    };
    const solver = new Ceres();
    await solver.promise.then(function () {
        solver.add_function(f1);
        solver.add_function(f2);
        solver.add_function(f3);
        solver.add_function(f4);
        solver.add_function(f5);
        // Guess the initial values of the solution
        let guess = [1, 1, 1, 1, 1];
        if (employeeProductionByJob) {
            guess = [
                employeeProductionByJob.engineerProduction,
                employeeProductionByJob.managementProduction,
                employeeProductionByJob.researchAndDevelopmentProduction,
                employeeProductionByJob.operationsProduction,
                employeeProductionByJob.businessProduction
            ];
        }
        solverResult = solver.solve(guess)!;
        solver.remove();
    });
    if (!solverResult.success) {
        throw new Error(`ERROR: Cannot find hidden stats of product: ${JSON.stringify(product)}`);
    }
    const totalCreationJobFactors = solverResult.x[0] + solverResult.x[1] + solverResult.x[2] + solverResult.x[3] + solverResult.x[4];
    const managementRatio = solverResult.x[1] / totalCreationJobFactors;
    const businessRatio = solverResult.x[4] / totalCreationJobFactors;

    const advertisingInvestmentMultiplier = 1 + Math.pow(product.advertisingInvestment, 0.1) / 100;
    const businessManagementRatio = Math.max(businessRatio + managementRatio, 1 / totalCreationJobFactors);
    return 100 / (advertisingInvestmentMultiplier * Math.pow(product.stats.quality + 0.001, 0.65) * businessManagementRatio);
}

export function isProduct(item: Material | Product): item is Product {
    return "rating" in item;
}

export function validateProductMarkupMap(ns: NS): void {
    for (const productKey of productMarkupData.keys()) {
        const productKeyInfo = productKey.split("|");
        const divisionName = productKeyInfo[0];
        const productName = productKeyInfo[2];
        if (!ns.corporation.getDivision(divisionName).products.includes(productName)) {
            productMarkupData.delete(productKey);
        }
    }
}

export async function getProductMarkup(
    division: Division,
    industryData: CorpIndustryData,
    city: CityName,
    item: Product,
    office?: Office
): Promise<number> {
    let productMarkup;
    const productMarkupKey = `${division.name}|${city}|${item.name}`;
    productMarkup = productMarkupData.get(productMarkupKey);
    if (!productMarkup) {
        productMarkup = await calculateProductMarkup(
            division.researchPoints,
            industryData.scienceFactor!,
            item,
            (office) ? {
                operationsProduction: office.employeeProductionByJob.Operations,
                engineerProduction: office.employeeProductionByJob.Engineer,
                businessProduction: office.employeeProductionByJob.Business,
                managementProduction: office.employeeProductionByJob.Management,
                researchAndDevelopmentProduction: office.employeeProductionByJob["Research & Development"],
            } : undefined
        );
        productMarkupData.set(productMarkupKey, productMarkup);
    }
    return productMarkup;
}

/**
 * Custom Market-TA.II script
 *
 * @param ns
 * @param division
 * @param industryData
 * @param city
 * @param item
 * @returns
 */
export async function getOptimalSellingPrice(
    ns: NS,
    division: Division,
    industryData: CorpIndustryData,
    city: CityName,
    item: Material | Product
): Promise<string> {
    const itemIsProduct = isProduct(item);
    if (itemIsProduct && item.developmentProgress < 100) {
        throw new Error(`Product is not finished. Product: ${JSON.stringify(item)}`);
    }
    if (!ns.corporation.hasUnlock(UnlockName.MARKET_RESEARCH_DEMAND)) {
        throw new Error(`You must unlock "Market Research - Demand"`);
    }
    if (!ns.corporation.hasUnlock(UnlockName.MARKET_DATA_COMPETITION)) {
        throw new Error(`You must unlock "Market Data - Competition"`);
    }

    if (ns.corporation.getCorporation().nextState !== "SALE") {
        return "0";
    }
    const expectedSalesVolume = item.stored / 10;
    // Do not compare with 0, there is case when item.stored is a tiny number.
    if (expectedSalesVolume < 1e-5) {
        return "0";
    }

    const office = ns.corporation.getOffice(division.name, city);
    let productMarkup: number;
    let markupLimit: number;
    let itemMultiplier: number;
    let marketPrice: number;
    if (itemIsProduct) {
        productMarkup = await getProductMarkup(
            division,
            industryData,
            city,
            item,
            office
        );
        markupLimit = Math.max(item.effectiveRating, 0.001) / productMarkup;
        itemMultiplier = 0.5 * Math.pow(item.effectiveRating, 0.65);
        marketPrice = item.productionCost;
    } else {
        markupLimit = item.quality / ns.corporation.getMaterialData(item.name).baseMarkup;
        itemMultiplier = item.quality + 0.001;
        marketPrice = item.marketPrice;
    }

    const businessFactor = getBusinessFactor(office.employeeProductionByJob[EmployeePosition.BUSINESS]);
    const advertisingFactor = getAdvertisingFactors(division.awareness, division.popularity, industryData.advertisingFactor!)[0];
    const marketFactor = getMarketFactor(item.demand!, item.competition!);
    const salesMultipliers =
        itemMultiplier *
        businessFactor *
        advertisingFactor *
        marketFactor *
        getUpgradeBenefit(UpgradeName.ABC_SALES_BOTS, ns.corporation.getUpgradeLevel(UpgradeName.ABC_SALES_BOTS)) *
        getResearchSalesMultiplier(getDivisionResearches(ns, division.name));
    const optimalPrice = markupLimit / Math.sqrt(expectedSalesVolume / salesMultipliers) + marketPrice;
    // ns.print(`item: ${item.name}, optimalPrice: ${ns.formatNumber(optimalPrice)}`);

    return optimalPrice.toString();
}

export async function setOptimalSellingPriceForEverything(ns: NS): Promise<void> {
    if (ns.corporation.getCorporation().nextState !== "SALE") {
        return;
    }
    if (!ns.corporation.hasUnlock(UnlockName.MARKET_RESEARCH_DEMAND)
        || !ns.corporation.hasUnlock(UnlockName.MARKET_DATA_COMPETITION)) {
        return;
    }
    await loopAllDivisionsAndCitiesAsyncCallback(ns, async (divisionName, city) => {
        const division = ns.corporation.getDivision(divisionName);
        const industryData = ns.corporation.getIndustryData(division.type);
        const products = division.products;
        const hasMarketTA2 = ns.corporation.hasResearched(divisionName, ResearchName.MARKET_TA_2);
        if (industryData.makesProducts) {
            // Set sell price for products
            for (const productName of products) {
                const product = ns.corporation.getProduct(divisionName, city, productName);
                if (product.developmentProgress < 100) {
                    continue;
                }
                if (hasMarketTA2) {
                    ns.corporation.setProductMarketTA2(divisionName, productName, true);
                    continue;
                }
                const optimalPrice = await getOptimalSellingPrice(ns, division, industryData, city, product);
                if (parseNumber(optimalPrice) > 0) {
                    ns.corporation.sellProduct(divisionName, city, productName, "MAX", optimalPrice, false);
                }
            }
        }
        if (industryData.makesMaterials) {
            // Set sell price for output materials
            for (const materialName of industryData.producedMaterials!) {
                const material = ns.corporation.getMaterial(divisionName, city, materialName);
                if (hasMarketTA2) {
                    ns.corporation.setMaterialMarketTA2(divisionName, city, materialName, true);
                    continue;
                }
                const optimalPrice = await getOptimalSellingPrice(ns, division, industryData, city, material);
                if (parseNumber(optimalPrice) > 0) {
                    ns.corporation.sellMaterial(divisionName, city, materialName, "MAX", optimalPrice);
                }
            }
        }
    });
}

export function getResearchPointGainRate(ns: NS, divisionName: string): number {
    let totalGainRate = 0;
    for (const city of cities) {
        const office = ns.corporation.getOffice(divisionName, city);
        // 4 states: PURCHASE, PRODUCTION, EXPORT and SALE
        totalGainRate += 4 * 0.004 * Math.pow(office.employeeProductionByJob[EmployeePosition.RESEARCH_DEVELOPMENT], 0.5)
            * getUpgradeBenefit(UpgradeName.PROJECT_INSIGHT, ns.corporation.getUpgradeLevel(UpgradeName.PROJECT_INSIGHT))
            * getResearchRPMultiplier(getDivisionResearches(ns, divisionName));
    }
    return totalGainRate;
}

export async function buyBoostMaterials(ns: NS, division: Division, ratio: number = 0.1): Promise<void> {
    const industryData = ns.corporation.getIndustryData(division.type);
    let reservedSpaceRatio = 0.15;
    if (industryData.makesProducts) {
        reservedSpaceRatio = 0.1;
        ratio = 0.1;
    }
    let count = 0;
    while (true) {
        await waitUntilAfterStateHappens(ns, CorpState.EXPORT);
        if (count === 15) {
            const warningMessage = `It takes too many cycles to buy boost materials. Division: ${division.name}.`;
            showWarning(ns, warningMessage);
            break;
        }
        let finish = true;
        const orders = [];
        for (const city of cities) {
            const warehouse = ns.corporation.getWarehouse(division.name, city);
            const availableSpace = warehouse.size - warehouse.sizeUsed;
            if (availableSpace < warehouse.size * reservedSpaceRatio) {
                continue;
            }
            const boostMaterialQuantities = getOptimalBoostMaterialQuantities(industryData, availableSpace * ratio);
            orders.push({
                city: city,
                materials: [
                    {
                        name: MaterialName.AI_CORES,
                        count: ns.corporation.getMaterial(division.name, city, MaterialName.AI_CORES).stored + boostMaterialQuantities[0]
                    },
                    {
                        name: MaterialName.HARDWARE,
                        count: ns.corporation.getMaterial(division.name, city, MaterialName.HARDWARE).stored + boostMaterialQuantities[1]
                    },
                    {
                        name: MaterialName.REAL_ESTATE,
                        count: ns.corporation.getMaterial(division.name, city, MaterialName.REAL_ESTATE).stored + boostMaterialQuantities[2]
                    },
                    {
                        name: MaterialName.ROBOTS,
                        count: ns.corporation.getMaterial(division.name, city, MaterialName.ROBOTS).stored + boostMaterialQuantities[3]
                    },
                ]
            });
            finish = false;
        }
        if (finish) {
            break;
        }
        await stockMaterials(
            ns,
            division.name,
            orders
        );
        ++count;
    }
}

export function getProductMarketPrice(
    ns: NS,
    division: Division,
    industryData: CorpIndustryData,
    city: CityName
): number {
    let productMarketPrice = 0;
    for (const [materialName, materialCoefficient] of getRecordEntries(industryData.requiredMaterials)) {
        const materialMarketPrice = ns.corporation.getMaterial(division.name, city, materialName).marketPrice;
        productMarketPrice += materialMarketPrice * materialCoefficient;
    }
    return productMarketPrice * productMarketPriceMultiplier;
}

export function createDummyDivisions(ns: NS, numberOfDivisions: number) {
    const divisions = ns.corporation.getCorporation().divisions;
    for (let i = 0; i < numberOfDivisions; i++) {
        const dummyDivisionName = dummyDivisionNamePrefix + i.toString().padStart(2, "0");
        if (divisions.includes(dummyDivisionName)) {
            continue;
        }
        ns.corporation.expandIndustry(IndustryType.RESTAURANT, dummyDivisionName);
    }
}

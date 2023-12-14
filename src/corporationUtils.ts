import {CorpIndustryData, CorpIndustryName, CorpMaterialName, Division, Material, NS, Product, Warehouse} from "@ns";
import {getRecordEntries, PartialRecord} from "/libs/Record";
import {parseNumber} from "/libs/utils";
import {Ceres} from "/libs/Ceres";
import {
    calculateDivisionRawProduction,
    CeresSolverResult,
    CityName,
    CorporationUpgradeLevels,
    CorpState,
    DivisionResearches,
    EmployeePosition,
    getAdvertisingFactors,
    getBusinessFactor,
    getMarketFactor,
    getResearchRPMultiplier,
    getResearchSalesMultiplier,
    getUpgradeBenefit,
    MaterialName,
    OfficeSetup,
    OfficeSetupJobs,
    productMarketPriceMultiplier,
    ResearchName,
    UnlockName,
    UpgradeName
} from "/corporationFormulas";
import {CorpMaterialsData} from "/data/CorpMaterialsData";

export enum DivisionName {
    AGRICULTURE = "Agriculture",
    CHEMICAL = "Chemical",
    TOBACCO = "Tobacco",
}

interface ExportRoute {
    material: CorpMaterialName;
    sourceCity: CityName;
    sourceDivision: string;
    destinationDivision: string;
    destinationCity: CityName;
    destinationAmount: string;
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

export const boostMaterials = [MaterialName.AI_CORES, MaterialName.HARDWARE, MaterialName.REAL_ESTATE, MaterialName.ROBOTS];

export const exportString = "(IPROD+IINV/10)*(-1)";

// Key: divisionName|city|productName
const productMarkupMap = new Map<string, number>();

export function loopAllDivisionsAndCities(ns: NS, callback: (divisionName: string, city: CityName) => void) {
    for (const division of ns.corporation.getCorporation().divisions) {
        for (const city of cities) {
            callback(division, city);
        }
    }
}

export async function loopAllDivisionsAndCitiesAsyncCallback(ns: NS, callback: (divisionName: string, city: CityName) => Promise<void>) {
    for (const division of ns.corporation.getCorporation().divisions) {
        for (const city of cities) {
            await callback(division, city);
        }
    }
}

export async function waitUntilState(ns: NS, state: CorpState) {
    while (true) {
        if (ns.corporation.getCorporation().prevState === state) {
            break;
        }
        await ns.corporation.nextUpdate();
    }
}

export function hasDivision(ns: NS, divisionName: string): boolean {
    return ns.corporation.getCorporation().divisions.includes(divisionName);

}

export function buyUpgrade(ns: NS, upgrade: UpgradeName, targetLevel: number) {
    for (let i = ns.corporation.getUpgradeLevel(upgrade); i < targetLevel; i++) {
        ns.corporation.levelUpgrade(upgrade);
    }
    if (ns.corporation.getUpgradeLevel(upgrade) < targetLevel) {
        ns.print(`ERROR: Cannot buy enough upgrade level`);
    }
}

export function buyAdvert(ns: NS, divisionName: string, targetLevel: number) {
    for (let i = ns.corporation.getHireAdVertCount(divisionName); i < targetLevel; i++) {
        ns.corporation.hireAdVert(divisionName);
    }
    if (ns.corporation.getHireAdVertCount(divisionName) < targetLevel) {
        ns.print(`ERROR: Cannot buy enough Advert level`);
    }
}

export function buyUnlock(ns: NS, unlockName: UnlockName) {
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
export function upgradeWarehouse(ns: NS, divisionName: string, city: CityName, targetLevel: number) {
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
export async function buyTeaAndThrowParty(ns: NS, divisionName: string) {
    // noinspection DuplicatedCode
    while (true) {
        let finish = true;
        for (const city of cities) {
            const office = ns.corporation.getOffice(divisionName, city);
            if (office.avgEnergy < 99) {
                ns.corporation.buyTea(divisionName, city);
                finish = false;
            }
            if (office.avgMorale < 99) {
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
export function buyTeaAndThrowPartyForAllDivisions(ns: NS) {
    loopAllDivisionsAndCities(ns, (divisionName: string, city: CityName) => {
        const office = ns.corporation.getOffice(divisionName, city);
        if (office.avgEnergy < 99) {
            ns.corporation.buyTea(divisionName, city);
        }
        if (office.avgMorale < 99) {
            ns.corporation.throwParty(divisionName, city, 500000);
        }
    });
}

export function generateOfficeSetups(cities: CityName[], size: number, jobs: {
    name: EmployeePosition;
    count: number;
}[]) {
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

export function assignJobs(ns: NS, divisionName: string, officeSetups: OfficeSetup[], verify = false) {
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
    if (!verify) {
        return;
    }
    ns.corporation.nextUpdate().then(() => {
        waitUntilState(ns, CorpState.START).then(() => {
            for (const city of cities) {
                const office = ns.corporation.getOffice(divisionName, city);
                // Check for Unassigned employees
                const unassignedEmployees = office.employeeJobs.Unassigned;
                if (unassignedEmployees > 0) {
                    ns.print(`WARNING: There are ${unassignedEmployees} unassigned employees. Automatically assign them to ${EmployeePosition.RESEARCH_DEVELOPMENT}.`);
                    ns.corporation.setAutoJobAssignment(divisionName, city, EmployeePosition.RESEARCH_DEVELOPMENT, unassignedEmployees);
                }
            }
        });
    });
}

export function upgradeOffices(ns: NS, divisionName: string, officeSetups: OfficeSetup[]) {
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
        while (ns.corporation.hireEmployee(divisionName, officeSetup.city)) {
        }
    }
    // Assign jobs
    assignJobs(ns, divisionName, officeSetups, false);
    ns.print(`Upgrade offices completed`);
}

export function generateMaterialsOrders(
    cities: CityName[],
    materials: {
        name: MaterialName;
        count: number;
    }[]
) {
    const orders = [];
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
    orders: {
        city: CityName,
        materials: {
            name: MaterialName;
            count: number;
        }[]
    }[],
    discardExceeded = false
) {
    while (true) {
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
        await ns.corporation.nextUpdate();
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

export async function initDivision(ns: NS, divisionName: string, officeSize: number, warehouseLevel: number) {
    // Create division if not exists
    if (!ns.corporation.getCorporation().divisions.includes(divisionName)) {
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
    await buyTeaAndThrowParty(ns, divisionName);
    return ns.corporation.getDivision(divisionName);
}

function calculateOptimalBoostMaterialQuantities(
    matCoefficients: number[],
    matSizes: number[],
    spaceConstraint: number,
    round: boolean): number[] {
    const sumOfCoefficients = matCoefficients.reduce((a, b) => a + b, 0);
    const sumOfSizes = matSizes.reduce((a, b) => a + b, 0);
    const result = [];
    for (let i = 0; i < matSizes.length; ++i) {
        let matCount =
            (spaceConstraint - 500 * ((matSizes[i] / matCoefficients[i]) * (sumOfCoefficients - matCoefficients[i]) - (sumOfSizes - matSizes[i])))
            / (sumOfCoefficients / matCoefficients[i])
            / matSizes[i];
        if (matCoefficients[i] <= 0 || matCount < 0) {
            return calculateOptimalBoostMaterialQuantities(
                matCoefficients.toSpliced(i, 1),
                matSizes.toSpliced(i, 1),
                spaceConstraint,
                round
            ).toSpliced(i, 0, 0);
        } else {
            if (round) {
                matCount = Math.round(matCount);
            }
            result.push(matCount);
        }
    }
    return result;
}

export function optimizeBoostMaterialQuantities(industryData: CorpIndustryData, spaceConstraint: number, round = true) {
    const {aiCoreFactor, hardwareFactor, realEstateFactor, robotFactor} = industryData;
    const boostMaterialCoefficients = [aiCoreFactor!, hardwareFactor!, realEstateFactor!, robotFactor!];
    const boostMaterialSizes = boostMaterials.map((mat) => CorpMaterialsData[mat].size);
    return calculateOptimalBoostMaterialQuantities(boostMaterialCoefficients, boostMaterialSizes, spaceConstraint, round);
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

export function calculateRequiredQuantityOfInputMaterial(
    ns: NS,
    division: Division,
    city: CityName,
    industrialData: CorpIndustryData,
    warehouse: Warehouse,
    inputMaterialCoefficient: number,
    isProduct: boolean,
    productSize?: number
): number {
    const officeData = ns.corporation.getOffice(division.name, city);
    let rawProduction = calculateDivisionRawProduction(
        isProduct,
        {
            operationsProduction: officeData.employeeProductionByJob.Operations,
            engineerProduction: officeData.employeeProductionByJob.Engineer,
            managementProduction: officeData.employeeProductionByJob.Management
        },
        division.productionMult,
        getCorporationUpgradeLevels(ns),
        getDivisionResearches(ns, division.name)
    );

    // Calculate net change in warehouse storage space when producing a material/product unit
    let netStorageSizeUnit = 0;
    if (isProduct) {
        netStorageSizeUnit += productSize!;
    } else {
        for (const outputMaterialName of industrialData.producedMaterials!) {
            netStorageSizeUnit += ns.corporation.getMaterialData(outputMaterialName).size;
        }
    }
    for (const [requiredMaterialName, requiredMaterialCoefficient] of getRecordEntries(industrialData.requiredMaterials)) {
        netStorageSizeUnit -= ns.corporation.getMaterialData(requiredMaterialName).size * requiredMaterialCoefficient;
    }
    // If there is not enough space in warehouse, we limit the raw production
    if (netStorageSizeUnit > 0) {
        const maxAmountOfUnit = Math.floor((warehouse.size - warehouse.sizeUsed) / netStorageSizeUnit);
        rawProduction = Math.min(rawProduction, maxAmountOfUnit);
    }

    rawProduction = Math.max(rawProduction, 0);
    return rawProduction * inputMaterialCoefficient * 10;
}

/**
 * Custom Smart Supply script
 *
 * @param ns
 * @param warehouseCongestionData
 */
export function buyOptimalAmountOfInputMaterials(ns: NS, warehouseCongestionData: Map<string, number>) {
    // Only set buy amount at state "START" (nextState = "PURCHASE")
    if (ns.corporation.getCorporation().nextState !== "PURCHASE") {
        return;
    }
    // Loop and set buy amount
    loopAllDivisionsAndCities(ns, (divisionName, city) => {
        const division = ns.corporation.getDivision(divisionName);
        const industrialData = ns.corporation.getIndustryData(division.type);
        const requiredMaterials = getRecordEntries(industrialData.requiredMaterials);

        // Detect warehouse congestion
        let isWarehouseCongested = false;
        const warehouseCongestionDataKey = `${divisionName}|${city}`;
        const items: (Material | Product)[] = [];
        if (industrialData.producedMaterials) {
            for (const materialName of industrialData.producedMaterials) {
                items.push(ns.corporation.getMaterial(divisionName, city, materialName));
            }
        }
        if (industrialData.makesProducts) {
            for (const productName of division.products) {
                items.push(ns.corporation.getProduct(divisionName, city, productName));
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
        // If that happens more than 5 times, we clear all input materials
        if (warehouseCongestionData.get(warehouseCongestionDataKey)! > 5) {
            isWarehouseCongested = true;
        }
        // Notify about this situation by showing alert popup.
        // We need to mitigate this situation. Discarding stored input material is the simplest solution. This is not
        // needed in our case because our logic of calculating required quantity takes into account of free space and
        // stored units. However, some simple versions of Smart Supply script cannot do that. This mitigation can be
        // useful in those cases. I only leave this code here for reference purposes.
        if (isWarehouseCongested) {
            ns.toast(`Warehouse may be congested. Division: ${divisionName}, city: ${city}.`, "warning");
            for (const [materialName] of requiredMaterials) {
                // Clear purchase
                ns.corporation.buyMaterial(divisionName, city, materialName, 0);
                // Discard stored input material
                ns.corporation.sellMaterial(divisionName, city, materialName, "MAX", "0");
            }
            warehouseCongestionData.set(warehouseCongestionDataKey, 0);
            return;
        } else {
            for (const [materialName] of requiredMaterials) {
                const material = ns.corporation.getMaterial(divisionName, city, materialName);
                if (material.desiredSellAmount !== 0) {
                    // Stop discarding input material
                    ns.corporation.sellMaterial(divisionName, city, materialName, "0", "0");
                }
            }
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
        // Find required quantity of input materials to produce material
        if (industrialData.makesMaterials) {
            for (const [, inputMaterialData] of Object.entries(inputMaterials)) {
                const requiredQuantity = calculateRequiredQuantityOfInputMaterial(
                    ns,
                    division,
                    city,
                    industrialData,
                    warehouse,
                    inputMaterialData.coefficient,
                    false
                );
                inputMaterialData.requiredQuantity += requiredQuantity;
            }
        }
        // Find required quantity of input materials to produce product
        if (industrialData.makesProducts) {
            for (const productName of division.products) {
                const product = ns.corporation.getProduct(divisionName, city, productName);
                for (const [, inputMaterialData] of Object.entries(inputMaterials)) {
                    const requiredQuantity = calculateRequiredQuantityOfInputMaterial(
                        ns,
                        division,
                        city,
                        industrialData,
                        warehouse,
                        inputMaterialData.coefficient,
                        true,
                        product.size
                    );
                    inputMaterialData.requiredQuantity += requiredQuantity;
                }
            }
        }

        // Find which input material creates the least number of output units.
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
    if (ns.corporation.getCorporation().nextState !== "PURCHASE") {
        ns.toast("Custom Smart Supply script runs too slowly", "warning");
    }
}

/**
 * @param ns
 * @param division
 * @param industryData
 * @param city
 * @param useWarehouseSize If false, function uses unused storage size after PRODUCTION state
 * @param ratio
 */
export async function findOptimalBoostMaterialAmount(
    ns: NS,
    division: Division,
    industryData: CorpIndustryData,
    city: CityName,
    useWarehouseSize: boolean,
    ratio: number): Promise<number[]> {
    const warehouseSize = ns.corporation.getWarehouse(division.name, city).size;
    if (useWarehouseSize) {
        return optimizeBoostMaterialQuantities(industryData, warehouseSize * ratio);
    }
    await waitUntilState(ns, CorpState.PRODUCTION);
    const availableSpace = ns.corporation.getWarehouse(division.name, city).size
        - ns.corporation.getWarehouse(division.name, city).sizeUsed;
    return optimizeBoostMaterialQuantities(industryData, availableSpace * ratio);
}

export async function waitUntilHavingEnoughResearchPoints(ns: NS, conditions: {
    divisionName: string;
    researchPoint: number;
}[]) {
    ns.print(`Waiting for research points: ${JSON.stringify(conditions)}`);
    while (true) {
        let finish = true;
        for (const condition of conditions) {
            if (ns.corporation.getDivision(condition.divisionName).researchPoints >= condition.researchPoint) {
                continue;
            }
            finish = false;
        }
        if (finish) {
            break;
        }
        await ns.corporation.nextUpdate();
    }
    ns.print(`Finished waiting for research points`);
}

/**
 * ["Tobacco-00000|1e12", "Tobacco-00001|1e12", "Tobacco-00002|1e12"] => "Tobacco-00003|1e12"
 * 1e12 is designInvest + marketingInvest
 *
 * @param ns
 * @param divisionName
 * @param productDevelopmentBudget
 */
export function generateNextProductName(ns: NS, divisionName: string, productDevelopmentBudget: number) {
    if (!Number.isFinite(productDevelopmentBudget) || productDevelopmentBudget < 1e3) {
        throw new Error(`Invalid budget: ${productDevelopmentBudget}`);
    }
    const products = ns.corporation.getDivision(divisionName).products;
    const productIdArray = products
        .map(productName => {
            const productNameParts = productName.split("-");
            if (productNameParts.length != 3) {
                return NaN;
            }
            return parseNumber(productNameParts[1]);
        })
        .filter(productIndex => !Number.isNaN(productIndex));
    if (productIdArray.length === 0) {
        return `${divisionName}-00000-${productDevelopmentBudget.toExponential(5)}`;
    }
    return `${divisionName}-${(Math.max(...productIdArray) + 1).toString().padStart(5, "0")}-${productDevelopmentBudget.toExponential(5)}`;
}

function getMaxNumberOfProducts(ns: NS, divisionName: string) {
    let maxNumberOfProducts = 3;
    if (ns.corporation.hasResearched(divisionName, ResearchName.UPGRADE_CAPACITY_1)) {
        maxNumberOfProducts = 4;
    }
    if (ns.corporation.hasResearched(divisionName, ResearchName.UPGRADE_CAPACITY_2)) {
        maxNumberOfProducts = 5;
    }
    return maxNumberOfProducts;
}

export function developNewProduct(ns: NS, divisionName: string, mainProductDevelopmentCity: CityName) {
    const productDevelopmentBudget = ns.corporation.getCorporation().funds * 0.01;
    const products = ns.corporation.getDivision(divisionName).products;
    if (products.length === getMaxNumberOfProducts(ns, divisionName)) {
        let worstProduct = null;
        let minProductRating = Number.MAX_VALUE;
        for (const product of products) {
            const productRating = ns.corporation.getProduct(divisionName, mainProductDevelopmentCity, product).rating;
            if (productRating >= minProductRating) {
                continue;
            }
            worstProduct = product;
            minProductRating = productRating;
        }
        if (!worstProduct) {
            throw new Error("Cannot find worst product to discontinue");
        }
        ns.corporation.discontinueProduct(divisionName, worstProduct);
    }
    ns.corporation.makeProduct(
        divisionName,
        mainProductDevelopmentCity,
        generateNextProductName(ns, divisionName, productDevelopmentBudget),
        productDevelopmentBudget / 2,
        productDevelopmentBudget / 2,
    );
}

export function getLatestProductName(ns: NS, divisionName: string) {
    const products = ns.corporation.getDivision(divisionName).products;
    if (products.length === 0) {
        return null;
    }
    return products[products.length - 1];
}

export async function getProductMarkup(
    divisionRP: number,
    industryScienceFactor: number,
    product: Product,
    employeeProductionByJob?: {
        operationsProduction: number;
        engineerProduction: number;
        businessProduction: number;
        managementProduction: number;
        researchAndDevelopmentProduction: number;
    }): Promise<number> {
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

export function validateProductMarkupMap(ns: NS) {
    for (const productKey of productMarkupMap.keys()) {
        const productKeyInfo = productKey.split("|");
        const divisionName = productKeyInfo[0];
        const productName = productKeyInfo[2];
        if (!ns.corporation.getDivision(divisionName).products.includes(productName)) {
            productMarkupMap.delete(productKey);
        }
    }
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
export async function findOptimalSellingPrice(
    ns: NS,
    division: Division,
    industryData: CorpIndustryData,
    city: CityName,
    item: Material | Product): Promise<string> {
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
    let productMarkup;
    let markupLimit;
    let itemMultiplier;
    let marketPrice;
    if (itemIsProduct) {
        const productKey = `${division.name}|${city}|${item.name}`;
        productMarkup = productMarkupMap.get(productKey);
        if (!productMarkup) {
            productMarkup = await getProductMarkup(
                division.researchPoints,
                industryData.scienceFactor!,
                item,
                {
                    operationsProduction: office.employeeProductionByJob.Operations,
                    engineerProduction: office.employeeProductionByJob.Engineer,
                    businessProduction: office.employeeProductionByJob.Business,
                    managementProduction: office.employeeProductionByJob.Management,
                    researchAndDevelopmentProduction: office.employeeProductionByJob["Research & Development"],
                }
            );
            productMarkupMap.set(productKey, productMarkup);
        }
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
    // if (item.name.startsWith("Tobacco-00000") || item.name.startsWith("Tobacco-00001")) {
    //     console.log(item.name);
    //     console.log(`businessFactor: ${businessFactor}`);
    //     console.log(`advertisingFactor: ${advertisingFactor}`);
    //     console.log(`marketFactor: ${marketFactor}`);
    //     console.log(`salesMultipliers: ${salesMultipliers}`);
    //     console.log(`productMarkup: ${productMarkup}`);
    //     console.log(`markupLimit: ${markupLimit}`);
    //     console.log(`expectedSalesVolume: ${expectedSalesVolume}`);
    //     console.log(`marketPrice: ${marketPrice}`);
    //     console.log(`optimalPrice: ${optimalPrice}`);
    //     console.log("++++++++++++++++++++++++++++++++");
    // }

    return optimalPrice.toString();
}

export async function setOptimalSellingPrice(ns: NS) {
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
                const optimalPrice = await findOptimalSellingPrice(ns, division, industryData, city, product);
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
                const optimalPrice = await findOptimalSellingPrice(ns, division, industryData, city, material);
                if (parseNumber(optimalPrice) > 0) {
                    ns.corporation.sellMaterial(divisionName, city, materialName, "MAX", optimalPrice);
                }
            }
        }
    });
}

export function calculateResearchPointGainRate(ns: NS, divisionName: string) {
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

export async function buyBoostMaterials(ns: NS, division: Division, ratio = 0.5) {
    const industryData = ns.corporation.getIndustryData(division.type);
    while (true) {
        await waitUntilState(ns, CorpState.PRODUCTION);
        let finish = true;
        const orders = [];
        for (const city of cities) {
            const warehouse = ns.corporation.getWarehouse(division.name, city);
            const availableSpace = warehouse.size - warehouse.sizeUsed;
            if (availableSpace < warehouse.size * 0.1) {
                continue;
            }
            const boostMaterialQuantities = optimizeBoostMaterialQuantities(industryData, availableSpace * ratio);
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
    }
}

export function calculateProductMarketPrice(
    ns: NS,
    division: Division,
    industryData: CorpIndustryData,
    city: CityName) {
    let productMarketPrice = 0;
    for (const [materialName, materialCoefficient] of getRecordEntries(industryData.requiredMaterials)) {
        const materialMarketPrice = ns.corporation.getMaterial(division.name, city, materialName).marketPrice;
        productMarketPrice += materialMarketPrice * materialCoefficient;
    }
    return productMarketPrice * productMarketPriceMultiplier;
}

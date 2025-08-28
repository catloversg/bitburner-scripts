import type { CityName, CorpUpgradeName, FactionName, HP, Multipliers, Skills } from "@ns";
import { cities } from "/corporationUtils";
import { EmployeePosition, MaterialName, ResearchName, UpgradeName } from "/corporationFormulas";
import { getRecordEntries, PartialRecord } from "/libs/Record";
import { CorpUpgradesData } from "/data/CorpUpgradesData";
import { CorpMaterialsData } from "./data/CorpMaterialsData";
import type { SaveData } from "/exploits";

declare global {
    // eslint-disable-next-line no-var
    var Player: {
        hp: HP;
        skills: Skills;
        exp: typeof Player.skills;
        mults: Multipliers;
        corporation: Corporation | null;
        factions: FactionName[];
        karma: number;
        money: number;
        sleeves: {
            memory: number;
            shock: number;
            storedCycles: number;
            sync: number;
        }[];
        sourceFiles: Map<number, number>;
        gainHackingExp: (exp: number) => void;
    };
    // eslint-disable-next-line no-var
    var corporationCycleHistory: CycleData[];
    // eslint-disable-next-line no-var
    var backupCorporationData: Corporation | null;
}

interface CycleData {
    cycle: number;
    divisions: Corporation["divisions"];
    funds: Corporation["funds"];
    revenue: Corporation["revenue"];
    expenses: Corporation["expenses"];
    fundingRound: Corporation["fundingRound"];
    upgrades: Corporation["upgrades"];
}

export interface Office {
    size: number;
    avgEnergy: number;
    avgMorale: number;
    avgIntelligence: number;
    avgCharisma: number;
    avgCreativity: number;
    avgEfficiency: number;
    numEmployees: number;
    employeeNextJobs: {
        Operations: number;
        Engineer: number;
        Business: number;
        Management: number;
        "Research & Development": number;
        Intern: number;
        Unassigned: number;
        total: number;
    };
}

export interface Material {
    name: MaterialName;
    stored: number;
    demand: number;
    competition: number;
    marketPrice: number;
    averagePrice: number;
}

export interface Warehouse {
    materials: Record<MaterialName, Material>;
    level: number;
    updateSize: (corporation: Corporation, division: Division) => void;
}

export interface Division {
    name: string;
    researchPoints: number;
    researched: Set<ResearchName>;
    requiredMaterials: PartialRecord<MaterialName, number>;
    producedMaterials: MaterialName[];
    offices: PartialRecord<CityName, Office>;
    warehouses: PartialRecord<CityName, Warehouse>;
    numAdVerts: number;
    awareness: number;
    popularity: number;
}

export interface Corporation {
    funds: number;
    revenue: number;
    expenses: number;
    fundingRound: number;
    storedCycles: number;
    divisions: Map<string, Division>;
    upgrades: Record<CorpUpgradeName, { level: number; value: number }>;
    valuation: number;
    cycleCount: number;
}

const indexDBObjectStore = "savestring";

export function getObjectStore(): Promise<IDBObjectStore> {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open("bitburnerSave", 1);
        request.onerror = () => {
            console.error("Error occurred when interacting with IndexDB. Result:", request.result);
            reject("Error occurred when interacting with IndexDB");
        };
        request.onsuccess = function (this: IDBRequest<IDBDatabase>) {
            const db = this.result;
            const objectStore = db.transaction([indexDBObjectStore], "readwrite").objectStore(indexDBObjectStore);
            resolve(objectStore);
        };
    });
}

export function getAllSaveDataKeys(): Promise<IDBValidKey[]> {
    return new Promise((resolve) => {
        getObjectStore().then((objectStore) => {
            const requestGetAllKeys = objectStore.getAllKeys();
            requestGetAllKeys.onsuccess = () => resolve(requestGetAllKeys.result);
        });
    });
}

export function getSaveData(key: string): Promise<SaveData> {
    return new Promise((resolve) => {
        getObjectStore().then((objectStore) => {
            const requestGet = objectStore.get(key);
            requestGet.onsuccess = () => resolve(requestGet.result);
        });
    });
}

export function insertSaveData(saveData: SaveData): Promise<void> {
    return new Promise((resolve) => {
        getObjectStore().then((objectStore) => {
            const requestPut = objectStore.put(saveData, new Date().toISOString());
            requestPut.onsuccess = () => resolve();
        });
    });
}

export function updateSaveData(key: string, saveData: SaveData): Promise<void> {
    return new Promise((resolve) => {
        getObjectStore().then((objectStore) => {
            const requestPut = objectStore.put(saveData, key);
            requestPut.onsuccess = () => resolve();
        });
    });
}

export function deleteSaveData(key: string): Promise<void> {
    return new Promise((resolve) => {
        getObjectStore().then((objectStore) => {
            const requestDelete = objectStore.delete(key);
            requestDelete.onsuccess = () => resolve();
        });
    });
}

export function isTestingToolsAvailable(): boolean {
    return globalThis.Player !== undefined;
}

export function setUnlimitedBonusTime(): void {
    if (!isTestingToolsAvailable()) {
        return;
    }
    Player.corporation!.storedCycles = 1e9;
}

export function removeBonusTime(): void {
    if (!isTestingToolsAvailable()) {
        return;
    }
    Player.corporation!.storedCycles = 0;
}

export function setFunds(funds: number): void {
    if (!isTestingToolsAvailable()) {
        return;
    }
    Player.corporation!.funds = funds;
}

export function setUpgradeLevel(upgradeName: CorpUpgradeName, level: number): void {
    if (!isTestingToolsAvailable()) {
        return;
    }
    const corpUpgrades = getRecordEntries(Player.corporation!.upgrades);
    for (const [corpUpgradeName, corpUpgradeInfo] of corpUpgrades) {
        if (corpUpgradeName === upgradeName) {
            const upgradeData = CorpUpgradesData[corpUpgradeName];
            corpUpgradeInfo.level = level;
            corpUpgradeInfo.value = 1 + upgradeData.benefit * level;
        }

        if (corpUpgradeName === UpgradeName.SMART_STORAGE) {
            for (const division of Player.corporation!.divisions.values()) {
                const warehouses = Object.values(division.warehouses);
                for (const warehouse of warehouses) {
                    warehouse.updateSize(Player.corporation!, division);
                }
            }
        }
    }
}

export function setResearchPoints(divisionName: string, researchPoints: number): void {
    if (!isTestingToolsAvailable()) {
        return;
    }
    Player.corporation!.divisions.get(divisionName)!.researchPoints = researchPoints;
}

export function setOfficeSetup(divisionName: string, employeeJobs: number[]): void {
    if (!isTestingToolsAvailable()) {
        return;
    }
    const size = employeeJobs.reduce((accumulator, current) => (accumulator += current), 0);
    const offices = Object.values(Player.corporation!.divisions.get(divisionName)!.offices);
    for (const office of offices) {
        office.size = size;
        office.numEmployees = size;
        office.employeeNextJobs[EmployeePosition.OPERATIONS] = employeeJobs[0];
        office.employeeNextJobs[EmployeePosition.ENGINEER] = employeeJobs[1];
        office.employeeNextJobs[EmployeePosition.BUSINESS] = employeeJobs[2];
        office.employeeNextJobs[EmployeePosition.MANAGEMENT] = employeeJobs[3];
        office.employeeNextJobs[EmployeePosition.RESEARCH_DEVELOPMENT] = employeeJobs[4];
        office.employeeNextJobs[EmployeePosition.INTERN] = 0;
        office.employeeNextJobs[EmployeePosition.UNASSIGNED] = 0;
    }
}

export function setWarehouseLevel(divisionName: string, level: number): void {
    if (!isTestingToolsAvailable()) {
        return;
    }
    const division = Player.corporation!.divisions.get(divisionName)!;
    const warehouses = Object.values(division.warehouses);
    for (const warehouse of warehouses) {
        warehouse.level = level;
        warehouse.updateSize(Player.corporation!, division);
    }
}

export function setBoostMaterials(divisionName: string, boostMaterials: number[]): void {
    if (!isTestingToolsAvailable()) {
        return;
    }
    const warehouses = Object.values(Player.corporation!.divisions.get(divisionName)!.warehouses);
    for (const warehouse of warehouses) {
        const materials = Object.values(warehouse.materials);
        for (const material of materials) {
            switch (material.name) {
                case MaterialName.AI_CORES:
                    material.stored = boostMaterials[0];
                    break;
                case MaterialName.HARDWARE:
                    material.stored = boostMaterials[1];
                    break;
                case MaterialName.REAL_ESTATE:
                    material.stored = boostMaterials[2];
                    break;
                case MaterialName.ROBOTS:
                    material.stored = boostMaterials[3];
                    break;
            }
        }
    }
}

export function clearMaterials(
    divisionName: string,
    options: {
        input: boolean;
        output: boolean;
    }
): void {
    if (!isTestingToolsAvailable()) {
        return;
    }
    const division = Player.corporation!.divisions.get(divisionName)!;
    const requiredMaterials = Object.keys(division.requiredMaterials);
    const producedMaterials = division.producedMaterials;
    const warehouses = Object.values(division.warehouses);
    for (const warehouse of warehouses) {
        const materials = Object.values(warehouse.materials);
        for (const material of materials) {
            if (
                (options.input && requiredMaterials.includes(material.name)) ||
                (options.output && producedMaterials.includes(material.name))
            ) {
                material.stored = 0;
            }
        }
    }
}

export function setEnergyAndMorale(divisionName: string, energy: number, morale: number): void {
    if (!isTestingToolsAvailable()) {
        return;
    }
    for (const city of cities) {
        Player.corporation!.divisions.get(divisionName)!.offices[city]!.avgEnergy = energy;
        Player.corporation!.divisions.get(divisionName)!.offices[city]!.avgMorale = morale;
    }
}

export function addResearch(divisionName: string, researchName: ResearchName): void {
    if (!isTestingToolsAvailable()) {
        return;
    }
    Player.corporation!.divisions.get(divisionName)!.researched.add(researchName);
}

export function resetRNGData() {
    if (!isTestingToolsAvailable()) {
        return;
    }
    for (const [, division] of Player.corporation!.divisions) {
        for (const [, office] of Object.entries(division.offices)) {
            office.avgIntelligence = 75;
            office.avgCharisma = 75;
            office.avgCreativity = 75;
            office.avgEfficiency = 75;
        }
        for (const [, warehouse] of Object.entries(division.warehouses)) {
            for (const [, material] of Object.entries(warehouse.materials)) {
                material.demand = CorpMaterialsData[material.name].demandBase;
                material.competition = CorpMaterialsData[material.name].competitionBase;
                material.marketPrice = CorpMaterialsData[material.name].baseCost;
                material.averagePrice = CorpMaterialsData[material.name].baseCost;
            }
        }
    }
}

export function setDefaultSettings() {
    if (!isTestingToolsAvailable()) {
        return;
    }
    globalThis.Settings.Locale = "en";
    globalThis.Settings.useEngineeringNotation = true;
    globalThis.Settings.disableSuffixes = true;
}

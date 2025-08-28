/**
 * Do NOT use NS functions in this module's functions
 */

import type { CityName, CorpEmployeePosition, CorpIndustryData, CorpMaterialName, CorpUpgradeName } from "@ns";
import { CorpResearchesData } from "/data/CorpResearchesData";
import { CorpUpgradesData } from "/data/CorpUpgradesData";
import { Ceres } from "/libs/Ceres";

export enum CorpState {
  START = "START",
  PURCHASE = "PURCHASE",
  PRODUCTION = "PRODUCTION",
  EXPORT = "EXPORT",
  SALE = "SALE",
}

export enum MaterialName {
  MINERALS = "Minerals",
  ORE = "Ore",
  WATER = "Water",
  FOOD = "Food",
  PLANTS = "Plants",
  METAL = "Metal",
  HARDWARE = "Hardware",
  CHEMICALS = "Chemicals",
  DRUGS = "Drugs",
  ROBOTS = "Robots",
  AI_CORES = "AI Cores",
  REAL_ESTATE = "Real Estate",
}

export enum UnlockName {
  EXPORT = "Export",
  SMART_SUPPLY = "Smart Supply",
  MARKET_RESEARCH_DEMAND = "Market Research - Demand",
  MARKET_DATA_COMPETITION = "Market Data - Competition",
  VE_CHAIN = "VeChain",
  SHADY_ACCOUNTING = "Shady Accounting",
  GOVERNMENT_PARTNERSHIP = "Government Partnership",
  WAREHOUSE_API = "Warehouse API",
  OFFICE_API = "Office API",
}

export const UpgradeName = {
  SMART_FACTORIES: "Smart Factories",
  SMART_STORAGE: "Smart Storage",
  WILSON_ANALYTICS: "Wilson Analytics",
  NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS: "Nuoptimal Nootropic Injector Implants",
  SPEECH_PROCESSOR_IMPLANTS: "Speech Processor Implants",
  NEURAL_ACCELERATORS: "Neural Accelerators",
  FOCUS_WIRES: "FocusWires",
  ABC_SALES_BOTS: "ABC SalesBots",
  PROJECT_INSIGHT: "Project Insight",
} as const;

export const EmployeePosition = {
  OPERATIONS: "Operations",
  ENGINEER: "Engineer",
  BUSINESS: "Business",
  MANAGEMENT: "Management",
  RESEARCH_DEVELOPMENT: "Research & Development",
  INTERN: "Intern",
  UNASSIGNED: "Unassigned",
} as const;

export enum ResearchName {
  HI_TECH_RND_LABORATORY = "Hi-Tech R&D Laboratory",
  AUTO_BREW = "AutoBrew",
  AUTO_PARTY = "AutoPartyManager",
  AUTO_DRUG = "Automatic Drug Administration",
  CPH4_INJECT = "CPH4 Injections",
  DRONES = "Drones",
  DRONES_ASSEMBLY = "Drones - Assembly",
  DRONES_TRANSPORT = "Drones - Transport",
  GO_JUICE = "Go-Juice",
  HR_BUDDY_RECRUITMENT = "HRBuddy-Recruitment",
  HR_BUDDY_TRAINING = "HRBuddy-Training",
  MARKET_TA_1 = "Market-TA.I",
  MARKET_TA_2 = "Market-TA.II",
  OVERCLOCK = "Overclock",
  SELF_CORRECTING_ASSEMBLERS = "Self-Correcting Assemblers",
  STIMU = "Sti.mu",
  UPGRADE_CAPACITY_1 = "uPgrade: Capacity.I",
  UPGRADE_CAPACITY_2 = "uPgrade: Capacity.II",
  UPGRADE_DASHBOARD = "uPgrade: Dashboard",
  UPGRADE_FULCRUM = "uPgrade: Fulcrum",
}

export const IndustryType = {
  WATER_UTILITIES: "Water Utilities",
  AGRICULTURE: "Agriculture",
  FISHING: "Fishing",
  MINING: "Mining",
  REFINERY: "Refinery",
  RESTAURANT: "Restaurant",
  TOBACCO: "Tobacco",
  CHEMICAL: "Chemical",
  PHARMACEUTICAL: "Pharmaceutical",
  COMPUTER_HARDWARE: "Computer Hardware",
  ROBOTICS: "Robotics",
  SOFTWARE: "Software",
  HEALTHCARE: "Healthcare",
  REAL_ESTATE: "Real Estate",
} as const;

export interface OfficeSetupJobs {
  Operations: number;
  Engineer: number;
  Business: number;
  Management: number;
  "Research & Development": number;
  Intern?: number;
}

export interface OfficeSetup {
  city: CityName;
  size: number;
  jobs: OfficeSetupJobs;
}

export interface MaterialOrder {
  city: CityName;
  materials: {
    name: MaterialName;
    count: number;
  }[];
}

export interface ExportRoute {
  material: CorpMaterialName;
  sourceCity: CityName;
  sourceDivision: string;
  destinationDivision: string;
  destinationCity: CityName;
  destinationAmount: string;
}

export type CorporationUpgradeLevels = Record<CorpUpgradeName, number>;
export type DivisionResearches = Record<ResearchName, boolean>;

export interface CeresSolverResult {
  success: boolean;
  message: string;
  x: number[];
  report: string;
}

const warehouseUpgradeBasePrice = 1e9;
const officeUpgradeBasePrice = 4e9;
const advertUpgradeBasePrice = 1e9;
export const productMarketPriceMultiplier = 5;

const numberSuffixList = ["", "k", "m", "b", "t", "q", "Q", "s", "S", "o", "n"];
// Exponents associated with each suffix
const numberExpList = numberSuffixList.map((_, i) => parseFloat(`1e${i * 3}`));

const numberFormat = new Intl.NumberFormat("en", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});
const basicFormatter = new Intl.NumberFormat("en");
const exponentialFormatter = new Intl.NumberFormat("en", {
  notation: "scientific",
});

/**
 * src\ui\formatNumber.ts
 *
 * @param value
 */
export function formatNumber(value: number): string {
  const fractionalDigits = 3;
  // NaN does not get formatted
  if (Number.isNaN(value)) {
    return "NaN";
  }
  const nAbs = Math.abs(value);

  // Special handling for Infinities
  if (nAbs === Infinity) {
    return value < 0 ? "-∞" : "∞";
  }

  // Early return for non-suffix
  if (nAbs < 1000) {
    return basicFormatter.format(value);
  }

  // Exponential form
  if (nAbs >= 1e15) {
    return exponentialFormatter.format(value).toLocaleLowerCase();
  }

  // Calculate suffix index. 1000 = 10^3
  let suffixIndex = Math.floor(Math.log10(nAbs) / 3);

  value /= numberExpList[suffixIndex];
  // Detect if number rounds to 1000.000 (based on number of digits given)
  if (Math.abs(value).toFixed(fractionalDigits).length === fractionalDigits + 5 && numberSuffixList[suffixIndex + 1]) {
    suffixIndex += 1;
    value = value < 0 ? -1 : 1;
  }
  return numberFormat.format(value) + numberSuffixList[suffixIndex];
}

/**
 * src\Corporation\Division.ts: calculateProductionFactors()
 * This function assumes that 6 cities have the same number of boost materials' units in their warehouses.
 *
 * @param industryData
 * @param boostMaterials
 */
export function getDivisionProductionMultiplier(industryData: CorpIndustryData, boostMaterials: number[]) {
  const cityMultiplier =
    Math.pow(0.002 * boostMaterials[0] + 1, industryData.aiCoreFactor!) *
    Math.pow(0.002 * boostMaterials[1] + 1, industryData.hardwareFactor!) *
    Math.pow(0.002 * boostMaterials[2] + 1, industryData.realEstateFactor!) *
    Math.pow(0.002 * boostMaterials[3] + 1, industryData.robotFactor!);
  return Math.max(Math.pow(cityMultiplier, 0.73), 1) * 6;
}

function getGenericUpgradeCost(basePrice: number, priceMultiplier: number, fromLevel: number, toLevel: number): number {
  return (
    basePrice * ((Math.pow(priceMultiplier, toLevel) - Math.pow(priceMultiplier, fromLevel)) / (priceMultiplier - 1))
  );
}

function getGenericMaxAffordableUpgradeLevel(
  basePrice: number,
  priceMultiplier: number,
  fromLevel: number,
  maxCost: number,
  roundingWithFloor = true,
): number {
  const maxAffordableUpgradeLevel =
    Math.log((maxCost * (priceMultiplier - 1)) / basePrice + Math.pow(priceMultiplier, fromLevel)) /
    Math.log(priceMultiplier);
  if (roundingWithFloor) {
    return Math.floor(maxAffordableUpgradeLevel);
  }
  return maxAffordableUpgradeLevel;
}

export function getUpgradeCost(upgradeName: CorpUpgradeName, fromLevel: number, toLevel: number): number {
  const upgradeData = CorpUpgradesData[upgradeName];
  if (!upgradeData) {
    throw new Error(`Cannot find data of upgrade: ${upgradeName}`);
  }
  return getGenericUpgradeCost(upgradeData.basePrice, upgradeData.priceMult, fromLevel, toLevel);
}

export function getMaxAffordableUpgradeLevel(upgradeName: CorpUpgradeName, fromLevel: number, maxCost: number): number {
  const upgradeData = CorpUpgradesData[upgradeName];
  if (!upgradeData) {
    throw new Error(`Cannot find data of upgrade: ${upgradeName}`);
  }
  return getGenericMaxAffordableUpgradeLevel(upgradeData.basePrice, upgradeData.priceMult, fromLevel, maxCost);
}

/**
 * src\Corporation\Corporation.ts: purchaseUpgrade()
 *
 * @param upgradeName
 * @param upgradeLevel
 */
export function getUpgradeBenefit(upgradeName: CorpUpgradeName, upgradeLevel: number): number {
  let value = 1;
  const benefit = CorpUpgradesData[upgradeName].benefit;
  if (!benefit) {
    throw new Error(`Cannot find data of upgrade: ${upgradeName}`);
  }
  value += benefit * upgradeLevel;
  return value;
}

export function getUpgradeWarehouseCost(fromLevel: number, toLevel: number): number {
  if (fromLevel < 1) {
    throw new Error("Invalid parameter");
  }
  return warehouseUpgradeBasePrice * ((Math.pow(1.07, toLevel + 1) - Math.pow(1.07, fromLevel + 1)) / 0.07);
}

export function getMaxAffordableWarehouseLevel(fromLevel: number, maxCost: number): number {
  if (fromLevel < 1) {
    throw new Error("Invalid parameter");
  }
  return Math.floor(
    Math.log((maxCost * 0.07) / warehouseUpgradeBasePrice + Math.pow(1.07, fromLevel + 1)) / Math.log(1.07) - 1,
  );
}

/**
 * src\Corporation\Warehouse.ts: updateSize()
 *
 * @param smartStorageLevel
 * @param warehouseLevel
 * @param divisionResearches
 */
export function getWarehouseSize(
  smartStorageLevel: number,
  warehouseLevel: number,
  divisionResearches: DivisionResearches,
): number {
  return (
    warehouseLevel *
    100 *
    (1 + CorpUpgradesData[UpgradeName.SMART_STORAGE].benefit * smartStorageLevel) *
    getResearchStorageMultiplier(divisionResearches)
  );
}

export function getOfficeUpgradeCost(fromSize: number, toSize: number): number {
  return getGenericUpgradeCost(officeUpgradeBasePrice, 1.09, fromSize / 3, toSize / 3);
}

export function getMaxAffordableOfficeSize(fromSize: number, maxCost: number): number {
  return Math.floor(
    3 * getGenericMaxAffordableUpgradeLevel(officeUpgradeBasePrice, 1.09, fromSize / 3, maxCost, false),
  );
}

export function getAdVertCost(fromLevel: number, toLevel: number): number {
  return getGenericUpgradeCost(advertUpgradeBasePrice, 1.06, fromLevel, toLevel);
}

export function getMaxAffordableAdVertLevel(fromLevel: number, maxCost: number): number {
  return getGenericMaxAffordableUpgradeLevel(advertUpgradeBasePrice, 1.06, fromLevel, maxCost);
}

export function getResearchMultiplier(
  divisionResearches: DivisionResearches,
  researchDataKey: keyof (typeof CorpResearchesData)[string],
): number {
  let multiplier = 1;
  for (const [researchName, researchData] of Object.entries(CorpResearchesData)) {
    if (!divisionResearches[<ResearchName>researchName]) {
      continue;
    }
    const researchDataValue = researchData[researchDataKey];
    if (!Number.isFinite(researchDataValue)) {
      throw new Error(`Invalid researchDataKey: ${researchDataKey}`);
    }
    multiplier *= researchDataValue as number;
  }
  return multiplier;
}

export function getResearchSalesMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, "salesMult");
}

export function getResearchAdvertisingMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, "advertisingMult");
}

export function getResearchRPMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, "sciResearchMult");
}

export function getResearchStorageMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, "storageMult");
}

export function getResearchEmployeeCreativityMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, "employeeCreMult");
}

export function getResearchEmployeeCharismaMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, "employeeChaMult");
}

export function getResearchEmployeeIntelligenceMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, "employeeIntMult");
}

export function getResearchEmployeeEfficiencyMultiplier(divisionResearches: DivisionResearches): number {
  return getResearchMultiplier(divisionResearches, "productionMult");
}

/**
 * src\utils\calculateEffectWithFactors.ts
 *
 * This is a component that implements a mathematical formula used commonly throughout the
 * game. This formula is (typically) used to calculate the effect that various statistics
 * have on a game mechanic. It looks something like:
 *
 *  (stat ^ exponential factor) + (stat / linear factor)
 *
 * where the exponential factor is a number between 0 and 1 and the linear factor
 * is typically a relatively larger number.
 *
 * This formula ensures that the effects of the statistic that is being processed
 * has diminishing returns, but never loses its effectiveness as you continue
 * to raise it.
 */
function getEffectWithFactors(n: number, expFac: number, linearFac: number): number {
  if (expFac <= 0 || expFac >= 1) {
    console.warn(`Exponential factor is ${expFac}. This is not an intended value for it`);
  }
  if (linearFac < 1) {
    console.warn(`Linear factor is ${linearFac}. This is not an intended value for it`);
  }
  return Math.pow(n, expFac) + n / linearFac;
}

/**
 * src\Corporation\Division.ts
 *
 * Return a factor based on the office's Business employees that affects sales
 *
 * @param businessProduction
 */
export function getBusinessFactor(businessProduction: number): number {
  return getEffectWithFactors(1 + businessProduction, 0.26, 10e3);
}

/**
 * src\Corporation\Division.ts
 *
 * Return a set of factors based on the division's awareness, popularity, and Industry's advertisingFactor. The first
 * factor affects sales. The result is:
 * [Sales factor, awareness factor, popularity factor, popularity/awareness ratio factor]
 *
 * @param awareness
 * @param popularity
 * @param industryAdvertisingFactor
 */
export function getAdvertisingFactors(
  awareness: number,
  popularity: number,
  industryAdvertisingFactor: number,
): [totalFactor: number, awarenessFactor: number, popularityFactor: number, ratioFactor: number] {
  const awarenessFactor = Math.pow(awareness + 1, industryAdvertisingFactor);
  const popularityFactor = Math.pow(popularity + 1, industryAdvertisingFactor);
  const ratioFactor = awareness === 0 ? 0.01 : Math.max((popularity + 0.001) / awareness, 0.01);
  const salesFactor = Math.pow(awarenessFactor * popularityFactor * ratioFactor, 0.85);
  return [salesFactor, awarenessFactor, popularityFactor, ratioFactor];
}

/**
 * src\Corporation\Division.ts
 *
 * Return a factor based on demand and competition that affects sales
 *
 * @param demand
 * @param competition
 */
export function getMarketFactor(demand: number, competition: number): number {
  return Math.max(0.1, (demand * (100 - competition)) / 100);
}

export function getDivisionRawProduction(
  isProduct: boolean,
  employeesProduction: {
    operationsProduction: number;
    engineerProduction: number;
    managementProduction: number;
  },
  divisionProductionMultiplier: number,
  corporationUpgradeLevels: CorporationUpgradeLevels,
  divisionResearches: DivisionResearches,
): number {
  const operationEmployeesProduction = employeesProduction.operationsProduction;
  const engineerEmployeesProduction = employeesProduction.engineerProduction;
  const managementEmployeesProduction = employeesProduction.managementProduction;
  const totalEmployeesProduction =
    operationEmployeesProduction + engineerEmployeesProduction + managementEmployeesProduction;
  if (totalEmployeesProduction <= 0) {
    return 0;
  }
  const managementFactor = 1 + managementEmployeesProduction / (1.2 * totalEmployeesProduction);
  const employeesProductionMultiplier =
    (Math.pow(operationEmployeesProduction, 0.4) + Math.pow(engineerEmployeesProduction, 0.3)) * managementFactor;
  const balancingMultiplier = 0.05;
  let officeMultiplier;
  if (isProduct) {
    officeMultiplier = 0.5 * balancingMultiplier * employeesProductionMultiplier;
  } else {
    officeMultiplier = balancingMultiplier * employeesProductionMultiplier;
  }

  // Multiplier from Smart Factories
  const upgradeMultiplier =
    1 + corporationUpgradeLevels[UpgradeName.SMART_FACTORIES] * CorpUpgradesData[UpgradeName.SMART_FACTORIES].benefit;
  // Multiplier from researches
  let researchMultiplier = 1;
  researchMultiplier *=
    (divisionResearches[ResearchName.DRONES_ASSEMBLY]
      ? CorpResearchesData[ResearchName.DRONES_ASSEMBLY].productionMult
      : 1) *
    (divisionResearches[ResearchName.SELF_CORRECTING_ASSEMBLERS]
      ? CorpResearchesData[ResearchName.SELF_CORRECTING_ASSEMBLERS].productionMult
      : 1);
  if (isProduct) {
    researchMultiplier *= divisionResearches[ResearchName.UPGRADE_FULCRUM]
      ? CorpResearchesData[ResearchName.UPGRADE_FULCRUM].productProductionMult
      : 1;
  }

  return officeMultiplier * divisionProductionMultiplier * upgradeMultiplier * researchMultiplier;
}

function getUpgradeAndResearchMultiplierForEmployeeStats(
  corporationUpgradeLevels: CorporationUpgradeLevels,
  divisionResearches: DivisionResearches,
): {
  researchCharismaMultiplier: number;
  upgradeIntelligenceMultiplier: number;
  upgradeCharismaMultiplier: number;
  researchCreativityMultiplier: number;
  researchEfficiencyMultiplier: number;
  upgradeCreativityMultiplier: number;
  researchIntelligenceMultiplier: number;
  upgradeEfficiencyMultiplier: number;
} {
  return {
    upgradeCreativityMultiplier: getUpgradeBenefit(
      UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS,
      corporationUpgradeLevels[UpgradeName.NUOPTIMAL_NOOTROPIC_INJECTOR_IMPLANTS],
    ),
    upgradeCharismaMultiplier: getUpgradeBenefit(
      UpgradeName.SPEECH_PROCESSOR_IMPLANTS,
      corporationUpgradeLevels[UpgradeName.SPEECH_PROCESSOR_IMPLANTS],
    ),
    upgradeIntelligenceMultiplier: getUpgradeBenefit(
      UpgradeName.NEURAL_ACCELERATORS,
      corporationUpgradeLevels[UpgradeName.NEURAL_ACCELERATORS],
    ),
    upgradeEfficiencyMultiplier: getUpgradeBenefit(
      UpgradeName.FOCUS_WIRES,
      corporationUpgradeLevels[UpgradeName.FOCUS_WIRES],
    ),
    researchCreativityMultiplier: getResearchEmployeeCreativityMultiplier(divisionResearches),
    researchCharismaMultiplier: getResearchEmployeeCharismaMultiplier(divisionResearches),
    researchIntelligenceMultiplier: getResearchEmployeeIntelligenceMultiplier(divisionResearches),
    researchEfficiencyMultiplier: getResearchEmployeeEfficiencyMultiplier(divisionResearches),
  };
}

export function getEmployeeProductionByJobs(
  office: {
    avgIntelligence: number;
    avgCharisma: number;
    avgCreativity: number;
    avgEfficiency: number;
    avgMorale: number;
    avgEnergy: number;
    totalExperience: number;
    employeeJobs: {
      operations: number;
      engineer: number;
      business: number;
      management: number;
      researchAndDevelopment: number;
      intern: number;
      unassigned: number;
    };
  },
  corporationUpgradeLevels: CorporationUpgradeLevels,
  divisionResearches: DivisionResearches,
): {
  managementProduction: number;
  operationsProduction: number;
  researchAndDevelopmentProduction: number;
  engineerProduction: number;
  businessProduction: number;
} {
  const upgradeAndResearchMultiplier = getUpgradeAndResearchMultiplierForEmployeeStats(
    corporationUpgradeLevels,
    divisionResearches,
  );

  const effectiveIntelligence =
    office.avgIntelligence *
    upgradeAndResearchMultiplier.upgradeIntelligenceMultiplier *
    upgradeAndResearchMultiplier.researchIntelligenceMultiplier;
  const effectiveCharisma =
    office.avgCharisma *
    upgradeAndResearchMultiplier.upgradeCharismaMultiplier *
    upgradeAndResearchMultiplier.researchCharismaMultiplier;
  const effectiveCreativity =
    office.avgCreativity *
    upgradeAndResearchMultiplier.upgradeCreativityMultiplier *
    upgradeAndResearchMultiplier.researchCreativityMultiplier;
  const effectiveEfficiency =
    office.avgEfficiency *
    upgradeAndResearchMultiplier.upgradeEfficiencyMultiplier *
    upgradeAndResearchMultiplier.researchEfficiencyMultiplier;

  const productionBase = office.avgMorale * office.avgEnergy * 1e-4;

  const totalNumberOfEmployees =
    office.employeeJobs.operations +
    office.employeeJobs.engineer +
    office.employeeJobs.business +
    office.employeeJobs.management +
    office.employeeJobs.researchAndDevelopment +
    office.employeeJobs.intern +
    office.employeeJobs.unassigned;
  const exp = office.totalExperience / totalNumberOfEmployees;

  const operationsProduction =
    office.employeeJobs.operations *
    productionBase *
    (0.6 * effectiveIntelligence + 0.1 * effectiveCharisma + exp + 0.5 * effectiveCreativity + effectiveEfficiency);
  const engineerProduction =
    office.employeeJobs.engineer *
    productionBase *
    (effectiveIntelligence + 0.1 * effectiveCharisma + 1.5 * exp + effectiveEfficiency);
  const businessProduction =
    office.employeeJobs.business * productionBase * (0.4 * effectiveIntelligence + effectiveCharisma + 0.5 * exp);
  const managementProduction =
    office.employeeJobs.management *
    productionBase *
    (2 * effectiveCharisma + exp + 0.2 * effectiveCreativity + 0.7 * effectiveEfficiency);
  const researchAndDevelopmentProduction =
    office.employeeJobs.researchAndDevelopment *
    productionBase *
    (1.5 * effectiveIntelligence + 0.8 * exp + effectiveCreativity + 0.5 * effectiveEfficiency);

  return {
    operationsProduction: operationsProduction,
    engineerProduction: engineerProduction,
    businessProduction: businessProduction,
    managementProduction: managementProduction,
    researchAndDevelopmentProduction: researchAndDevelopmentProduction,
  };
}

export async function calculateEmployeeStats(
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
): Promise<{
  avgCreativity: number;
  avgCharisma: number;
  avgIntelligence: number;
  avgEfficiency: number;
}> {
  // In 5 jobs [OPERATIONS, ENGINEER, BUSINESS, MANAGEMENT, RESEARCH_DEVELOPMENT], we need at least 4 jobs having 1
  // employee at the minimum
  let numberOfJobsHavingEmployees = 0;
  for (const [jobName, numberOfEmployees] of Object.entries(office.employeeJobs)) {
    if (jobName === "Intern" || jobName === "Unassigned" || numberOfEmployees === 0) {
      continue;
    }
    ++numberOfJobsHavingEmployees;
  }
  if (numberOfJobsHavingEmployees <= 3) {
    throw new Error("We need at least 4 jobs having 1 employee at the minimum");
  }

  const upgradeAndResearchMultiplier = getUpgradeAndResearchMultiplierForEmployeeStats(
    corporationUpgradeLevels,
    divisionResearches,
  );

  const productionBase = office.avgMorale * office.avgEnergy * 1e-4;
  const exp = office.totalExperience / office.numEmployees;
  const f1 = function ([effectiveCreativity, effectiveCharisma, effectiveIntelligence, effectiveEfficiency]: number[]) {
    return (
      office.employeeJobs[EmployeePosition.OPERATIONS] *
        productionBase *
        (0.6 * effectiveIntelligence +
          0.1 * effectiveCharisma +
          exp +
          0.5 * effectiveCreativity +
          effectiveEfficiency) -
      office.employeeProductionByJob[EmployeePosition.OPERATIONS]
    );
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const f2 = function ([effectiveCreativity, effectiveCharisma, effectiveIntelligence, effectiveEfficiency]: number[]) {
    return (
      office.employeeJobs[EmployeePosition.ENGINEER] *
        productionBase *
        (effectiveIntelligence + 0.1 * effectiveCharisma + 1.5 * exp + effectiveEfficiency) -
      office.employeeProductionByJob[EmployeePosition.ENGINEER]
    );
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const f3 = function ([effectiveCreativity, effectiveCharisma, effectiveIntelligence, effectiveEfficiency]: number[]) {
    return (
      office.employeeJobs[EmployeePosition.BUSINESS] *
        productionBase *
        (0.4 * effectiveIntelligence + effectiveCharisma + 0.5 * exp) -
      office.employeeProductionByJob[EmployeePosition.BUSINESS]
    );
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const f4 = function ([effectiveCreativity, effectiveCharisma, effectiveIntelligence, effectiveEfficiency]: number[]) {
    return (
      office.employeeJobs[EmployeePosition.MANAGEMENT] *
        productionBase *
        (2 * effectiveCharisma + exp + 0.2 * effectiveCreativity + 0.7 * effectiveEfficiency) -
      office.employeeProductionByJob[EmployeePosition.MANAGEMENT]
    );
  };
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const f5 = function ([effectiveCreativity, effectiveCharisma, effectiveIntelligence, effectiveEfficiency]: number[]) {
    return (
      office.employeeJobs[EmployeePosition.RESEARCH_DEVELOPMENT] *
        productionBase *
        (1.5 * effectiveIntelligence + 0.8 * exp + effectiveCreativity + 0.5 * effectiveEfficiency) -
      office.employeeProductionByJob[EmployeePosition.RESEARCH_DEVELOPMENT]
    );
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
    const guess = [75, 75, 75, 75];
    solverResult = solver.solve(guess)!;
    solver.remove();
  });
  if (!solverResult.success) {
    console.error(solverResult);
    throw new Error(`ERROR: Cannot find hidden stats of employee. Office: ${JSON.stringify(office)}`);
  }
  return {
    avgCreativity:
      solverResult.x[0] /
      (upgradeAndResearchMultiplier.upgradeCreativityMultiplier *
        upgradeAndResearchMultiplier.researchCreativityMultiplier),
    avgCharisma:
      solverResult.x[1] /
      (upgradeAndResearchMultiplier.upgradeCharismaMultiplier *
        upgradeAndResearchMultiplier.researchCharismaMultiplier),
    avgIntelligence:
      solverResult.x[2] /
      (upgradeAndResearchMultiplier.upgradeIntelligenceMultiplier *
        upgradeAndResearchMultiplier.researchIntelligenceMultiplier),
    avgEfficiency:
      solverResult.x[3] /
      (upgradeAndResearchMultiplier.upgradeEfficiencyMultiplier *
        upgradeAndResearchMultiplier.researchEfficiencyMultiplier),
  };
}

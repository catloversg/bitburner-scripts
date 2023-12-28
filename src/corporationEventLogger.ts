import {NS} from "@ns";
import {CityName, CorporationUpgradeLevels, DivisionResearches, OfficeSetup} from "/corporationFormulas";
import {cities, dummyDivisionNamePrefix, getCorporationUpgradeLevels, getDivisionResearches} from "/corporationUtils";

interface DivisionData {
    name: string;
    awareness: number;
    popularity: number;
    advert: number;
    researchPoints: number;
    researches: DivisionResearches;
    warehouses: {
        city: CityName;
        level: number;
        size: number;
    }[];
    offices: OfficeSetup[];
}

interface CorporationEvent {
    cycle: number;
}

interface DefaultCorporationEvent extends CorporationEvent {
    divisions: DivisionData[];
    funds: number;
    revenue: number;
    expenses: number;
    fundingRound: number;
    fundingOffer: number;
    upgrades: CorporationUpgradeLevels;
}

interface NewProductEvent extends CorporationEvent {
    cycle: number;
    productName: string;
    investment: number;
}

interface OfferAcceptanceEvent extends CorporationEvent {
    cycle: number;
    round: number;
    offer: number;
}

class CorporationEventLogger {
    #cycle: number;
    readonly #events: CorporationEvent[];
    #eventsSnapshot: CorporationEvent[];

    constructor() {
        this.#cycle = 0;
        this.#events = [];
        this.#eventsSnapshot = [];
    }

    public getCycle() {
        return this.#cycle;
    }

    public setCycle(cycle: number) {
        this.#cycle = cycle;
    }

    private limitNumberOfEvents() {
        if (this.#events.length > 2000) {
            this.#events.shift();
        }
    }

    private createDefaultEvent(ns: NS): DefaultCorporationEvent {
        const corporation = ns.corporation.getCorporation();
        const corporationEvent: DefaultCorporationEvent = {
            cycle: this.#cycle,
            divisions: [],
            funds: corporation.funds,
            revenue: corporation.revenue,
            expenses: corporation.expenses,
            fundingRound: ns.corporation.getInvestmentOffer().round,
            fundingOffer: ns.corporation.getInvestmentOffer().funds,
            upgrades: getCorporationUpgradeLevels(ns)
        };
        const divisions = corporation.divisions;
        for (const divisionName of divisions) {
            if (divisionName.startsWith(dummyDivisionNamePrefix)) {
                continue;
            }
            const division = ns.corporation.getDivision(divisionName);
            const divisionData: DivisionData = {
                name: divisionName,
                awareness: division.awareness,
                popularity: division.popularity,
                advert: division.awareness,
                researchPoints: division.researchPoints,
                researches: getDivisionResearches(ns, divisionName),
                warehouses: [],
                offices: [],
            };
            for (const city of cities) {
                const warehouse = ns.corporation.getWarehouse(divisionName, city);
                const office = ns.corporation.getOffice(divisionName, city);
                divisionData.warehouses.push({
                    city: city,
                    level: warehouse.level,
                    size: warehouse.size,
                });
                divisionData.offices.push({
                    city: city,
                    size: office.size,
                    jobs: {
                        Operations: office.employeeJobs.Operations,
                        Engineer: office.employeeJobs.Engineer,
                        Business: office.employeeJobs.Business,
                        Management: office.employeeJobs.Management,
                        "Research & Development": office.employeeJobs["Research & Development"],
                    }
                });
            }
            corporationEvent.divisions.push(divisionData);
        }
        return corporationEvent;
    }

    public generateDefaultEvent(ns: NS) {
        this.#events.push(this.createDefaultEvent(ns));
        this.limitNumberOfEvents();
    }

    public generateNewProductEvent(productName: string, investment: number) {
        const newProductEvent: NewProductEvent = {
            cycle: this.#cycle,
            productName: productName,
            investment: investment
        };
        this.#events.push(newProductEvent);
        this.limitNumberOfEvents();
    }

    public generateOfferAcceptanceEvent(ns: NS) {
        const offerAcceptanceEvent: OfferAcceptanceEvent = {
            cycle: this.#cycle,
            round: ns.corporation.getInvestmentOffer().round,
            offer: ns.corporation.getInvestmentOffer().funds
        };
        this.#events.push(offerAcceptanceEvent);
        this.limitNumberOfEvents();
    }

    public clearEventData() {
        this.#events.length = 0;
    }

    public exportEventData() {
        return JSON.stringify(this.#events);
    }

    public saveEventSnapshotData() {
        this.#eventsSnapshot = structuredClone(this.#events);
    }

    public exportEventSnapshotData() {
        return JSON.stringify(this.#eventsSnapshot);
    }
}

export const corporationEventLogger = new CorporationEventLogger();

export function downloadCorporationEvents() {
    const file = new Blob([corporationEventLogger.exportEventData()], {type: "text/plain"});
    const element = document.createElement("a");
    const url = URL.createObjectURL(file);
    element.href = url;
    element.download = Date.now().toString();
    document.body.appendChild(element);
    element.click();
    setTimeout(function () {
        document.body.removeChild(element);
        window.URL.revokeObjectURL(url);
    }, 0);
}

function isDefaultCorporationEvent(event: CorporationEvent): event is DefaultCorporationEvent {
    return "divisions" in event;
}

function isNewProductEvent(event: CorporationEvent): event is NewProductEvent {
    return "productName" in event;
}

function isOfferAcceptanceEvent(event: CorporationEvent): event is OfferAcceptanceEvent {
    return "round" in event;
}

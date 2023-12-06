import {NS} from "@ns";
import {NetscriptExtension} from "/libs/NetscriptExtension";
import {DAEMON_SCRIPT_NAME} from "/libs/constants";
import {parseNumber} from "/libs/utils";
import {CorpEmployeePosition, MaterialName, UpgradeName} from "/corporationFormulas";
import {getRecordValues} from "/libs/Record";
import {CorpUpgradesData} from "/data/CorpUpgradesData";

declare global {
    var Player: any;
    var saveObject: any;
}

let nsx: NetscriptExtension;
let doc: Document;

const enableTestingTools = true;
let runCorpMaintain = false;
let runDelScripts = false;
let reload = false;
let runCorpRound = false;
let runCorpTest = false;
let importSave = false;
let saveString = "";

const indexDBObjectStore = "savestring";

function rerun(ns: NS) {
    ns.spawn(ns.getScriptName(), {spawnDelay: 100});
}

async function getObjectStore(): Promise<IDBObjectStore> {
    return new Promise((resolve, reject) => {
        const request = window.indexedDB.open("bitburnerSave", 1);
        request.onerror = (event) => {
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

async function getAllSaveDataKeys(): Promise<any> {
    return new Promise((resolve, reject) => {
        getObjectStore().then(objectStore => {
            let requestAllKeys = objectStore.getAllKeys();
            requestAllKeys.onsuccess = () => resolve(requestAllKeys.result);
        });
    });
}

async function getSaveData(key: string): Promise<any> {
    return new Promise((resolve, reject) => {
        getObjectStore().then(objectStore => {
            let requestget = objectStore.get(key);
            requestget.onsuccess = () => resolve(requestget.result);
        });
    });
}

async function insertSaveData(saveData: string): Promise<void> {
    return new Promise((resolve, reject) => {
        getObjectStore().then(objectStore => {
            const request = objectStore.put(saveData, new Date().toISOString());
            request.onsuccess = () => resolve();
        });
    });
}

async function updateSaveData(key: string, saveData: string): Promise<void> {
    return new Promise((resolve, reject) => {
        getObjectStore().then(objectStore => {
            const request = objectStore.put(saveData, key);
            request.onsuccess = () => resolve();
        });
    });
}

async function deleteSaveData(key: string) {
    return new Promise((resolve, reject) => {
        getObjectStore().then(objectStore => {
            let requestDelete = objectStore.delete(key);
            requestDelete.onsuccess = () => resolve(requestDelete.result);
        });
    });
}

function createTestingTool() {
    // Testing tools
    if (enableTestingTools) {
        let testingToolsDiv = doc.querySelector("#testing-tools");
        // Remove old tools
        if (testingToolsDiv !== null) {
            testingToolsDiv.remove();
        }
        // Create tools
        const root: Element = doc.querySelector("#root")!;
        const testingToolsTemplate = doc.createElement("template");
        testingToolsTemplate.innerHTML = `
<div id="testing-tools">
    <div>
        <button id="btn-corp-maintain">CorpMaintain</button>
        <button id="btn-unlimited-bonus-time">UnlimitedBonusTime</button>
        <button id="btn-remove-bonus-time">RemoveBonusTime</button>
        <button id="btn-corp-round">CorpRound</button>
        <button id="btn-corp-test">CorpTest</button>
        <button id="btn-import-save">ImportSave</button>
        <button id="btn-delete-all-scripts">DelScripts</button>
        <button id="btn-reload">Reload</button>
        <button id="btn-exit">Exit</button>
    </div>
    <div>
        <label for="testing-tools-input">Input:</label>
        <input id="testing-tools-input" type="text"/>
        <input id="testing-tools-file-input" type="file"/>
        <button id="btn-funds">Funds</button>
        <button id="btn-smart-factories-level">SmartFactories</button>
        <button id="btn-smart-storage-level">SmartStorage</button>
        <select id="select-save-data">
            <option value="current">Current</option>
        </select>
        <button id="btn-import-save-data">Import</button>
        <button id="btn-export-save-data">Export</button>
        <button id="btn-delete-save-data">Delete</button>
    </div>
    <div>
        <label for="testing-tools-divisions">Division:</label>
        <select name="divisions" id="testing-tools-divisions">
            <option value="Agriculture">Agriculture</option>
            <option value="Chemical">Chemical</option>
            <option value="Tobacco">Tobacco</option>
        </select>
        <button id="btn-rp">RP</button>
        <button id="btn-office">Office</button>
        <button id="btn-warehouse-level">WarehouseLevel</button>
        <button id="btn-boost-materials">BoostMats</button>
        <button id="btn-clear-boost-materials">ClearBoostMats</button>
        <button id="btn-clear-input-materials">ClearInputMats</button>
        <button id="btn-clear-storage">ClearStorage</button>
    </div>
    <div>
    </div>
    <style>
        #testing-tools {
            transform: translate(850px, 5px);z-index: 9999;display: flex;flex-flow: wrap;position: fixed;min-width: 150px;
            max-width: 840px;min-height: 33px;border: 1px solid rgb(68, 68, 68);color: white;
        }
        #testing-tools > div {
            width: 100%;display: flex;
        }
        #btn-corp-test {
            margin-right: auto;
        }
        #btn-import-save {
            margin-left: auto;
        }
        #btn-funds {
            margin-left: 10px;
        }
        #btn-rp {
            margin-left: 10px;
        }
        #testing-tools-file-input {
            display: none;
        }
        #select-save-data {
            min-width: 195px;
        }
    </style>
</div>
        `.trim();
        root.appendChild(testingToolsTemplate.content.firstChild!);
        testingToolsDiv = doc.querySelector("#testing-tools")!;
        const savaDataSelectElement = doc.getElementById("select-save-data") as HTMLSelectElement;

        async function reloadSaveDataSelectElement() {
            const keys = await getAllSaveDataKeys();
            savaDataSelectElement.innerHTML = "";
            for (const key of keys) {
                const option = document.createElement("option");
                option.text = key;
                option.value = key;
                savaDataSelectElement.add(option);
            }
        }

        reloadSaveDataSelectElement().then();
        doc.getElementById("btn-corp-maintain")!.addEventListener("click", async function () {
            runCorpMaintain = true;
        });
        doc.getElementById("btn-unlimited-bonus-time")!.addEventListener("click", function () {
            globalThis.Player.corporation.storedCycles = 1000000;
        });
        doc.getElementById("btn-remove-bonus-time")!.addEventListener("click", function () {
            globalThis.Player.corporation.storedCycles = 0;
        });
        doc.getElementById("btn-corp-round")!.addEventListener("click", async function () {
            runCorpRound = true;
        });
        doc.getElementById("btn-corp-test")!.addEventListener("click", async function () {
            runCorpTest = true;
        });
        doc.getElementById("btn-import-save")!.addEventListener("click", async function () {
            const fileInput = doc.getElementById("testing-tools-file-input") as HTMLInputElement;
            fileInput.onchange = (e) => {
                const file = (<HTMLInputElement>e.target).files![0];
                const reader = new FileReader();
                reader.onload = function (this: FileReader, e: ProgressEvent<FileReader>) {
                    const target = e.target;
                    if (target === null) {
                        throw new Error("Error importing file");
                    }
                    const result = target.result;
                    if (typeof result !== "string") {
                        throw new Error("FileReader event was not type string");
                    }
                    saveString = result;
                    importSave = true;
                };
                reader.readAsText(file);
            };
            fileInput.click();
        });
        doc.getElementById("btn-delete-all-scripts")!.addEventListener("click", async function () {
            runDelScripts = true;
        });
        doc.getElementById("btn-reload")!.addEventListener("click", async function () {
            reload = true;
            testingToolsDiv!.remove();
        });
        doc.getElementById("btn-exit")!.addEventListener("click", async function () {
            testingToolsDiv!.remove();
        });

        const getInputValue = function () {
            return doc.querySelector<HTMLInputElement>("#testing-tools-input")!.value;
        };
        const useInputValueAsNumber = function (callback: ((inputValue: number) => void)) {
            const value = parseNumber(getInputValue());
            if (Number.isNaN(value)) {
                alert("Invalid input");
                return;
            }
            callback(value);
        };
        const useInputValueAsString = function (callback: ((inputValue: string) => void)) {
            const value = getInputValue();
            if (!value) {
                alert("Invalid input");
                return;
            }
            callback(value);
        };
        const corpData = globalThis.Player.corporation;
        const CorpUpgrades = CorpUpgradesData;
        const setUpgradeLevel = function (upgradeName: string, level: number) {
            const corpUpgrades: [string, any][] = Object.entries(corpData.upgrades);
            for (const [corpUpgradeName, corpUpgradeInfo] of corpUpgrades) {
                if (corpUpgradeName === upgradeName) {
                    const upgradeData = CorpUpgrades[corpUpgradeName];
                    corpUpgradeInfo.level = level;
                    corpUpgradeInfo.value = 1 + upgradeData.benefit * level;
                }

                if (corpUpgradeName === UpgradeName.SMART_STORAGE) {
                    for (const division of corpData.divisions.values()) {
                        const warehouses: any[] = getRecordValues(division.warehouses);
                        for (const warehouse of warehouses) {
                            warehouse.updateSize(corpData, division);
                        }
                    }
                }
            }
        };
        const getDivisionName = function (): string {
            return doc.querySelector<HTMLSelectElement>("#testing-tools-divisions")!.value;
        };
        const getDivision = function (divisionName: string) {
            for (const division of corpData.divisions.values()) {
                if (division.name === divisionName) {
                    return division;
                }
            }
        };
        const setBoostMaterialsInWarehouse = function (division: any, targetBoostMaterials: number[]) {
            if (targetBoostMaterials.length !== 4) {
                alert("Invalid input");
                return;
            }
            const warehouses: any[] = Object.values(division.warehouses);
            for (const warehouse of warehouses) {
                const materials: any[] = Object.values(warehouse.materials);
                for (const material of materials) {
                    switch (material.name) {
                        case MaterialName.AI_CORES:
                            material.stored = targetBoostMaterials[0];
                            break;
                        case MaterialName.HARDWARE:
                            material.stored = targetBoostMaterials[1];
                            break;
                        case MaterialName.REAL_ESTATE:
                            material.stored = targetBoostMaterials[2];
                            break;
                        case MaterialName.ROBOTS:
                            material.stored = targetBoostMaterials[3];
                            break;
                    }
                }
            }
        };
        const clearInputMaterialsInWarehouse = function (division: any) {
            const requiredMaterials = Object.keys(division.requiredMaterials);
            const warehouses: any[] = Object.values(division.warehouses);
            for (const warehouse of warehouses) {
                const materials: any[] = Object.values(warehouse.materials);
                for (const material of materials) {
                    if (requiredMaterials.includes(material.name)) {
                        material.stored = 0;
                    }
                }
            }
        };
        doc.getElementById("btn-funds")!.addEventListener("click", async function () {
            useInputValueAsNumber((inputValue: number) => {
                corpData.funds = inputValue;
            });
        });
        doc.getElementById("btn-smart-factories-level")!.addEventListener("click", async function () {
            useInputValueAsNumber((inputValue: number) => {
                setUpgradeLevel(UpgradeName.SMART_FACTORIES, inputValue);
            });
        });
        doc.getElementById("btn-smart-storage-level")!.addEventListener("click", async function () {
            useInputValueAsNumber((inputValue: number) => {
                setUpgradeLevel(UpgradeName.SMART_STORAGE, inputValue);
            });
        });
        doc.getElementById("btn-import-save-data")!.addEventListener("click", async function () {
            const saveString = await getSaveData(savaDataSelectElement.value);
            if (!saveString) {
                return;
            }
            await updateSaveData("save", saveString);
            globalThis.location.reload();
            console.log(await getAllSaveDataKeys());
        });
        doc.getElementById("btn-export-save-data")!.addEventListener("click", async function () {
            await insertSaveData(globalThis.saveObject.getSaveString());
            await reloadSaveDataSelectElement();
        });
        doc.getElementById("btn-delete-save-data")!.addEventListener("click", async function () {
            const key = savaDataSelectElement.value;
            if (!key) {
                return;
            }
            if (key === "save") {
                alert(`You cannot delete the built-in "save"`);
                return;
            }
            await deleteSaveData(savaDataSelectElement.value);
            await reloadSaveDataSelectElement();
        });
        doc.getElementById("btn-rp")!.addEventListener("click", async function () {
            useInputValueAsNumber((inputValue: number) => {
                getDivision(getDivisionName()).researchPoints = inputValue;
            });
        });
        doc.getElementById("btn-office")!.addEventListener("click", async function () {
            useInputValueAsString((inputValue: string) => {
                const employeeJobs: number[] = inputValue.trim().split(",")
                    .map(value => parseNumber(value))
                    .filter(value => !Number.isNaN(value));
                if (employeeJobs.length !== 5) {
                    alert("Invalid input");
                    return;
                }
                const size = employeeJobs.reduce((accumulator, current) => accumulator += current, 0);
                const offices: any[] = Object.values(getDivision(getDivisionName()).offices);
                for (const office of offices) {
                    office.size = size;
                    office.numEmployees = size;
                    office.employeeNextJobs[CorpEmployeePosition.OPERATIONS] = employeeJobs[0];
                    office.employeeNextJobs[CorpEmployeePosition.ENGINEER] = employeeJobs[1];
                    office.employeeNextJobs[CorpEmployeePosition.BUSINESS] = employeeJobs[2];
                    office.employeeNextJobs[CorpEmployeePosition.MANAGEMENT] = employeeJobs[3];
                    office.employeeNextJobs[CorpEmployeePosition.RESEARCH_DEVELOPMENT] = employeeJobs[4];
                    office.employeeNextJobs[CorpEmployeePosition.INTERN] = 0;
                    office.employeeNextJobs[CorpEmployeePosition.UNASSIGNED] = 0;
                }
            });
        });
        doc.getElementById("btn-warehouse-level")!.addEventListener("click", async function () {
            useInputValueAsNumber((inputValue: number) => {
                const division = getDivision(getDivisionName());
                const warehouses: any[] = Object.values(division.warehouses);
                for (const warehouse of warehouses) {
                    warehouse.level = inputValue;
                    warehouse.updateSize(corpData, division);
                }
            });
        });
        doc.getElementById("btn-boost-materials")!.addEventListener("click", async function () {
            useInputValueAsString((inputValue: string) => {
                const division = getDivision(getDivisionName());
                const targetBoostMaterials: number[] = inputValue.trim().split(",")
                    .map(value => parseNumber(value))
                    .filter(value => !Number.isNaN(value));
                setBoostMaterialsInWarehouse(division, targetBoostMaterials);
            });
        });
        doc.getElementById("btn-clear-boost-materials")!.addEventListener("click", async function () {
            const division = getDivision(getDivisionName());
            setBoostMaterialsInWarehouse(division, [0, 0, 0, 0]);
        });
        doc.getElementById("btn-clear-input-materials")!.addEventListener("click", async function () {
            const division = getDivision(getDivisionName());
            clearInputMaterialsInWarehouse(division);
        });
        doc.getElementById("btn-clear-storage")!.addEventListener("click", async function () {
            const division = getDivision(getDivisionName());
            const warehouses: any[] = Object.values(division.warehouses);
            for (const warehouse of warehouses) {
                const materials: any[] = Object.values(warehouse.materials);
                for (const material of materials) {
                    material.stored = 0;
                }
            }
        });
    }
}

export async function main(ns: NS): Promise<void> {
    nsx = new NetscriptExtension(ns);
    nsx.killProcessesSpawnFromSameScript();

    ns.disableLog("ALL");
    ns.clearLog();
    // ns.tail();

    doc = eval("document");
    const hook0 = doc.getElementById("overview-extra-hook-0")!;
    const hook1 = doc.getElementById("overview-extra-hook-1")!;
    ns.atExit(() => {
        hook0.innerText = "";
        hook1.innerText = "";
    });

    const headers = [];
    const values = [];

    headers.push("<div>ServerLoad</div>");
    values.push("<div id='hud-server-load'>0%</div>");
    if (ns.stock.hasWSEAccount()) {
        headers.push("<div>StockWorth</div>");
        values.push("<div id='hud-stock-worth'>0</div>");
    }
    if (ns.corporation.hasCorporation()) {
        headers.push("<div>InvestmentOffer</div>");
        values.push("<div id='hud-investment-offer'>0</div>");
        headers.push("<div>CorpMaintain</div>");
        values.push("<div id='hud-corp-maintain'>false</div>");
    }

    hook0.innerHTML = headers.join("");
    hook1.innerHTML = values.join("");

    if (globalThis.Player) {
        createTestingTool();
    }

    while (true) {
        try {
            // Scan all runners and calculate server load
            let totalMaxRAMOfAllRunners = 0;
            let totalUsedRAMOfAllRunners = 0;
            nsx.scanBFS("home")
                .filter(host => {
                    return ns.getServerMaxRam(host.hostname) > 0 && ns.hasRootAccess(host.hostname);
                })
                .forEach(runner => {
                    totalMaxRAMOfAllRunners += ns.getServerMaxRam(runner.hostname);
                    totalUsedRAMOfAllRunners += ns.getServerUsedRam(runner.hostname);
                });
            doc.getElementById("hud-server-load")!.innerText =
                `${(totalUsedRAMOfAllRunners / totalMaxRAMOfAllRunners * 100).toFixed(2)}%`;

            if (ns.stock.hasWSEAccount()) {
                const hudStockWorthValue = doc.getElementById("hud-stock-worth");
                if (hudStockWorthValue === null) {
                    rerun(ns);
                    return;
                }
                const stockStats = nsx.calculateStockStats();
                hudStockWorthValue.innerText = ns.formatNumber(stockStats.currentWorth);
            }

            if (ns.corporation.hasCorporation()) {
                const hudInvestmentOfferValue = doc.getElementById("hud-investment-offer");
                if (hudInvestmentOfferValue === null) {
                    rerun(ns);
                    return;
                }
                hudInvestmentOfferValue.innerText = ns.formatNumber(ns.corporation.getInvestmentOffer().funds);

                let isDaemonRunning = false;
                ns.ps().forEach(process => {
                    if (process.filename !== DAEMON_SCRIPT_NAME) {
                        return;
                    }
                    if (process.args.includes("--maintainCorporation")) {
                        isDaemonRunning = true;
                    }
                });
                doc.getElementById("hud-corp-maintain")!.innerText = `${isDaemonRunning}`;

                // Testing tools
                if (runCorpMaintain) {
                    if (ns.exec("daemon.js", "home", 1, "--maintainCorporation") === 0) {
                        ns.toast("Failed to run daemon.js --maintainCorporation");
                    }
                    runCorpMaintain = false;
                }
                if (runDelScripts) {
                    ns.killall("home", true);
                    if (ns.exec("tools.js", "home", 1, "--deleteAllScripts") === 0) {
                        ns.toast("Failed to run tools.js --deleteAllScripts");
                    }
                    runDelScripts = false;
                }
                if (reload) {
                    rerun(ns);
                    reload = false;
                }
                if (runCorpRound) {
                    if (ns.exec("corporation.js", "home", 1, "--round2") === 0) {
                        ns.toast("Failed to run corporation.js --round2");
                    }
                    // if (ns.exec("corporation.js", "home", 1, "--round3") === 0) {
                    //     ns.toast("Failed to run corporation.js --round3");
                    // }
                    // if (!hasDivision(ns, DivisionName.CHEMICAL)) {
                    //     if (ns.exec("corporation.js", "home", 1, "--round2") === 0) {
                    //         ns.toast("Failed to run corporation.js --round2");
                    //     }
                    // } else if (!hasDivision(ns, DivisionName.TOBACCO)) {
                    //     if (ns.exec("corporation.js", "home", 1, "--round3") === 0) {
                    //         ns.toast("Failed to run corporation.js --round3");
                    //     }
                    // }
                    runCorpRound = false;
                }
                if (runCorpTest) {
                    if (ns.exec("corporation.js", "home", 1, "--test") === 0) {
                        ns.toast("Failed to run corporation.js --test");
                    }
                    runCorpTest = false;
                }
                if (importSave) {
                    const indexedDbRequest: IDBOpenDBRequest = window.indexedDB.open("bitburnerSave", 1);
                    indexedDbRequest.onsuccess = function (this: IDBRequest<IDBDatabase>) {
                        const db = this.result;
                        if (!db) {
                            throw new Error("database loading result was undefined");
                        }
                        const objectStore = db.transaction(["savestring"], "readwrite").objectStore("savestring");
                        const request = objectStore.put(saveString, "save");
                        request.onsuccess = () => {
                            globalThis.location?.reload();
                        };
                    };
                    importSave = false;
                }
            } else {
                if (runCorpRound) {
                    if (ns.exec("corporation.js", "home", 1, "--round1") === 0) {
                        ns.toast("Failed to run corporation.js --round1");
                    }
                    await ns.sleep(1000);
                    ns.exec("daemon.js", "home", 1, "--maintainCorporation");
                    globalThis.Player.corporation.storedCycles = 1000000;
                    runCorpRound = false;
                }
            }
        } catch (ex: any) {
            if (ex.message !== undefined) {
                ns.print(`HUD error: ${ex.message}`);
            } else {
                ns.print(`HUD error: ${JSON.stringify(ex)}`);
            }
        }
        await ns.sleep(1000);
    }
}

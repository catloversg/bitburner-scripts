import { NS } from "@ns";
import { NetscriptExtension } from "/libs/NetscriptExtension";
import { DAEMON_SCRIPT_NAME } from "/libs/constants";
import { parseNumber } from "/libs/utils";
import { UpgradeName } from "/corporationFormulas";
import { clearPurchaseOrders, DivisionName, hasDivision } from "/corporationUtils";
import * as testingTools from "/corporationTestingTools";
import { exposeInternalGameObjects } from "/exploits.js";

let ns: NS;
let nsx: NetscriptExtension;
let doc: Document;

const enableTestingTools = true;
let runCorpMaintain = false;
let runDelScripts = false;
let reload = false;
let runCorpRound = false;
let runCorpTest = false;

function rerun(ns: NS) {
  ns.spawn(ns.getScriptName(), { spawnDelay: 100 });
}

function removeTestingTool() {
  const testingToolsDiv = doc.querySelector("#testing-tools");
  // Remove old tools
  if (testingToolsDiv) {
    testingToolsDiv.remove();
  }
}

function createTestingTool() {
  // Testing tools
  if (enableTestingTools) {
    removeTestingTool();

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
        <button id="btn-smart-factories">SmartFactories</button>
        <button id="btn-smart-storage">SmartStorage</button>
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
            <option value="T0">Tobacco</option>
        </select>
        <button id="btn-rp">RP</button>
        <button id="btn-office">Office</button>
        <button id="btn-warehouse">Warehouse</button>
        <button id="btn-boost-materials">BoostMats</button>
        <button id="btn-clear-boost-materials">ClearBoostMats</button>
        <button id="btn-clear-input-materials">ClearInputMats</button>
        <button id="btn-clear-output-materials">ClearOutputMats</button>
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
    const testingToolsDiv = doc.querySelector("#testing-tools")!;
    const savaDataSelectElement = doc.getElementById("select-save-data") as HTMLSelectElement;

    const reloadSaveDataSelectElement = async () => {
      const keys = await testingTools.getAllSaveDataKeys();
      keys.sort((a, b) => {
        if (a === "save") {
          return 1;
        }
        return b.toString().localeCompare(a.toString());
      });
      savaDataSelectElement.innerHTML = "";
      for (const key of keys) {
        const option = document.createElement("option");
        option.text = key as string;
        option.value = key as string;
        savaDataSelectElement.add(option);
      }
    };

    reloadSaveDataSelectElement().then();
    doc.getElementById("btn-corp-maintain")!.addEventListener("click", function () {
      runCorpMaintain = true;
    });
    doc.getElementById("btn-unlimited-bonus-time")!.addEventListener("click", function () {
      testingTools.setUnlimitedBonusTime();
    });
    doc.getElementById("btn-remove-bonus-time")!.addEventListener("click", function () {
      testingTools.removeBonusTime();
    });
    doc.getElementById("btn-corp-round")!.addEventListener("click", function () {
      runCorpRound = true;
    });
    doc.getElementById("btn-corp-test")!.addEventListener("click", function () {
      runCorpTest = true;
    });
    doc.getElementById("btn-import-save")!.addEventListener("click", function () {
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
          const indexedDbRequest: IDBOpenDBRequest = window.indexedDB.open("bitburnerSave", 1);
          indexedDbRequest.onsuccess = function (this: IDBRequest<IDBDatabase>) {
            const db = this.result;
            if (!db) {
              throw new Error("Cannot access database");
            }
            const objectStore = db.transaction(["savestring"], "readwrite").objectStore("savestring");
            const request = objectStore.put(result instanceof ArrayBuffer ? new Uint8Array(result) : result, "save");
            request.onsuccess = () => {
              globalThis.setTimeout(() => globalThis.location.reload(), 1000);
            };
          };
        };
        if (file.name.endsWith(".gz")) {
          reader.readAsArrayBuffer(file);
        } else {
          reader.readAsText(file);
        }
      };
      fileInput.click();
    });
    doc.getElementById("btn-delete-all-scripts")!.addEventListener("click", function () {
      runDelScripts = true;
    });
    doc.getElementById("btn-reload")!.addEventListener("click", function () {
      reload = true;
      testingToolsDiv!.remove();
    });
    doc.getElementById("btn-exit")!.addEventListener("click", function () {
      testingToolsDiv!.remove();
    });

    const getInputValue = function () {
      return doc.querySelector<HTMLInputElement>("#testing-tools-input")!.value;
    };
    const useInputValueAsNumber = function (callback: (inputValue: number) => void) {
      const value = parseNumber(getInputValue());
      if (Number.isNaN(value)) {
        alert("Invalid input");
        return;
      }
      callback(value);
    };
    const useInputValueAsString = function (callback: (inputValue: string) => void) {
      const value = getInputValue();
      if (!value) {
        alert("Invalid input");
        return;
      }
      callback(value);
    };
    const getDivisionName = function (): string {
      return doc.querySelector<HTMLSelectElement>("#testing-tools-divisions")!.value;
    };
    doc.getElementById("btn-funds")!.addEventListener("click", function () {
      useInputValueAsNumber((inputValue: number) => {
        testingTools.setFunds(inputValue);
      });
    });
    doc.getElementById("btn-smart-factories")!.addEventListener("click", function () {
      useInputValueAsNumber((inputValue: number) => {
        testingTools.setUpgradeLevel(UpgradeName.SMART_FACTORIES, inputValue);
      });
    });
    doc.getElementById("btn-smart-storage")!.addEventListener("click", function () {
      useInputValueAsNumber((inputValue: number) => {
        testingTools.setUpgradeLevel(UpgradeName.SMART_STORAGE, inputValue);
      });
    });
    doc.getElementById("btn-import-save-data")!.addEventListener("click", function () {
      testingTools.getSaveData(savaDataSelectElement.value).then((saveData) => {
        if (!saveData) {
          return;
        }
        testingTools.updateSaveData("save", saveData).then(() => {
          ns.killall("home");
          const currentAllServers = globalThis.AllServers.saveAllServers();
          globalThis.SaveObject.loadGame(saveData);
          setTimeout(() => {
            globalThis.AllServers.loadAllServers(currentAllServers);
            ns.exec("daemon.js", "home", 1, "--maintainCorporation");
          }, 1000);
        });
      });
    });
    doc.getElementById("btn-export-save-data")!.addEventListener("click", async function () {
      testingTools.insertSaveData(await globalThis.SaveObject.saveObject.getSaveData(true, true)).then(() => {
        reloadSaveDataSelectElement().then();
      });
    });
    doc.getElementById("btn-delete-save-data")!.addEventListener("click", function () {
      const key = savaDataSelectElement.value;
      if (!key) {
        return;
      }
      if (key === "save") {
        alert(`You cannot delete the built-in "save"`);
        return;
      }
      testingTools.deleteSaveData(savaDataSelectElement.value).then(() => {
        reloadSaveDataSelectElement().then();
      });
    });
    doc.getElementById("btn-rp")!.addEventListener("click", function () {
      useInputValueAsNumber((inputValue: number) => {
        testingTools.setResearchPoints(getDivisionName(), inputValue);
      });
    });
    doc.getElementById("btn-office")!.addEventListener("click", function () {
      useInputValueAsString((inputValue: string) => {
        const employeeJobs: number[] = inputValue
          .trim()
          .split(",")
          .map((value) => parseNumber(value))
          .filter((value) => !Number.isNaN(value));
        if (employeeJobs.length !== 5) {
          alert("Invalid input");
          return;
        }
        testingTools.setOfficeSetup(getDivisionName(), employeeJobs);
      });
    });
    doc.getElementById("btn-warehouse")!.addEventListener("click", function () {
      useInputValueAsNumber((inputValue: number) => {
        testingTools.setWarehouseLevel(getDivisionName(), inputValue);
      });
    });
    doc.getElementById("btn-boost-materials")!.addEventListener("click", function () {
      useInputValueAsString((inputValue: string) => {
        const boostMaterials: number[] = inputValue
          .trim()
          .split(",")
          .map((value) => parseNumber(value))
          .filter((value) => !Number.isNaN(value));
        if (boostMaterials.length !== 4) {
          alert("Invalid input");
          return;
        }
        testingTools.setBoostMaterials(getDivisionName(), boostMaterials);
      });
    });
    doc.getElementById("btn-clear-boost-materials")!.addEventListener("click", function () {
      testingTools.setBoostMaterials(getDivisionName(), [0, 0, 0, 0]);
    });
    doc.getElementById("btn-clear-input-materials")!.addEventListener("click", function () {
      testingTools.clearMaterials(getDivisionName(), { input: true, output: false });
    });
    doc.getElementById("btn-clear-output-materials")!.addEventListener("click", function () {
      testingTools.clearMaterials(getDivisionName(), { input: false, output: true });
    });
    doc.getElementById("btn-clear-storage")!.addEventListener("click", function () {
      clearPurchaseOrders(ns);
      testingTools.setBoostMaterials(getDivisionName(), [0, 0, 0, 0]);
      testingTools.clearMaterials(getDivisionName(), { input: true, output: true });
    });
  }
}

export async function main(nsContext: NS): Promise<void> {
  exposeInternalGameObjects();
  testingTools.setDefaultSettings();
  ns = nsContext;
  nsx = new NetscriptExtension(ns);
  nsx.killProcessesSpawnFromSameScript();

  ns.disableLog("ALL");
  ns.clearLog();
  // ns.ui.openTail();

  doc = eval("document");
  const hook0 = doc.getElementById("overview-extra-hook-0")!;
  const hook1 = doc.getElementById("overview-extra-hook-1")!;
  nsx.addAtExitCallback(() => {
    hook0.innerText = "";
    hook1.innerText = "";
    removeTestingTool();
  });

  const headers = [];
  const values = [];

  headers.push("<div>ServerLoad</div>");
  values.push("<div id='hud-server-load'>0%</div>");
  if (ns.stock.hasWseAccount()) {
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
      nsx
        .scanBFS("home")
        .filter((host) => {
          return ns.getServerMaxRam(host.hostname) > 0 && ns.hasRootAccess(host.hostname);
        })
        .forEach((runner) => {
          totalMaxRAMOfAllRunners += ns.getServerMaxRam(runner.hostname);
          totalUsedRAMOfAllRunners += ns.getServerUsedRam(runner.hostname);
        });
      doc.getElementById("hud-server-load")!.innerText =
        `${((totalUsedRAMOfAllRunners / totalMaxRAMOfAllRunners) * 100).toFixed(2)}%`;

      if (ns.stock.hasWseAccount()) {
        const hudStockWorthValue = doc.getElementById("hud-stock-worth");
        if (hudStockWorthValue === null) {
          rerun(ns);
          return;
        }
        const stockStats = nsx.calculateStockStats();
        hudStockWorthValue.innerText = ns.format.number(stockStats.currentWorth);
      }

      if (ns.corporation.hasCorporation()) {
        const hudInvestmentOfferValue = doc.getElementById("hud-investment-offer");
        if (hudInvestmentOfferValue === null) {
          rerun(ns);
          return;
        }
        hudInvestmentOfferValue.innerText = ns.format.number(ns.corporation.getInvestmentOffer().funds);

        let isDaemonRunning = false;
        ns.ps().forEach((process) => {
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
          // if (ns.exec("corporation.js", "home", 1, "--round1", "--benchmark") === 0) {
          //     ns.toast("Failed to run corporation.js --round1 --benchmark");
          // }
          // if (ns.exec("corporation.js", "home", 1, "--round2", "--benchmark") === 0) {
          //     ns.toast("Failed to run corporation.js --round2 --benchmark");
          // }
          // if (ns.exec("corporation.js", "home", 1, "--round3", "--benchmark") === 0) {
          //     ns.toast("Failed to run corporation.js --round3 --benchmark");
          // }
          if (!hasDivision(ns, DivisionName.CHEMICAL)) {
            if (ns.exec("corporation.js", "home", 1, "--round2", "--benchmark") === 0) {
              ns.toast("Failed to run corporation.js --round2 --benchmark");
            }
          } else if (!hasDivision(ns, DivisionName.TOBACCO_0)) {
            if (ns.exec("corporation.js", "home", 1, "--round3", "--benchmark") === 0) {
              ns.toast("Failed to run corporation.js --round3 --benchmark");
            }
          } else {
            if (ns.exec("corporation.js", "home", 1, "--improveAllDivisions", "--benchmark") === 0) {
              ns.toast("Failed to run corporation.js --improveAllDivisions --benchmark");
            }
          }
          runCorpRound = false;
        }
        if (runCorpTest) {
          if (ns.exec("corporation.js", "home", 1, "--test", "--benchmark") === 0) {
            ns.toast("Failed to run corporation.js --test --benchmark");
          }
          runCorpTest = false;
        }
      } else {
        if (runCorpRound) {
          if (ns.exec("corporation.js", "home", 1, "--round1", "--benchmark") === 0) {
            ns.toast("Failed to run corporation.js --round1 --benchmark");
          }
          await ns.sleep(1000);
          ns.exec("daemon.js", "home", 1, "--maintainCorporation");
          testingTools.setUnlimitedBonusTime();
          runCorpRound = false;
        }
      }
    } catch (ex: unknown) {
      ns.print(`HUD error: ${JSON.stringify(ex)}`);
    }
    await ns.asleep(1000);
  }
}

import { NS } from "@ns";
import { PRIVATE_SERVER_NAME_PREFIX } from "/libs/constants";
import { NetscriptExtension } from "/libs/NetscriptExtension";

interface Config {
  reservedMoney: number;
  limitPurchasableRAMBasedOnHomeServerRAM: boolean;
  useCustomMaxPurchasableRAM: boolean;
  customMaxPurchasableRAM: number;
}

let nsx: NetscriptExtension;

const defaultConfig: Config = {
  reservedMoney: 1e6,
  limitPurchasableRAMBasedOnHomeServerRAM: false,
  useCustomMaxPurchasableRAM: true,
  customMaxPurchasableRAM: 8192,
};

let customConfig: Config | null = null;
customConfig = <Config>{
  reservedMoney: 25e9,
  limitPurchasableRAMBasedOnHomeServerRAM: false,
  useCustomMaxPurchasableRAM: true,
  customMaxPurchasableRAM: 8192 * 128,
};

export async function main(ns: NS): Promise<void> {
  nsx = new NetscriptExtension(ns);
  nsx.killProcessesSpawnFromSameScript();

  const config = customConfig !== null ? customConfig : defaultConfig;

  ns.disableLog("ALL");

  const reservedMoney = config.reservedMoney;
  const limitPurchasableRAMBasedOnHomeServerRAM = config.limitPurchasableRAMBasedOnHomeServerRAM;
  let maxPurchasableRAM = ns.getPurchasedServerMaxRam();
  if (config.useCustomMaxPurchasableRAM) {
    maxPurchasableRAM = config.customMaxPurchasableRAM;
  }
  if (limitPurchasableRAMBasedOnHomeServerRAM) {
    maxPurchasableRAM = Math.min(maxPurchasableRAM, ns.getServerMaxRam("home"));
  }

  if (ns.getPurchasedServers().length === 0 && ns.getServerMoneyAvailable("home") < reservedMoney) {
    ns.tprint("Reserved money is set too high while we have not purchased any server");
    return;
  }

  // Try buying to limit number of servers with 2GB RAM
  const maxNumberOfPurchasedServer = ns.getPurchasedServerLimit();
  while (ns.getPurchasedServers().length < maxNumberOfPurchasedServer) {
    const availableMoney = ns.getServerMoneyAvailable("home") - reservedMoney;
    const ram = 2;
    if (availableMoney >= ns.getPurchasedServerCost(ram)) {
      const newServerHostname = ns.purchaseServer(
        `${PRIVATE_SERVER_NAME_PREFIX}${ns.getPurchasedServers().length}`,
        ram,
      );
      ns.print(
        `Purchase new server: ` +
          `${newServerHostname !== "" ? `Success. New server's hostname: ${newServerHostname}` : "Fail"}`,
      );
    }
  }

  // Find suitable tier
  let ramTier = Number.MAX_SAFE_INTEGER;
  for (const hostname of ns.getPurchasedServers()) {
    ramTier = Math.min(ramTier, Math.log2(ns.getServerMaxRam(hostname)));
  }

  // Try upgrading purchased servers
  while (true) {
    ++ramTier;
    const newRAM = 2 ** ramTier;
    if (newRAM > maxPurchasableRAM) {
      ns.tprint("All servers have been upgraded");
      break;
    }
    for (const hostname of ns.getPurchasedServers()) {
      // This server's RAM is bigger than value of current tier
      if (ns.getServerMaxRam(hostname) >= newRAM) {
        continue;
      }
      // This server needs to be upgraded, loop until we have enough money
      while (true) {
        const availableMoney = ns.getServerMoneyAvailable("home") - reservedMoney;
        const upgradeCost = ns.getPurchasedServerUpgradeCost(hostname, newRAM);
        if (availableMoney >= upgradeCost) {
          ns.print(
            `Upgrade server ${hostname} with new RAM ${ns.format.ram(newRAM)}` +
              `. Cost: ${ns.format.number(upgradeCost)}` +
              `. Result: ${ns.upgradePurchasedServer(hostname, newRAM) ? "Success" : "Fail"}`,
          );
          break;
        }
        await ns.sleep(1000);
      }
    }
    await ns.sleep(1000);
  }
}

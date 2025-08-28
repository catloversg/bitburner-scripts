import { AutocompleteData, NS } from "@ns";

export function autocomplete(data: AutocompleteData, _flags: string[]): string[] {
  return [...data.servers];
}

export async function main(ns: NS): Promise<void> {
  const target: string = ns.args[0].toString();

  const moneyThreshold = ns.getServerMaxMoney(target) * 0.75;
  const securityThreshold = ns.getServerMinSecurityLevel(target) + 5;

  while (true) {
    if (ns.getServerSecurityLevel(target) > securityThreshold) {
      await ns.weaken(target);
    } else if (ns.getServerMoneyAvailable(target) < moneyThreshold) {
      await ns.grow(target);
    } else {
      await ns.hack(target);
    }
  }
}

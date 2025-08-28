// noinspection DuplicatedCode
import { AutocompleteData, NS } from "@ns";
import { NetscriptFlagsSchema } from "/libs/NetscriptExtension";

export function autocomplete(_data: AutocompleteData, _flags: string[]): string[] {
  return ["--divisionName", "Agriculture"];
}

enum CityName {
  Aevum = "Aevum",
  Chongqing = "Chongqing",
  Sector12 = "Sector-12",
  NewTokyo = "New Tokyo",
  Ishima = "Ishima",
  Volhaven = "Volhaven",
}

const cities: CityName[] = [
  CityName.Sector12,
  CityName.Aevum,
  CityName.Chongqing,
  CityName.NewTokyo,
  CityName.Ishima,
  CityName.Volhaven,
];

const defaultConfig: NetscriptFlagsSchema = [["divisionName", "Agriculture"]];

export async function main(ns: NS): Promise<void> {
  const config = ns.flags(defaultConfig);
  const divisionName = config.divisionName as string;

  // noinspection DuplicatedCode
  while (true) {
    let finish = true;
    for (const city of cities) {
      const office = ns.corporation.getOffice(divisionName, city);
      if (office.avgEnergy < office.maxEnergy - 0.5) {
        ns.corporation.buyTea(divisionName, city);
        finish = false;
      }
      if (office.avgMorale < office.maxMorale - 0.5) {
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

import { AutocompleteData, NS } from "@ns";
import { NetscriptExtension } from "./libs/NetscriptExtension";

export function autocomplete(data: AutocompleteData, _flags: string[]): string[] {
  return [...data.servers];
}

export async function main(ns: NS) {
  const nsx = new NetscriptExtension(ns);
  nsx.connect(ns.args[0] as string);
}

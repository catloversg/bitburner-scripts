import { AutocompleteData, NS } from "@ns";
import { NetscriptExtension } from "./libs/NetscriptExtension";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function autocomplete(data: AutocompleteData, flags: string[]): string[] {
  return [...data.servers];
}

export async function main(ns: NS) {
  const nsx = new NetscriptExtension(ns);
  nsx.connect(ns.args[0] as string);
}

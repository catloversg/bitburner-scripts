import { NS } from "@ns";

export async function main(ns: NS): Promise<void> {
  await ns.sleep(<number>ns.args[1] || 1);
  const hostname = <string>ns.args[0];
  if (ns.args.length >= 3) {
    await ns.hack(hostname, { stock: <boolean>ns.args[2] });
  } else {
    await ns.hack(hostname);
  }
}

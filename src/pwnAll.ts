import { NS } from "@ns";
import { NetscriptExtension } from "libs/NetscriptExtension";
import { CompletedProgramName } from "libs/Enums";

let nsx: NetscriptExtension;

export async function main(ns: NS): Promise<void> {
  nsx = new NetscriptExtension(ns);
  nsx.killProcessesSpawnFromSameScript();

  ns.disableLog("ALL");

  const hosts = nsx.scanBFS("home");
  while (true) {
    let hasRootAccessOnAllHosts = true;
    for (const host of hosts) {
      const hostname = host.hostname;
      const server = ns.getServer(hostname);
      if (ns.hasRootAccess(host.hostname)) {
        continue;
      }
      if (!server.sshPortOpen && ns.fileExists(CompletedProgramName.bruteSsh, "home")) {
        ns.brutessh(host.hostname);
        server.openPortCount!++;
      }
      if (!server.ftpPortOpen && ns.fileExists(CompletedProgramName.ftpCrack, "home")) {
        ns.ftpcrack(host.hostname);
        server.openPortCount!++;
      }
      if (!server.smtpPortOpen && ns.fileExists(CompletedProgramName.relaySmtp, "home")) {
        ns.relaysmtp(host.hostname);
        server.openPortCount!++;
      }
      if (!server.httpPortOpen && ns.fileExists(CompletedProgramName.httpWorm, "home")) {
        ns.httpworm(host.hostname);
        server.openPortCount!++;
      }
      if (!server.sqlPortOpen && ns.fileExists(CompletedProgramName.sqlInject, "home")) {
        ns.sqlinject(host.hostname);
        server.openPortCount!++;
      }
      if (server.openPortCount! >= ns.getServerNumPortsRequired(host.hostname)) {
        ns.nuke(host.hostname);
        ns.tprint(`Nuke ${host.hostname} successfully`);
      } else {
        hasRootAccessOnAllHosts = false;
      }
    }
    if (hasRootAccessOnAllHosts) {
      break;
    }
    await ns.sleep(5000);
  }
}

/* eslint-disable no-var */
/* eslint-disable @typescript-eslint/no-explicit-any */

export {};

type SaveData = string | Uint8Array;

declare global {
  var webpackRequire: any;
  var webpackChunkbitburner: any;
  // var Player: any;
  var Engine: {
    updateGame: (numCycles?: number) => void;
    load: (saveData: SaveData) => Promise<void>;
    start: () => void;
  };
  var SaveObject: {
    saveObject: {
      getSaveData: (forceExcludeRunningScripts: boolean, forceExcludeScripts: boolean) => Promise<SaveData>;
    };
    loadGame: (saveData: SaveData) => Promise<boolean>;
  };
  var AllServers: {
    GetServer: () => any;
    GetAllServers: () => any[];
    loadAllServers: (saveString: string) => void;
    saveAllServers: () => string;
  };
  var Factions: any;
  var Companies: any;
  var AllGangs: any;
  var StockMarket: any;
  var Reviver: any;
  var Settings: any;
  var GoAI: any;
  var openDevMenu: any;
  var RamCostConstants: any;
  var MathRound: any;
}

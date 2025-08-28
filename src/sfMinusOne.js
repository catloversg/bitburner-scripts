/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-unused-vars */

function unclickable() {
  const unclickableDiv = globalThis["document"].querySelector("#unclickable");
  unclickableDiv.style.display = "block";
  unclickableDiv.style.visibility = "visible";
  unclickableDiv.style.backgroundColor = "red";
  unclickableDiv.addEventListener("click", () => {
    unclickableDiv.style.display = "none";
    unclickableDiv.style.visibility = "hidden";
  });
}

function undocumented(ns) {
  ns.exploit();
}

function rainbow(ns) {
  ns.rainbow("noodles");
}

function bypass(ns) {
  ns.bypass(globalThis["document"]);
}

export function alterReality() {
  // Use browser developer tools to edit source code or value of variable x
}

function prototypeTampering() {
  const originalFunction = Number.prototype.toExponential;
  Number.prototype.toExponential = function (fractionDigits) {
    return originalFunction.apply(this, [fractionDigits]) + " ";
  };
}

function timeCompression() {
  const originalFunction = globalThis["window"].setTimeout;
  globalThis["window"].setTimeout = function (handler, timeout, ...args) {
    if (timeout === 15000) {
      timeout = 250;
    }
    return originalFunction.apply(this, [handler, timeout, ...args]);
  };
}

function trueRecursion() {
  // Make sure you have SF1, then go to Arcade, it will load https://bitburner-official.github.io/bitburner-legacy/
  // Open Developer tools and change line in bundle.js:
  // From: parent.postMessage(__WEBPACK_IMPORTED_MODULE_22__Player_js__["a"].sourceFiles.length > 0, "*")
  // To: parent.postMessage(true, "*")
  // Alternative ways: anything that make Legacy version thinks that you have at least 1 SF. Eg: destroy BN1, edit
  // save file, ...
}

export function main(ns) {
  unclickable();
  undocumented(ns);
  rainbow(ns);
  bypass(ns);
  prototypeTampering();
  timeCompression();
}

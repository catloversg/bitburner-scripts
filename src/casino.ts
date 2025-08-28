import { NS } from "@ns";
import { WHRNG } from "/libs/RNG";
import { parseNumber } from "/libs/utils";

let doc: Document;
let root: Element;
let gameRootElement: Element;

function assistRoulette(ns: NS) {
  let casinoToolsDiv = doc.querySelector("#casino-tools");
  // Remove old tools
  if (casinoToolsDiv !== null) {
    casinoToolsDiv.remove();
  }

  const title = gameRootElement.querySelector("h4");
  if (title === null || title.textContent !== "Iker Molina Casino") {
    ns.print("We are not in casino");
    return;
  }
  if (gameRootElement.querySelectorAll("h4").length !== 3) {
    ns.print("This is not roulette");
    return;
  }

  // Create tools
  const casinoToolsTemplate = doc.createElement("template");
  casinoToolsTemplate.innerHTML = `
<div id="casino-tools">
    <button id="btn-guess-seed">Guess seed</button>
    <button id="btn-guess-spins">Guess spins with seed</button>
    <button id="btn-highlight-next-guess">Highlight next guess</button>
    <button id="btn-exit">Exit</button>
    <div>
        <label for="roulette-seed">Seed:</label>
        <input id="roulette-seed" type="text"/>
    </div>
    <div>
        <label for="roulette-spins-for-guessing">Spins for guessing:</label>
        <input id="roulette-spins-for-guessing" type="text"/>
    </div>
    <div>
        <label for="roulette-guessed-spins">Guessed spins:</label>
        <textarea id="roulette-guessed-spins" aria-multiline="true" rows="5"></textarea>
    </div>
    <div>
        <label for="roulette-spin-history">Spin history:</label>
        <textarea id="roulette-spin-history" aria-multiline="true" rows="5"></textarea>
    </div>
    <style>
        #casino-tools {
            transform: translate(1150px, 5px);z-index: 9999;display: flex;flex-flow: wrap;position: fixed;min-width: 150px;
            max-width: 550px;min-height: 33px;border: 1px solid rgb(68, 68, 68);color: white;
        }
        #casino-tools > div {
            width: 100%;display: flex;
        }
        #casino-tools > div > label {
            min-width: 130px;
        }
        #casino-tools > div > input {
            flex: 1;
        }
        #casino-tools > div > textarea {
            flex: 1;
        }
        #btn-guess-seed {
            margin-right: 5px;
        }
        #btn-guess-spins {
            margin-right: 5px;
        }
        #btn-highlight-next-guess {
            margin-right: auto;
        }
        #btn-exit {
            margin-left: auto;
        }
    </style>
</div>
        `.trim();
  root.appendChild(casinoToolsTemplate.content.firstChild!);
  casinoToolsDiv = doc.querySelector("#casino-tools")!;
  const rouletteSeedElement = casinoToolsDiv.querySelector<HTMLInputElement>("#roulette-seed")!;
  const rouletteSpinsForGuessingElement =
    casinoToolsDiv.querySelector<HTMLInputElement>("#roulette-spins-for-guessing")!;
  const rouletteGuessedSpinsElement = casinoToolsDiv.querySelector<HTMLInputElement>("#roulette-guessed-spins")!;
  const rouletteSpinHistoryElement = casinoToolsDiv.querySelector<HTMLInputElement>("#roulette-spin-history")!;
  // Add event listeners
  casinoToolsDiv.querySelector("#btn-guess-seed")!.addEventListener("click", () => {
    const maxSeed = 30e6;
    const timestamp = new Date().getTime();
    const zeroDate = timestamp - (timestamp % maxSeed);

    if (rouletteSpinsForGuessingElement.value.trim() === "") {
      alert("Please set spins for guessing");
      return;
    }
    const spinsForGuessing = rouletteSpinsForGuessingElement.value
      .trim()
      .split(" ")
      .map((value) => {
        return parseNumber(value);
      });
    if (
      spinsForGuessing.length === 0 ||
      spinsForGuessing.some((value) => {
        return Number.isNaN(parseNumber(value));
      })
    ) {
      alert("Invalid spins for guessing");
      return;
    }

    let possibleSeed = 0;
    rouletteSeedElement.value = "";
    while (possibleSeed < maxSeed) {
      const rng = new WHRNG(zeroDate + possibleSeed);
      let match = true;
      for (const spin of spinsForGuessing) {
        if (spin !== Math.floor(rng.random() * 37)) {
          match = false;
        }
      }
      if (match) {
        rouletteSeedElement.value = (possibleSeed + zeroDate).toString();
        break;
      }
      possibleSeed = possibleSeed + 1;
    }
  });
  casinoToolsDiv.querySelector("#btn-guess-spins")!.addEventListener("click", () => {
    const rng = new WHRNG(parseNumber(rouletteSeedElement.value));
    rouletteGuessedSpinsElement.value = "";
    for (let i = 0; i < 100; i++) {
      rouletteGuessedSpinsElement.value += `${Math.floor(rng.random() * 37)} `;
    }
    highlightNextGuessedSpin();
  });
  casinoToolsDiv.querySelector("#btn-highlight-next-guess")!.addEventListener("click", () => {
    highlightNextGuessedSpin();
  });
  casinoToolsDiv.querySelector("#btn-exit")!.addEventListener("click", () => {
    casinoToolsDiv!.remove();
  });

  const spinResultNumberElement = gameRootElement.querySelector("h4:nth-of-type(2)")!;

  function getSpinResultNumber() {
    if (spinResultNumberElement.textContent === "0") {
      return 0;
    }
    return parseNumber(spinResultNumberElement.textContent!.slice(0, -1));
  }

  const spinResultRewardElement = gameRootElement.querySelector("h4:nth-of-type(3)")!;

  function getSpinResult() {
    return spinResultRewardElement.textContent!.split(" ")[0];
  }

  const betButtons = gameRootElement.querySelectorAll("button");
  betButtons.forEach((betButton) => {
    betButton.addEventListener("click", () => {
      setTimeout(() => {
        const spinResult = getSpinResult();
        if (spinResult === "lost" && rouletteGuessedSpinsElement.value.trim() !== "") {
          rouletteSpinHistoryElement.value = `${rouletteSpinHistoryElement.value} ${betButton.textContent}`.trim();
        }
        rouletteSpinHistoryElement.value = `${rouletteSpinHistoryElement.value} ${getSpinResultNumber()}`.trim();
        highlightNextGuessedSpin();
      }, 2000);
    });
  });

  function highlightBetButton(number: number) {
    for (const betButton of betButtons) {
      if (parseNumber(betButton.textContent) !== number) {
        betButton.style.backgroundColor = "#333";
        continue;
      }
      betButton.style.backgroundColor = "green";
    }
  }

  function resetBetButtons() {
    for (const betButton of betButtons) {
      betButton.style.backgroundColor = "#333";
    }
  }

  function highlightNextGuessedSpin() {
    const guessedSpins = rouletteGuessedSpinsElement.value.trim();
    const spinHistory = rouletteSpinHistoryElement.value.trim();
    if (guessedSpins === "" || spinHistory === "") {
      resetBetButtons();
      return;
    }
    const remainingGuessedSpins = guessedSpins.replace(spinHistory, "").trim().split(" ");
    if (remainingGuessedSpins.length === 0) {
      resetBetButtons();
      return;
    }
    highlightBetButton(parseNumber(remainingGuessedSpins[0]));
  }

  // Reset
  resetBetButtons();
}

export async function main(ns: NS) {
  ns.disableLog("ALL");
  ns.ui.openTail();
  ns.clearLog();

  doc = eval("document");
  root = doc.querySelector("#root")!;
  gameRootElement = doc.querySelector("#root > div:nth-of-type(2) > div:nth-of-type(2)")!;

  assistRoulette(ns);
}

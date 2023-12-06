import {NS} from "@ns";
import {NetscriptExtension} from "/libs/NetscriptExtension";

/**
 * @deprecated Not optimized
 *
 * @param input
 */
function isPrimeNumberNotOptimized(input: number): boolean {
    if (input === 2) {
        return true;
    }
    if (input <= 1 || input % 2 === 0) {
        return false;
    }
    const squareRootOfInput = Math.sqrt(input);
    for (let i = 3; i <= squareRootOfInput; i += 2) {
        if (input % i === 0) {
            return false;
        }
    }
    return true;
}

function isPrimeNumber(input: number): boolean {
    if (input === 2 || input === 3) {
        return true;
    }
    if (input <= 1 || input % 2 === 0 || input % 3 === 0) {
        return false;
    }
    const squareRootOfInput = Math.sqrt(input);
    // All primes greater than 3 are of the form 6k±1
    // This loop represent all numbers greater than or equals to 5 and in the form of 6k-1
    for (let potentialPrimeInFormOf6kMinus1 = 5; potentialPrimeInFormOf6kMinus1 <= squareRootOfInput; potentialPrimeInFormOf6kMinus1 += 6) {
        if (((input % potentialPrimeInFormOf6kMinus1) === 0) || ((input % (potentialPrimeInFormOf6kMinus1 + 2)) === 0)) {
            // Input is a composite number which is a product of primes greater than 3. Its prime factor(s) is/are
            // (potentialPrimeInFormOf6kMinus1) or (potentialPrimeInFormOf6kMinus1 + 2)
            return false;
        }
    }
    return true;
}

function findLargestPrimeFactor(input: number) {
    let largestPrime = -1;
    while (input % 2 === 0) {
        largestPrime = 2;
        input /= 2;
    }
    while (input % 3 === 0) {
        largestPrime = 3;
        input /= 3;
    }
    const squareRootOfInput = Math.sqrt(input);
    for (let potentialPrimeInFormOf6kMinus1 = 5; potentialPrimeInFormOf6kMinus1 <= squareRootOfInput; potentialPrimeInFormOf6kMinus1 += 6) {
        while (input % potentialPrimeInFormOf6kMinus1 === 0) {
            largestPrime = potentialPrimeInFormOf6kMinus1;
            input /= potentialPrimeInFormOf6kMinus1;
        }
        while (input % (potentialPrimeInFormOf6kMinus1 + 2) === 0) {
            largestPrime = potentialPrimeInFormOf6kMinus1 + 2;
            input /= (potentialPrimeInFormOf6kMinus1 + 2);
        }
    }
    if (input > 4) {
        largestPrime = input;
    }
    return largestPrime;
}

enum ContractType {
    // noinspection JSNonASCIINames
    "Find Largest Prime Factor",
    "Subarray with Maximum Sum",
    "Total Ways to Sum",
    "Total Ways to Sum II",
    "Spiralize Matrix",
    "Array Jumping Game",
    "Array Jumping Game II",
    "Merge Overlapping Intervals",
    "Generate IP Addresses",
    "Algorithmic Stock Trader I",
    "Algorithmic Stock Trader II",
    "Algorithmic Stock Trader III",
    "Algorithmic Stock Trader IV",
    "Minimum Path Sum in a Triangle",
    "Unique Paths in a Grid I",
    "Unique Paths in a Grid II",
    "Shortest Path in a Grid",
    "Sanitize Parentheses in Expression",
    "Find All Valid Math Expressions",
    "HammingCodes: Integer to Encoded Binary",
    "HammingCodes: Encoded Binary to Integer",
    "Proper 2-Coloring of a Graph",
    "Compression I: RLE Compression",
    "Compression II: LZ Decompression",
    "Compression III: LZ Compression",
    "Encryption I: Caesar Cipher",
    "Encryption II: Vigenère Cipher"
}

function contractTypeToString(contractType: ContractType): string {
    return ContractType[contractType];
}

let nsx: NetscriptExtension;

export async function main(ns: NS): Promise<void> {
    nsx = new NetscriptExtension(ns);

    ns.disableLog("ALL");
    ns.clearLog();
    ns.tail();

    nsx.scanBFS("home", host => {
        const filenames = ns.ls(host.hostname, ".cct");
        filenames.forEach(filename => {
            const contractType = ns.codingcontract.getContractType(filename, host.hostname);
            // ns.print(`${host.hostname} - ${filename} - ${contractType}`);
            // ns.print(ns.codingcontract.getDescription(filename, host.hostname));
            switch (contractType) {
                case contractTypeToString(ContractType["Find Largest Prime Factor"]):
                    const input = ns.codingcontract.getData(filename, host.hostname);
                    ns.print(`Input: ${input}`);
                    const output = findLargestPrimeFactor(input);
                    ns.print(`Output: ${output}`);
                    const result = ns.codingcontract.attempt(output, filename, host.hostname);
                    ns.print(result !== "" ? `Success. Reward: ${result}` : "Fail");
                    break;
            }
        });
    });
}

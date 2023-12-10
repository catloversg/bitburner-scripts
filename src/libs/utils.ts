export function assertIsNumber(value: unknown, errorMessage = "Not a number"): asserts value is number {
    if (typeof value !== "number") {
        throw new Error(errorMessage);
    }
}

export function assertIsString(value: unknown, errorMessage = "Not a string"): asserts value is string {
    if (typeof value !== "string") {
        throw new Error(errorMessage);
    }
}

export function removeItemFromArray<T>(array: T[], item: T) {
    array.forEach((value, index) => {
        if (value === item) {
            array.splice(index, 1);
        }
    });
}

/**
 * Return NaN if input is:
 * - undefined
 * - null
 * - empty string ("")
 * @param input
 */
export function parseNumber(input: number | string | null | undefined) {
    // Number(undefined) is NaN, so we don't have to handle that case
    if (input === null || input === "") {
        return NaN;
    }
    return Number(input);
}

//-------------------------------------------------- Random functions --------------------------------------------------
// Ref 1: https://dimitri.xyz/random-ints-from-random-bits/
// Ref 2: https://github.com/nodejs/node/blob/main/lib/internal/crypto/random.js

/**
 * @param {Number} range
 * @returns {Number} Returned value is in interval [0, range)
 */
function getRandomIntegerLessThan(range: number): number {
    // 32 bit maximum
    const maxRange = 4294967296;  // 2^32
    /* extended range rejection sampling */
    const randLimit = maxRange - (maxRange % range);
    let sample;
    let count = 0;
    const maxIter = 100;
    do {
        sample = self.crypto.getRandomValues(new Uint32Array(1))[0];
        if (count >= maxIter) {
            throw new Error("Too many iterations. Check your source of randomness.");
        }
        count++;
    } while (sample >= randLimit);
    return sample % range;
}

/**
 * @param {Number} min
 * @param {Number} max
 * @returns {Number} Returned value is in interval [low, high)
 */
function getRandomInteger(min: number, max: number): number {
    if (min > max) {
        throw new Error(`Min is larger than max. Min: ${min}. Max: ${max}.`);
    }
    if (min === 0 && max === 0) {
        throw new Error(`Invalid range. Min and max must not be both 0.`);
    }
    return (min + getRandomIntegerLessThan(max - min));
}

//-------------------------------------------------- Random functions --------------------------------------------------

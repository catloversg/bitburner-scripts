module.exports = {
    extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        // "plugin:@typescript-eslint/recommended-type-checked"
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
        project: true,
        tsconfigRootDir: __dirname,
    },
    plugins: [
        "@typescript-eslint"
    ],
    root: true,
    reportUnusedDisableDirectives: true,
    ignorePatterns: [
        "dist/**",
        "NetscriptDefinitions.d.ts",
        "tools/**",
        "src/libs/paths/*.ts",
        "src/libs/acorn.js",
        "src/libs/Alglib.js",
        "src/libs/Ceres.js",
        "src/libs/comlink.d.ts",
        "src/libs/comlink.js",
        "src/libs/heap.js",
        "src/libs/priorityQueue.js",
        "src/libs/protocol.d.ts",
        "src/libs/Record.ts",
        "src/libs/RNG.ts",
        "src/libs/walk.js",
    ],
    overrides: [
        {
            files: [
                "src/**/*.ts"
            ],
            rules: {
                "@typescript-eslint/no-explicit-any": "warn",
                "@typescript-eslint/no-unused-vars": "warn",
                "no-constant-condition": "off",
            }
        },
        {
            files: [
                "src/libs/utils.ts"
            ],
            rules: {
                "@typescript-eslint/no-unused-vars": "off",
            }
        },
        {
            files: [
                "src/exploits.ts"
            ],
            rules: {
                "@typescript-eslint/no-unused-vars": "off",
            }
        },
    ]
};

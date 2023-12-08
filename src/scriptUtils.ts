import {NS} from "@ns";
import * as acorn from "/libs/acorn";
import * as walk from "/libs/walk";
import {hasScriptExtension, resolveScriptFilePath, ScriptFilePath} from "/libs/paths/ScriptFilePath";
import {root} from "/libs/paths/Directory";

class Script {
    public filename: ScriptFilePath;
    public code: string;
    public blobUrl?: string;

    constructor(filename: ScriptFilePath, code: string) {
        this.filename = filename;
        this.code = code;
    }
}

interface ImportNode {
    filename: string;
    start: number;
    end: number;
}

const homeScripts = new Map<ScriptFilePath, Script>();

export function generateBlobUrl(ns: NS, scriptFilePath: ScriptFilePath): string {
    ns.ls("home")
        .filter(filename => hasScriptExtension(filename))
        .forEach(filename => {
            const scriptPath = filename as ScriptFilePath;
            if (!homeScripts.has(scriptPath)) {
                homeScripts.set(scriptPath, new Script(scriptPath, ns.read(filename)));
            }
        });
    const script = homeScripts.get(scriptFilePath);
    if (!script) {
        throw new Error(`Invalid script path: ${scriptFilePath}`);
    }
    return generateBlobUrlForScript(ns, script, homeScripts);
}

function generateBlobUrlForScript(ns: NS, script: Script, scripts: Map<ScriptFilePath, Script>): string {
    if (script.blobUrl) {
        return script.blobUrl;
    }

    const ast = acorn.parse(script.code, {sourceType: "module", ecmaVersion: "latest", ranges: true});
    const importNodes: ImportNode[] = [];
    walk.simple(ast, {
        ImportDeclaration(node: any) {
            if (!node.source) {
                return;
            }
            importNodes.push({
                filename: node.source.value,
                start: node.source.range[0] + 1,
                end: node.source.range[1] - 1,
            });
        },
        ExportNamedDeclaration(node: any) {
            if (!node.source) {
                return;
            }
            importNodes.push({
                filename: node.source.value,
                start: node.source.range[0] + 1,
                end: node.source.range[1] - 1,
            });
        },
        ExportAllDeclaration(node: any) {
            if (!node.source) {
                return;
            }
            importNodes.push({
                filename: node.source.value,
                start: node.source.range[0] + 1,
                end: node.source.range[1] - 1,
            });
        },
    });
    importNodes.sort((a, b) => b.start - a.start);
    let newCode = script.code;
    for (const node of importNodes) {
        const filename = resolveScriptFilePath(node.filename, root, ".js");
        if (!filename) {
            throw new Error(`Failed to parse import: ${node.filename}`);
        }
        let importedScript = scripts.get(filename);
        if (!importedScript) {
            throw new Error(`Invalid script path: ${filename}`);
        }
        importedScript.blobUrl = generateBlobUrlForScript(ns, importedScript, scripts);
        newCode = newCode.substring(0, node.start) + importedScript.blobUrl + newCode.substring(node.end);
    }
    const adjustedCode = newCode + `\n//# sourceURL=home/${script.filename}`;
    const blobUrl = URL.createObjectURL(new Blob([adjustedCode], {type: "text/javascript"}));
    script.blobUrl = blobUrl;
    return blobUrl;
}

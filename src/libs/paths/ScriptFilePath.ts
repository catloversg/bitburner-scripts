import {Directory} from "/libs/paths/Directory";
import {FilePath, resolveFilePath} from "/libs/paths/FilePath";

/** Type for just checking a .js extension with no other verification*/
type WithScriptExtension = string & { __fileType: "Script"; };
/** Type for a valid absolute FilePath with a script extension */
export type ScriptFilePath = FilePath & WithScriptExtension;

/** Valid extensions. Used for some error messaging. */
export type ScriptExtension = ".js" | ".script";
export const validScriptExtensions: ScriptExtension[] = [".js", ".script"];

/** Sanitize a player input, resolve any relative paths, and for imports add the correct extension if missing
 * @param path The player-provided path to a file. Can contain relative parts.
 * @param base The base
 */
export function resolveScriptFilePath(
    path: string,
    base = "" as FilePath | Directory,
    extensionToAdd?: ScriptExtension,
): ScriptFilePath | null {
    if (extensionToAdd && !path.endsWith(extensionToAdd)) path = path + extensionToAdd;
    const result = resolveFilePath(path, base);
    return result && hasScriptExtension(result) ? result : null;
}

/** Just check extension */
export function hasScriptExtension(path: string): path is WithScriptExtension {
    return validScriptExtensions.some((extension) => path.endsWith(extension));
}

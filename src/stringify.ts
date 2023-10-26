type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

enum JSON_TYPE {
    STRING,
    NUMBER,
    BOOLEAN,
    NULL,
    ARRAY,
    OBJECT
}

const primitiveTypes = {
    "string": JSON_TYPE.STRING,
    "number": JSON_TYPE.NUMBER,
    "boolean": JSON_TYPE.BOOLEAN
};
function objectTypes(value: null | Json[] | { [key: string]: Json }): JSON_TYPE {
    if (value === null) return JSON_TYPE.NULL;
    const proto = Object.getPrototypeOf(value);
    if (proto === Array.prototype) return JSON_TYPE.ARRAY;
    if (proto === Object.prototype) return JSON_TYPE.OBJECT;
    throw new Error("unreachable");
}


function replacement(character: string) {
    switch (character) {
        case '"':
        case "'":
        case '\\':
            return '\\' + character
        case '\n':
            return '\\n'
        case '\r':
            return '\\r'
        case '\u2028':
            return '\\u2028'
        case '\u2029':
            return '\\u2029'
        default:
            throw new Error("unreachable")
    }
}

function escapeString(string: string) {
    return string.replace(/["'\\\n\r\u2028\u2029]/g, replacement)
}

function getType(value: Json): JSON_TYPE {
    const type = (typeof value) as "string" | "number" | "boolean" | "object";
    ///@ts-ignore
    return primitiveTypes[type] ?? objectTypes(value);
}

function canonical_inner(value: Json, spaces: number, depth: number): string {
    const prefix = " ".repeat(spaces);
    const eol = (spaces == 0 ? "" : "\n");
    const padding = " ".repeat(spaces * depth);

    switch (getType(value)) {
        case JSON_TYPE.STRING: {
            return `"${escapeString(value as string)}"`;
        }
        case JSON_TYPE.NUMBER:
        case JSON_TYPE.NULL:
        case JSON_TYPE.BOOLEAN: {
            return `${value}`
        }
        case JSON_TYPE.ARRAY: {
            const self = value as Json[];
            const container: string[] = [];
            for (const value of self) {
                container.push(`${padding}${canonical_inner(value, spaces, depth + 1)}`)
            }
            return `[${eol}${prefix}${container.join(`,${eol}${prefix}`)}${eol}${padding}]`
        }
        case JSON_TYPE.OBJECT: {
            const self = value as { [key: string]: Json };
            const keys = Object.keys(self);
            keys.sort();
            const container: string[] = [];
            for (const key of keys) {
                container.push(`${padding}"${escapeString(key)}": ${canonical_inner(self[key], spaces, depth + 1)}`)
            }
            return `{${eol}${prefix}${container.join(`,${eol}${prefix}`)}${eol}${padding}}`
        }
        default: throw new Error("unreachable")
    }
}

function lua_inner(value: Json, spaces: number, depth: number): string {
    const prefix = " ".repeat(spaces);
    const eol = (spaces == 0 ? "" : "\n");
    const padding = " ".repeat(spaces * depth);

    switch (getType(value)) {
        case JSON_TYPE.STRING: {
            return `"${escapeString(value as string)}"`;
        }
        case JSON_TYPE.NUMBER:
        case JSON_TYPE.BOOLEAN: {
            return `${value}`
        }
        case JSON_TYPE.NULL: {
            return `nil`;
        }
        case JSON_TYPE.ARRAY: {
            const self = value as Json[];
            const container: string[] = [];
            for (const value of self) {
                container.push(`${padding}${lua_inner(value, spaces, depth + 1)}`)
            }
            return `{${eol}${prefix}${container.join(`,${eol}${prefix}`)}${eol}${padding}}`
        }
        case JSON_TYPE.OBJECT: {
            const self = value as { [key: string]: Json };
            const container: string[] = [];
            for (const key in self) {
                container.push(`${padding}["${escapeString(key)}"] = ${lua_inner(self[key], spaces, depth + 1)}`)
            }
            return `{${eol}${prefix}${container.join(`,${eol}${prefix}`)}${eol}${padding}}`
        }
        default: throw new Error("unreachable")
    }
}

export function canonical(value: Json, spaces: number = 0): string {
    return canonical_inner(value, spaces, 0);
}

export function lua(value: Json, spaces: number = 0): string {
    return lua_inner(value, spaces, 0);
}
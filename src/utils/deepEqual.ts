type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

enum JSON_TYPE {
    string,
    number,
    object,
    array,
    boolean,
    null
}

function getType(value: Json): JSON_TYPE {
    switch (typeof value) {
        case "string":
            return JSON_TYPE.string;
        case "number":
            return JSON_TYPE.number;
        case "boolean":
            return JSON_TYPE.boolean;
        case "object":
            if (value === null) return JSON_TYPE.null;
            if (Array.isArray(value)) return JSON_TYPE.array;
            return JSON_TYPE.object;

        default: throw new Error("unreachable");
    }
}

function deepEqualObjects(actual: { [key: string]: Json }, expected: { [key: string]: Json }): boolean {
    const l = Object.keys(expected).length;
    let i = 0;
    for (const key in actual) {
        if (!(key in expected)) return false;
        if (!deepEqual(actual[key], expected[key])) return false
        i++;
    }
    return i == l;
}

function deepEqualArray(actual: Json[], expected: Json[]): boolean {
    if (actual.length !== expected.length) return false;
    for (let i = 0; i < actual.length; i++) {
        if (!deepEqual(actual[i], expected[i])) return false;
    }
    return true;
}

function deepEqual(actual: Json, expected: Json): boolean {
    const type = getType(actual);
    if (type !== getType(expected)) return false;
    switch (type) {
        case JSON_TYPE.string:
        case JSON_TYPE.number:
        case JSON_TYPE.boolean:
        case JSON_TYPE.null:
            return actual === expected;
        case JSON_TYPE.object:
            return deepEqualObjects(actual as { [key: string]: Json }, expected as { [key: string]: Json })
        case JSON_TYPE.array:
            return deepEqualArray(actual as Json[], expected as Json[]);
        default: throw new TypeError("unexpected type");
    }

}

const wrap = deepEqual as (actual: unknown, expected: unknown) => boolean;

export {
    wrap as deepEqual
}
import "dotenv/config";

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import cliProgress from "cli-progress";
import colors from "ansi-colors";

import { logger } from "../logger.js";
import { deepEqual } from "../utils/deepEqual.js";
import { Client } from "../client/v1.js";

/**
 * @param { any } err
 * @returns { never } 
 */
function __throw(err){ throw err; }

/**
 * @template T
 * @param { Promise<any> } promise 
 * @param { T } value 
 * @returns { Promise<T> }
 */
async function __await(promise, value) {
    await promise;
    return value;
}

const IMAGE_TEMPLATE = await readFile("./image_template.txt", "utf-8");

/**@type { Record<string, string> } */
const MIME_TO_EXT = {
    "image/jpeg": "jpeg"
}

const iconsData = (await getIconsData()).filter(({imagePath}) => imagePath !== undefined);

const progressBar = new cliProgress.MultiBar({}, cliProgress.Presets.shades_classic);

const imageUpdateBarState = {
    green: 0,
    yellow: 0,
    gray: 0
}
const dataUpdateBarState = {
    green: 0,
    yellow: 0,
    gray: 0
}

const imageUpdateBar = progressBar.create(iconsData.length, 0, imageUpdateBarState, {
    format: `updating images: [{bar}] {percentage}% | ${colors.green("{green}")}:${colors.yellow("{yellow}")}:${colors.gray("{gray}")} | {value}/{total} `
});
const dataUpdateBar = progressBar.create(iconsData.length, 0, dataUpdateBarState, {
    format: `updating data:   [{bar}] {percentage}% | ${colors.green("{green}")}:${colors.yellow("{yellow}")}:${colors.gray("{gray}")} | {value}/{total} `
});

const setsData = await getSetsData();
/**@type { Map<number, { mime: string, sha1: string, body: ArrayBuffer }> } */
const imageQueue = new Map();



const client = new Client(`https://${process.env.realm}.fandom.com/api.php`);
{
    const data = await client.logIn(
        process.env.user ?? __throw(new ReferenceError("'user' env variable is not defined")),
        process.env.password ?? __throw(new ReferenceError("'password' env variable is not defined"))
    );
    if ("error" in data) throw new Error(JSON.stringify(data.error));
    if (data.login.result != "Success") throw new Error(data.login.reason)
}

/**
 * @param { RawRiotIconEntry } entry 
 */
async function processIconEntry(entry) {
    const [
        current, icon
    ] = await Promise.all([
        getCurentIconData(entry.id),
        getIcon(entry.id)
    ]);
    imageQueue.set(entry.id, icon);

    const data = processRawIconEntry(entry, icon.mime)
    
    if (current === null) {
        //missing
        await uploadData(data, entry);
        dataUpdateBarState.gray++
        dataUpdateBar.increment(1)
        logger.log(`data ${entry.id} new`);
    } else if (!deepEqual(current, data)) {
        //outdated
        await updateData(data, entry);
        dataUpdateBarState.yellow++
        dataUpdateBar.increment(1)
        logger.log(`data ${entry.id} update`);
    } else {
        //fine
        dataUpdateBarState.green++
        dataUpdateBar.increment(1)
        logger.log(`data ${entry.id} fine`);
    }
    if (imageQueue.size >= 50) {
        await checkImages(imageQueue);
    }
}

/**
 * 
 * @param { Map<number, { mime: string, sha1: string, body: ArrayBuffer, filename?: string }> } queue 
 */
async function checkImages(queue) {
    let max = 50;
    /**@type { Map<number, { mime: string, sha1: string, body: ArrayBuffer, filename: string }> } */
    const slice = new Map()
    for (const [id, entry] of queue) {
        if (max-- <= 0) break;
        if (!(entry.mime in MIME_TO_EXT)) throw new Error(`unexpected mime (${entry.mime})`);
        const ext = MIME_TO_EXT[entry.mime];
        entry.filename = `Profile-Icons-V1-${id}.${ext}`;
        slice.set(id, /**@type { any }*/(entry));
    }
    for (const id of slice.keys()) queue.delete(id);

    const data = await client.getImageInfo(Array.from(slice.values()).map(({filename}) => `File:${filename}`));
    if ("error" in data) {
        debugger;
        throw new Error(JSON.stringify(data.error));
    }
    const integrity = data.query.pages.reduce(function(accum, value){
        if (!value.missing) accum.set(value.title.substring(/* "File:".length */ 5 ), value.imageinfo[0].sha1);
        return accum;
    }, /**@type { Map<string, string> }*/(new Map()));
    
    for (const [id, { filename, body, sha1: newIntegrity}] of slice) {
        const oldIntegrity = integrity.get(filename);
        
        if (oldIntegrity == undefined) {
            //missing
            const resp = await uploadImage(body, filename, IMAGE_TEMPLATE);
            if ("error" in resp) {
                if (resp.error.code === "fileexists-no-change") {
                    logger.log(`file-exists-no-change (id: ${id})`);
                } else {
                    debugger;
                    throw new Error(JSON.stringify(resp.error));
                }
            } else {
                if (
                    resp.upload.result == "Warning" &&
                    "duplicate" in resp.upload.warnings &&
                    Object.keys(resp.upload.warnings).length == 1
                ) {
                    const resp = await uploadImage(body, filename, IMAGE_TEMPLATE, true);
                    if ("error" in resp) if (resp.error.code === "fileexists-no-change") {
                        logger.log(`file-exists-no-change (id: ${id})`);
                    } else {
                        debugger;
                        throw new Error(JSON.stringify(resp.error));
                    }
                }
            }

            imageUpdateBarState.gray++;
            imageUpdateBar.increment(1)
            logger.log(`image ${id} new`);
        } else if (newIntegrity !== oldIntegrity) {
            //outdated
            const resp = await uploadImage(body, filename, IMAGE_TEMPLATE, true);
            if ("error" in resp) if (resp.error.code === "fileexists-no-change") {
                logger.log(`file-exists-no-change (id: ${id})`);
            } else {
                debugger;
                throw new Error(JSON.stringify(resp.error));
            }
            imageUpdateBarState.yellow++;
            imageUpdateBar.increment(1)
            logger.log(`image ${id} update`);
        } else {
            imageUpdateBarState.green++;
            imageUpdateBar.increment(1)
            logger.log(`image ${id} fine`);
            //fine
        }

        queue.delete(id);
    }
}

/**
 * @param { ArrayBuffer } file 
 * @param { string } name 
 * @param { string } [content] 
 * @param { boolean } [forced] 
 */
async function uploadImage(file, name, content, forced){
    let attemptsLimit = 2;
    /**@type { Awaited<ReturnType<Client["uploadFile"]>> } */
    let resp;
    do {
        resp = await client.uploadFile(file, name, content, forced);
        if (!("error" in resp) || resp.error.code !== "readonly") break;
        logger.log(resp.error.readonlyreason);
        await sleep(1000 * 60 * 2);
    } while (attemptsLimit-- > 0);
    return resp
}

/**
 * @param { RiotIconEntry } data 
 * @param { RawRiotIconEntry } entry 
 */
async function uploadData(data, entry) {
    let attemptsLimit = 2;
    const name = `Module:Profile-Icons/V1/icon/${entry.id}.json`
    const text = JSON.stringify(data);
    /**@type { Awaited<ReturnType<Client["updateOrCreatePage"]>> } */
    let resp;
    do {
        resp = await client.updateOrCreatePage(name, text);
        if (!("error" in resp) || resp.error.code !== "readonly") break;
        logger.log(resp.error.readonlyreason);
        await sleep(1000 * 60 * 2);
    } while (attemptsLimit-- > 0);
    if ("error" in resp) {
        debugger
        throw new Error(JSON.stringify(resp.error));
    }
    if (resp.edit.result != "Success") {
        debugger
        throw new Error(JSON.stringify(resp.edit));
    }
    if ("nochange" in resp.edit) {
        logger.log(`data-exists-no-change (id: ${entry.id})`)
    }
    logger.log(`data ${entry.id} new`);
}

/**
 * @param { RiotIconEntry } data 
 * @param { RawRiotIconEntry } entry 
 */
async function updateData(data, entry) {
    let attemptsLimit = 2;
    
    const name = `Module:Profile-Icons/V1/icon/${entry.id}.json`
    const text = JSON.stringify(data);
    /**@type { Awaited<ReturnType<Client["updatePage"]>> } */
    let resp;
    do {
        resp = await client.updatePage(name, text);
        if (!("error" in resp) || resp.error.code !== "readonly") break;
        logger.log(resp.error.readonlyreason);
        await sleep(1000 * 60 * 2);
    } while (attemptsLimit-- > 0);
    if ("error" in resp) {
        debugger
        throw new Error(JSON.stringify(resp.error));
    }
    if (resp.edit.result != "Success") {
        debugger
        throw new Error(JSON.stringify(resp.edit));
    }
    if ("nochange" in resp.edit) {
        logger.log(`data-exists-no-change (id: ${entry.id})`)
    }
    logger.log(`data ${entry.id} update`);
}

/**
 * @param { number } ms 
 * @returns { Promise<void> }
 */
function sleep(ms) {
    return new Promise(function (resolve){ setTimeout(resolve, ms) });
}

/**
 * @returns { Promise<RawRiotIconEntry[]> }
 */
async function getIconsData() {
    const resp = await fetch("https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icons.json");
    const data = await resp.json();
    return data;
}

async function getSetsData() {
    const resp = await fetch("https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icon-sets.json");
    /**@type { { displayName: string; icons: number[]; }[] } */
    const data = await resp.json();
    /**@type { Map<number, string[]> } */
    const binding = new Map();

    for (const { displayName, icons } of data) {
        for (const id of icons) {
            let container = binding.get(id);
            if (container == undefined) {
                container = [];
                binding.set(id, container);
            }
            if (!container.includes(displayName)) container.push(displayName);
        }
    }
    return binding;
}

/**
 * @param { number } id 
 * @returns { Promise<{ mime: string, sha1: string, body: ArrayBuffer }> }
 */
async function getIcon(id) {
    const resp = await fetch(`https://cdn.communitydragon.org/latest/profile-icon/${id}`);
    if (resp.ok !== true) throw new Error(resp.statusText, { cause: "cdn.communitydragon.org" });
    const mime = resp.headers.get("Content-Type") ?? __throw(new Error("Unreachable"));
    // if (!(mime in MIME_TO_EXT)) 
    const body = await resp.arrayBuffer()
    const sha1 = createHash("sha1").update(new Uint8Array(body)).digest("hex");

    return { body, mime, sha1 }
}

/**
 * @param { number } id 
 * @returns { Promise<RawRiotIconEntry | null> }
 */
async function getCurentIconData(id) {
    const controller = new AbortController();
    const resp = await fetch(`https://${process.env.realm}.fandom.com/wiki/Module:Profile-Icons/V1/icon/${id}.json?action=raw`, { signal: controller.signal });
    if (resp.status == 404) {
        controller.abort();
        return null;
    }
    if (!resp.ok) throw new Error(resp.statusText, { cause: `${process.env.realm}.fandom.com` });
    return await resp.json();
}

/**
 * 
 * @param { RawRiotIconEntry } raw 
 * @param { string } mime 
 * @returns { RiotIconEntry }
 */
function processRawIconEntry(raw, mime) {
    const { imagePath, descriptions, rarities, ...data } = raw;

    return Object.assign(data, {
        sets: setsData.get(data.id) ?? [],
        image: { mime: mime },
        descriptions: descriptions.reduce(function(accum, { region: key, ...value }) {
            accum[key] = value;
            return accum
        }, /**@type { RiotIconEntry["descriptions"] }*/({})),
        rarities: rarities.reduce(function(accum, { region: key, ...value }) {
            accum[key] = value;
            return accum
        }, /**@type { RiotIconEntry["rarities"] }*/({}))
    });
}

{
    const chunkMaxSize = 3;
    /**@type { RawRiotIconEntry[] } */
    const chunk = [];
    for (const entry of iconsData) {
        chunk.push(entry)
        if (chunk.length >= chunkMaxSize) {
            await Promise.all(chunk.map(processIconEntry));
            chunk.length = 0;
        }
    }
    await Promise.all(chunk.map(processIconEntry));
    await checkImages(imageQueue);
}
{
        /**@type { Promise<number>[] } */
    const bucket = [];
    const iter = iconsData[Symbol.iterator]();
    const bucketSize = 3;
    for (const entry of iter) {
        if (bucket.push(__await(processIconEntry(entry), bucket.length)) >= bucketSize) break;   
    }
    for (const entry of iter) {
        const i = await Promise.race(bucket);
        bucket[i] = __await(processIconEntry(entry), i);
    }
}
progressBar.stop();
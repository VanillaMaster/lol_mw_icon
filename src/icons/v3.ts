import "dotenv/config";

import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

import cliProgress from "cli-progress";
import colors from "ansi-colors";

import { logger } from "../logger.js";
import { deepEqual } from "../utils/deepEqual.js";
import { Client } from "../client/v1.js";

function __throw(err: any): never { throw err; }


const IMAGE_TEMPLATE = await readFile("./image_template.txt", "utf-8");

const MIME_TO_EXT: Record<string, string> = {
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
const imageQueue = new Map<number, { mime: string, sha1: string, body: ArrayBuffer }>();



const client = new Client(`https://${process.env.realm}.fandom.com/api.php`);
{
    const data = await client.logIn(
        process.env.user ?? __throw(new ReferenceError("'user' env variable is not defined")),
        process.env.password ?? __throw(new ReferenceError("'password' env variable is not defined"))
    );
    if ("error" in data) throw new Error(JSON.stringify(data.error));
    if (data.login.result != "Success") throw new Error(data.login.reason)
}

async function processIconEntry(entry: RawRiotIconEntry) {
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

async function checkImages(queue: Map<number, { mime: string, sha1: string, body: ArrayBuffer, filename?: string }>) {
    let max = 50;
    const slice = new Map<number, { mime: string, sha1: string, body: ArrayBuffer, filename: string }>
    for (const [id, entry] of queue) {
        if (max-- <= 0) break;
        if (!(entry.mime in MIME_TO_EXT)) throw new Error(`unexpected mime (${entry.mime})`);
        const ext = MIME_TO_EXT[entry.mime];
        entry.filename = `Profile-Icons-V1-${id}.${ext}`;
        slice.set(id, entry as any);
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
    }, new Map<string, string>());
    
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

async function uploadImage(file: ArrayBuffer, name: string, content?: string, forced?: boolean){
    let attemptsLimit = 2;
    let resp!: Awaited<ReturnType<Client["uploadFile"]>>;
    while (attemptsLimit-- > 0) {
        resp = await client.uploadFile(file, name, content, forced);
        if (!("error" in resp) || resp.error.code !== "readonly") break;
        logger.log(resp.error.readonlyreason);
        await sleep(1000 * 60 * 2);
    }
    return resp
}

async function uploadData(data: RiotIconEntry, entry: RawRiotIconEntry) {
    let attemptsLimit = 2;
    const name = `Module:Profile-Icons/V1/icon/${entry.id}.json`
    const text = JSON.stringify(data);
    let resp!: Awaited<ReturnType<Client["updateOrCreatePage"]>>;
    while (attemptsLimit-- > 0) {
        resp = await client.updateOrCreatePage(name, text);
        if (!("error" in resp) || resp.error.code !== "readonly") break;
        logger.log(resp.error.readonlyreason);
        await sleep(1000 * 60 * 2);
    }
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

async function updateData(data: RiotIconEntry, entry: RawRiotIconEntry) {
    let attemptsLimit = 2;
    
    const name = `Module:Profile-Icons/V1/icon/${entry.id}.json`
    const text = JSON.stringify(data);
    let resp!: Awaited<ReturnType<Client["updatePage"]>>;
    while (attemptsLimit-- > 0) {
        resp = await client.updatePage(name, text);
        if (!("error" in resp) || resp.error.code !== "readonly") break;
        logger.log(resp.error.readonlyreason);
        await sleep(1000 * 60 * 2);
    }
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

function sleep(ms: number) {
    return new Promise<void>(function (resolve){ setTimeout(resolve, ms) });
}

async function getIconsData(): Promise<RawRiotIconEntry[]> {
    const resp = await fetch("https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icons.json");
    const data = await resp.json();
    return data;
}

async function getSetsData() {
    const resp = await fetch("https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icon-sets.json");
    const data: { displayName: string; icons: number[]; }[] = await resp.json();
    const binding = new Map<number, string[]>();

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

async function getIcon(id: number): Promise<{ mime: string, sha1: string, body: ArrayBuffer }> {
    const resp = await fetch(`https://cdn.communitydragon.org/latest/profile-icon/${id}`);
    if (resp.ok !== true) throw new Error(resp.statusText, { cause: "cdn.communitydragon.org" });
    const mime = resp.headers.get("Content-Type")!;
    // if (!(mime in MIME_TO_EXT)) 
    const body = await resp.arrayBuffer()
    const sha1 = createHash("sha1").update(new Uint8Array(body)).digest("hex");

    return { body, mime, sha1 }
}

async function getCurentIconData(id: number): Promise<RawRiotIconEntry | null> {
    const controller = new AbortController();
    const resp = await fetch(`https://${process.env.realm}.fandom.com/wiki/Module:Profile-Icons/V1/icon/${id}.json?action=raw`, { signal: controller.signal });
    if (resp.status == 404) {
        controller.abort();
        return null;
    }
    if (!resp.ok) throw new Error(resp.statusText, { cause: `${process.env.realm}.fandom.com` });
    return await resp.json();
}

function processRawIconEntry(raw: RawRiotIconEntry, mime: string): RiotIconEntry {
    const { imagePath, descriptions, rarities, ...data } = raw;

    return Object.assign(data, {
        sets: setsData.get(data.id) ?? [],
        image: { mime: mime },
        descriptions: descriptions.reduce(function(accum: RiotIconEntry["descriptions"], { region: key, ...value }) {
            accum[key] = value;
            return accum
        }, {}),
        rarities: rarities.reduce(function(accum: RiotIconEntry["rarities"], { region: key, ...value }) {
            accum[key] = value;
            return accum
        }, {})
    });
}

{
    const chunkMaxSize = 3;
    const chunk: any[] = [];
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
progressBar.stop();
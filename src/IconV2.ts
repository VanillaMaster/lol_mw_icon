import "dotenv/config";
import * as Stringify from "./stringify.js"
import cliProgress from "cli-progress";
import { Client } from "./Client.js";
import { createHash } from "node:crypto";
import colors from "ansi-colors";
import { PNGLock } from "./PNGLock.js";
import { readFile } from "node:fs/promises";

const IMAGE_TEMPLATE = await readFile("./image_template.txt", "utf-8");
const LOCKFILE_NAME = "Profile-Icons-V1-lockfile.png"

const MIME_TO_EXT: Record<string, string> = {
    "image/jpeg": "jpeg"
};

type RiotIconEntry = {
    imagePath?: string;
    id: number;
    image?: {
        mime: string;
    },
    descriptions: {
        region: string;
        description: string;
    }[];
    rarities: {
        region: string;
        rarity: number;
    }[];
    sets?: string[];
};


const resp = await fetch("https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icons.json");
const data: RiotIconEntry[] = await resp.json();

const initalLoadBar = new cliProgress.SingleBar({
    format: ` [{bar}] {percentage}% | ${colors.green("{green}")}:${colors.red("{red}")}:${colors.gray("{gray}")} | {value}/{total} `
}, cliProgress.Presets.shades_classic);
const initalLoadBarState = {
    green: 0,
    red: 0,
    gray: 0
}


initalLoadBar.start(data.length, 0, {...initalLoadBarState});

{
    const resp = await fetch("https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icon-sets.json");
    const setInfo: { displayName: string; icons: number[]; }[] = await resp.json();
    const binding = new Map<number, string[]>();
    for (const { displayName, icons } of setInfo) {
        for (const id of icons) {
            let container = binding.get(id);
            if (container == undefined) {
                container = [];
                binding.set(id, container);
            }
            if (!container.includes(displayName)) container.push(displayName);
        }
    }

    const emptyDymmy: string[] = [];
    for (const entry of data) {
        entry.sets = binding.get(entry.id) ?? emptyDymmy;
    }
}

//#region functions

function getImages(chunk: RiotIconEntry[]) {
    return Promise.allSettled(
        chunk.map(
            entry => fetch(`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${entry.id}.jpg`)
            .then(resp => {
                if (!resp.ok) {
                    // initalLoadBarState.red++;
                    // initalLoadBar.increment(1, initalLoadBarState);
                    throw new Error(resp.statusText)
                }
                const mime = resp.headers.get("Content-Type")!.split(";")[0];
                if (!(mime in MIME_TO_EXT)) throw new Error(`unexpected mime (${mime})`);
                entry.image = { mime };
                return resp.arrayBuffer()
            })
            .then(buff => {
                const val = { hash: createHash("md5").update(new Uint8Array(buff)).digest("hex"), id: entry.id };
                // initalLoadBarState.green++;
                // initalLoadBar.increment(1, initalLoadBarState);
                return val;
            })
        )
    );
}

function processImages(data: PromiseSettledResult<{ hash: string; id: number; }>[], lock: PNGLock) {
    for (const result of data) {
        if (result.status == "fulfilled") {
            const { id, hash } = result.value;
            lock.image.set(id, hash);
            
        } else {
            debugger
        }
    }
}

function transformRiotEntery(entry: RiotIconEntry) {
    const { imagePath, ...info } = entry;
    const transform = {
        descriptions: info.descriptions.reduce(function(accum: Record<string, typeof props>, { region, ...props }) {
            accum[region] = props;
            return accum
        }, {}),
        rarities: info.rarities.reduce(function(accum: Record<string, typeof props>, { region, ...props }) {
            accum[region] = props;
            return accum
        }, {})
    }
    return Object.assign(info as Omit<RiotIconEntry, "descriptions" | "rarities">, transform);
}

function processChunk(Chunk: RiotIconEntry[], lock: PNGLock) {
    for (const entry of Chunk) {
        if (!((entry.image?.mime ?? "") in MIME_TO_EXT)) debugger;
        const canonical = Stringify.canonical(transformRiotEntery(entry));
        const hash = createHash("md5").update(canonical).digest("hex");
        lock.data.set(entry.id, hash);
    }
}

function* chunks(source: RiotIconEntry[], maxLength: number) {
    let buffer: RiotIconEntry[] = [];
    for (const entry of source) {
        if ("imagePath" in entry) {
            if (buffer.push(entry) >= maxLength) {
                yield Array.from(buffer);
                buffer.length = 0;
            }
        } else {
            initalLoadBarState.gray++;
            initalLoadBar.increment(1, initalLoadBarState);
        }
    }
    if (buffer.length > 0) yield buffer;
}

async function uploadImage(id: number, mime: string, forced?: boolean, content?: string){
    const resp = await fetch(`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${id}.jpg`)
    const __mime = resp.headers.get("Content-Type")!.split(";")[0];
    if (__mime !== mime) throw new Error(`mime got changed (${mime} => ${__mime})`);
    const buff = await resp.arrayBuffer();

    const name = `Profile-Icons-V1-${id}.${MIME_TO_EXT[mime]}`;
    
    const result = await client.uploadFile_(buff, name, {
        content,
        forced
    });

    if ("error" in result) {
        if (result.error.code == "fileexists-no-change") {
            console.log("fileexists-no-change");
            return
        }
        debugger;
        throw new Error(JSON.stringify(result.error));
    }
    if (result.upload.result != "Success") {
        debugger;
        throw new Error(JSON.stringify(result));
    }

}

async function uploadPage(id: number, entry: RiotIconEntry) {
    const finalEntry = transformRiotEntery(entry);

    const name = `Module:Profile-Icons/V1/icon/${id}`
    const text = `return ${Stringify.lua(finalEntry, 4)}`
    const resp = await client.updateOrCreatePage_(name, text);

    if ("error" in resp) {
        debugger
        throw new Error(JSON.stringify(resp.error));
    }
    if (resp.edit.result != "Success") {
        debugger
        throw new Error(JSON.stringify(resp.edit));
    }
}

async function saveLock(lock: PNGLock) {
    const result = await client.uploadFile_(oldLock.toBuffer(), LOCKFILE_NAME, {
        forced: true
    })
    if ("error" in result) {
        debugger;
        throw new Error(JSON.stringify(result.error)); 
    }
    if (result.upload.result != "Success") {
        debugger;
        throw new Error(JSON.stringify(result.upload)); 
    }
}

//#endregion functions

const concurrency = 10;
const lock = new PNGLock();

{
    const iter = chunks(data, concurrency);
    let { value: prevChunk = [] } = iter.next();
    processImages(await getImages(prevChunk), lock);
    for (const chunk of iter) {
        const promise = getImages(chunk);
        processChunk(prevChunk, lock)
        processImages(await promise, lock);
        prevChunk = chunk;
    }
    processChunk(prevChunk, lock);
}

initalLoadBar.stop();
debugger

const client = new Client(`https://${process.env.realm!}.fandom.com/api.php`);
{
    const data = await client.logIn(process.env.user!, process.env.password!);
    if ("error" in data) {
        throw new Error(JSON.stringify(data.error));
    }
    if (data.login.result != "Success") throw new Error(JSON.stringify(data.login))
}


const oldLock = await (async function (){
    const info = await client.getImageInfo(["File:Profile-Icons-V1-lockfile.png"]);
    if ("error" in info) {
        debugger;
        throw new Error(JSON.stringify(info.error));
    }
    const { query: { pages: [ page ] } } = info;
    if (page.missing) {
        console.log("lock doesnt exists");
        return new PNGLock();
    }
    const sha1 = createHash("sha1").update(new Uint8Array(lock.toBuffer())).digest("hex")
    const { imageinfo: [ oldLockInfo ] } = page;
    if (sha1 == oldLockInfo.sha1) {
        console.log("everything is updated");
        process.exit(0);
    }

    const resp = await fetch(oldLockInfo.url);
    const buff = await resp.arrayBuffer();
    return PNGLock.fromBuffer(buff);
})();

let i = 1;

for (const entry of data) {
    if (!("imagePath" in entry)) continue;
    if (entry.image == undefined) throw new Error("unreachable");
    const id = entry.id;
    
    {
        const mime = entry.image.mime;
        const md5_new = lock.image.get(id);
        if (md5_new == undefined) throw new Error("unreachable");
        const md5_old = oldLock.image.get(id);
        if (md5_old == undefined) {
            // upload new image
            await uploadImage(id, mime, true, IMAGE_TEMPLATE);
            oldLock.image.set(id, md5_new);
            i++;
            console.log("image", id, "new");
        } else if (md5_new != md5_old) {
            //update existing one
            await uploadImage(id, mime, true);
            oldLock.image.set(id, md5_new);
            i++;
            console.log("image", id, "update");
        } else {
            console.log("image", id, "fine");
        }
        
    }
    {
        const md5_new = lock.data.get(id);
        if (md5_new == undefined) throw new Error("unreachable");
        const md5_old = oldLock.data.get(id);
        if (md5_old == undefined) {
            // upload new article
            await uploadPage(id, entry);
            oldLock.data.set(id, md5_new);
            i++;
            console.log("data", id, "new");
        } else if (md5_new != md5_old) {
            //update existing one
            await uploadPage(id, entry);
            oldLock.data.set(id, md5_new);
            i++;
            console.log("data", id, "update");
        } else {
            console.log("data", id, "fine");
        }

    }

    if (i % 100 == 0) {
        console.log("updateing lockfile");
        await saveLock(oldLock);
    }

}

await saveLock(oldLock);
import "dotenv/config"
import cliProgress from "cli-progress";
import { Client } from "../client/v1.js";

const iconsData = (await getIconsData()).filter(({imagePath}) => imagePath !== undefined);

/**@type { Record<number, string[]> } */
const index = {}
const progressBar = new cliProgress.SingleBar({
    format: "[{bar}] {percentage}% | {value}/{total} | concurrency: {concurrency}/{maxconcurrency}"
}, cliProgress.Presets.shades_classic);
const state = {
    concurrency: 0,
    maxconcurrency: 0
}
progressBar.start(iconsData.length, 0, state);

{
    /**@type { Promise<number>[] } */
    const bucket = [];
    const iter = iconsData[Symbol.iterator]();
    const bucketSize = 10;
    for (const entry of iter) {
        state.concurrency++
        state.maxconcurrency++;
        if (bucket.push(__await(processIconEntry(entry), bucket.length)) >= bucketSize) break;   
    }
    for (const entry of iter) {
        const i = await Promise.race(bucket);
        bucket[i] = __await(processIconEntry(entry), i);
    }
    await Promise.all(bucket);
}

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

/**
 * @param { number } timeout 
 * @returns { Promise<void> }
 */
async function sleep(timeout) {
    return new Promise(function(resolve){ setTimeout(resolve, timeout) });
}

/**
 * @returns { Promise<RawRiotIconEntry[]> }
 */
async function getIconsData() {
    const resp = await fetch("https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icons.json");
    const data = await resp.json();
    return data;
}

/**
 * @param { RawRiotIconEntry } entry 
 */
async function processIconEntry(entry) {
    const mime = await getIcon(entry.id);
    progressBar.increment(1);
    (index[entry.id] ??= []).push(mime);
}

/**
 * @param { number } id 
 * @param { number } [depth] 
 * @returns { Promise<string> }
 */
async function getIcon(id, depth = 0) {
    /**@type { Response } */
    let resp;
    try {
        resp = await fetch(`https://cdn.communitydragon.org/latest/profile-icon/${id}`, {
            method: "HEAD"
        });
    } catch (error) {
        if (
            error instanceof TypeError &&
            error.cause instanceof Object &&
            "code" in error.cause &&
            error.cause.code == "UND_ERR_CONNECT_TIMEOUT"
        ) {
            if (++depth > 4) throw new Error("failed to fetch", { cause: error });
            state.concurrency--
            await sleep(15_000);
            state.concurrency++
            return getIcon(id, depth)        
        }
        throw error;
    }
    if (!resp.ok) {
        if (++depth > 4) throw new Error(resp.statusText, { cause: "cdn.communitydragon.org" });
        state.concurrency--
        await sleep(15_000);
        state.concurrency++
        return getIcon(id, depth)
    }
    const mime = resp.headers.get("Content-Type") ?? __throw(new Error("Unreachable"));
    return mime
}
progressBar.stop();

{
    const client = new Client(`https://${process.env.realm}.fandom.com/api.php`);
    {
        const data = await client.logIn(
            process.env.user ?? __throw(new ReferenceError("'user' env variable is not defined")),
            process.env.password ?? __throw(new ReferenceError("'password' env variable is not defined"))
        );
        if ("error" in data) throw new Error(JSON.stringify(data.error));
        if (data.login.result != "Success") throw new Error(data.login.reason)
    }
    
    const data = await client.updateOrCreatePage("Module:Profile-Icons/V1/index.json", JSON.stringify(index));
    if ("error" in data) {
        throw new Error(JSON.stringify(data.error));
    }
    if (data.edit.result != "Success") {
        throw new Error(JSON.stringify(data));
    }
}

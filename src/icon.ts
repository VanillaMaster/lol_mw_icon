import "dotenv/config";
import Bottleneck from "bottleneck";
import * as YAML from "yaml";
import * as Stringify from "./stringify.js"
import cliProgress from "cli-progress";
import { Client } from "./Client.js";
import { createHash } from "node:crypto";
import colors from "ansi-colors";

const STATS = {
    iconsWithoutImage: 0,
    faildToFetch: 0,

    missing: 0,
    uptodate: 0,
    outdate: 0,
    msg: ""
}

const ProgressBarr = new cliProgress.SingleBar({
    clearOnComplete: true,
    stopOnComplete: true,
    // hideCursor: true,
    format: ` [{bar}] {percentage}% | ${colors.green("{uptodate}")}:${colors.yellow("{outdate}")}:${colors.red("{missing}")} | ${colors.gray("{iconsWithoutImage}")}:${colors.blue("{faildToFetch}")} | ETA: {eta}s | {value}/{total} {msg} `,
}, cliProgress.Presets.shades_classic);

/**
 * safe shutdown (ctrl + c)
 */

let __flag__: boolean = true;
let __promise__: Promise<any> = Promise.resolve();
{
    async function onShutdown() {
        ProgressBarr.increment(0, { msg: "| shutting down... "});
        __flag__ = false;
        await __promise__;
    }
    let onShutdownPromsie: Promise<any>;
    process.on("SIGINT", async function() {
        const promise = onShutdownPromsie ?? (onShutdownPromsie = onShutdown())
        await promise;
    })
}

const comment = "doc is auto-generated try to avoid editing it without reason"

const MIME_TO_EXT = {
    "image/jpeg": "jpeg"
}

const resp = await fetch("https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icons.json");
const data: any[] = await resp.json();

const limiter = new Bottleneck({
    minTime: 60_000 / 19,
    maxConcurrent: 1
});

const client = new Client(`https://${process.env.realm!}.fandom.com/api.php`);
{
    const data = await limiter.schedule(() => client.logIn(process.env.user!, process.env.password!))
    if (data?.login?.result != "Success") throw new Error(JSON.stringify(data))
}

ProgressBarr.start(data.length, 0, {...STATS});



let index = 0;
const chunkSize = 50;

const imageData = new Map<string, any>();

while (data.length > (index * chunkSize) && __flag__) {
    const chunk = data.slice((index++ * chunkSize), (index * chunkSize))

    imageData.clear();
    await fetchImages(chunk, imageData);

    const existingImgData = await limiter.schedule(() => client.getImageInfo(Array.from(imageData.keys())));
    const { query: { pages } } = existingImgData;

    for (let i = 0; (i < pages.length) && __flag__; i++) {
        __promise__ = processEntry(pages[i], imageData);
        await __promise__;
        ProgressBarr.increment(1, {...STATS})
    }
}

process.exit();


// console.log("done", STATS);

async function fetchImages(chunk: any[], entries: Map<string, any>) {
    /**
     * fetching not more than 5 at a time;
     */
    while (chunk.length > 0) {
        const subChunk = [];
        for (let i = 0; (i < 5) && chunk.length > 0; i++) {
            subChunk.push(chunk.pop());
        }

        await Promise.all(subChunk.map(async ({ imagePath, ...info})=> {
            
            if (imagePath == undefined) {
                STATS.iconsWithoutImage++;
                // console.log("done");
                ProgressBarr.increment(1, {...STATS})
                // iconsWithoutImage.push(info.id);
                return;
            }

            const resp = await fetch(`https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/profile-icons/${info.id}.jpg`);
            if (!resp.ok) {
                STATS.faildToFetch++;
                // console.log("done");
                ProgressBarr.increment(1, {...STATS})
                // iamgesThatCantBeLoaded.push(info.id)
                return
            }
            const mime = resp.headers.get("Content-Type")!.split(";")[0];
            if (!(mime in MIME_TO_EXT)) {
                debugger
                throw new Error(`unexpected mime (${mime})`);
            }
            info.image = { mime };
            const data = await resp.arrayBuffer();
            const sha1 = createHash("sha1").update(new Uint8Array(data)).digest("hex");
            
            ///@ts-ignore
            const name = `Profile-Icons-V1-${info.id}.${MIME_TO_EXT[mime]}`;
            // const name = `File:Icon-${info.id}.${MIME_TO_EXT[mime]}`
            entries.set(`File:${name}`, { iconInfo: info, imageInfo: { sha1, mime, data, name } });
        }));
    }
}

async function processEntry(page: any, entries: Map<string, any>){
    const { iconInfo, imageInfo } = entries.get(page.title);
    if (page.missing === true) {
        STATS.missing++;
        //upload image
        const token = await limiter.schedule(() => client.getCSRFToken());
        const data = await limiter.schedule(() => client.uploadFile(token, imageInfo.data, imageInfo.name, "== License ==\n{{Fairuse}}\n\n[[Category:Profile-Icons-V1]]", true));
        if ("error" in data) {
            debugger;
            throw new Error(JSON.stringify(data.error));
        }
        if (data.upload.result != "Success") {
            debugger;
            throw new Error(JSON.stringify(data));
        }
        
    } else if (page.imageinfo[0].sha1 === imageInfo.sha1) {
        STATS.uptodate++;
        //nothing to do
    } else {
        STATS.outdate++;
        //update image
        const token = await limiter.schedule(() => client.getCSRFToken());
        const data = await limiter.schedule(() => client.updateFile(token, imageInfo.data, imageInfo.name));
        if ("error" in data) {
            debugger;
            throw new Error(JSON.stringify(data.error));
        }
        if (data.upload.result != "Success") {
            debugger;
            throw new Error(JSON.stringify(data));
        }
        //debugger
    }

    let promise = limiter.schedule(() => client.getPage(`Module:Profile-Icons/V1/icon/${iconInfo.id}/doc`));

    const officialDataHash = createHash("md5").update(Stringify.canonical(iconInfo)).digest("hex");

    const { query: { pages: [ doc ]} } = await promise;

    if (doc.missing === true) {
        //uload
        let token = await limiter.schedule(() => client.getCSRFToken());
        let data = await limiter.schedule(() => client.createPage(token, `Module:Profile-Icons/V1/icon/${iconInfo.id}`, `return ${Stringify.lua(iconInfo, 4)}`));
        if ("error" in data) {
            debugger;
            throw new Error(JSON.stringify(data.error));
        }
        if (data.edit.result != "Success") {
            debugger;
            throw new Error(JSON.stringify(data));
        }

        const doc = new YAML.Document({
            data: {
                md5: officialDataHash
            }
        });
        doc.commentBefore = comment;

        token = await limiter.schedule(() => client.getCSRFToken());
        data = await limiter.schedule(() => client.createPage(token, `Module:Profile-Icons/V1/icon/${iconInfo.id}/doc`, `<pre>\n${doc.toString()}\n</pre>`));
        if ("error" in data) {
            debugger;
            throw new Error(JSON.stringify(data.error));
        }
        if (data.edit.result != "Success") {
            debugger;
            throw new Error(JSON.stringify(data));
        }

    } else {

        const { revisions: [{ slots: { main: { content } } }] } = doc;
        const start: number = content.indexOf("<pre>");
        const end: number = content.indexOf("</pre>");
        const meta = YAML.parse(content.substring(start + 5, end));
        
        if (meta.data.md5 != officialDataHash) {
            //update TODO: make optional
            const doc = new YAML.Document({
                data: {
                    md5: officialDataHash
                }
            });
            doc.commentBefore = comment;
            const token = await limiter.schedule(() => client.getCSRFToken());
            const data = await limiter.schedule(() => client.updatePage(token, `Module:Profile-Icons/V1/icon/${iconInfo.id}/doc`, `<pre>\n${doc.toString()}\n</pre>`));
            if (data.edit.result != "Success") {
                debugger;
                throw new Error(JSON.stringify(data));
            }
        } else {
            //ok
        }
    }
    
}
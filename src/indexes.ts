//@ts-nocheck
import "dotenv/config";

import cliProgress from "cli-progress";
import Bottleneck from "bottleneck";
import * as Stringify from "./stringify.js"
import { Client } from "./Client.js";

const ProgressBarr = new cliProgress.SingleBar({
    clearOnComplete: true,
    stopOnComplete: true
}, cliProgress.Presets.shades_classic);

ProgressBarr.start(7, 0);

const resp = await fetch("https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icons.json");
ProgressBarr.increment()
const data: any[] = await resp.json();
ProgressBarr.increment()

const list: Record<any, any> = {};
const nameIndex: Record<any, any[]> = {};

for (const elem of data) {
    if ("imagePath" in elem) {
        list[elem.id] = elem.id;
        const container = nameIndex[elem.title] ?? (nameIndex[elem.title] = []);
        container.push(elem.id);
    }
}

const limiter = new Bottleneck({
    minTime: 60_000 / 19,
    maxConcurrent: 1
});

//@ts-ignore
const client = new Client(`https://${process.env.realm!}.fandom.com/api.php`);
{
    const data = await limiter.schedule(() => client.logIn(process.env.user!, process.env.password!))
    ProgressBarr.increment()
    if (data?.login?.result != "Success") throw new Error(JSON.stringify(data))
}
{
    const token = await limiter.schedule(() => client.getCSRFToken());
    ProgressBarr.increment()
    const indexText = Stringify.lua(list, 4);
    const data = await limiter.schedule(() => client.updateOrCreatePage(
        token,
        "Module:Profile-Icons/V1/index",
        `return ${indexText}`
    ));
    ProgressBarr.increment()
    if ("error" in data) {
        throw new Error(JSON.stringify(data.error));
    }
    if (data.edit.result != "Success") {
        throw new Error(JSON.stringify(data));
    }
}
{
    const token = await limiter.schedule(() => client.getCSRFToken());
    ProgressBarr.increment()
    const nameIndexText = Stringify.lua(nameIndex, 4);
    const data = await limiter.schedule(() => client.updateOrCreatePage(
        token,
        "Module:Profile-Icons/V1/index/title",
        `return ${nameIndexText}`
    ));
    ProgressBarr.increment()
    if ("error" in data) {
        throw new Error(JSON.stringify(data.error));
    }
    if (data.edit.result != "Success") {
        throw new Error(JSON.stringify(data));
    }
}
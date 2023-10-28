import "dotenv/config";

import cliProgress from "cli-progress";
import Bottleneck from "bottleneck";
import * as Stringify from "./stringify.js"
import { Client } from "./Client.js";

const ProgressBarr = new cliProgress.SingleBar({
    clearOnComplete: true,
    stopOnComplete: true
}, cliProgress.Presets.shades_classic);

const limiter = new Bottleneck({
    minTime: 60_000 / 19,
    maxConcurrent: 1
});

const client = new Client(`https://${process.env.realm!}.fandom.com/api.php`);
{
    const data = await limiter.schedule(() => client.logIn(process.env.user!, process.env.password!))
    ProgressBarr.increment()
    if (data?.login?.result != "Success") throw new Error(JSON.stringify(data))
}

ProgressBarr.start(9, 0);

const resp = await fetch("https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icon-sets.json");
ProgressBarr.increment()
const data: { 
    description: string,
    displayName: string,
    hidden: boolean,
    id: number,
    icons: number[]
}[] = await resp.json();
ProgressBarr.increment()

const sets = [];
const members = [];
const index: Record<number, number[]> = {};

for (let i = 0; i < data.length; i++) {
    const { id: _, icons, ...info } = data[i];
    const iconsTable = icons.reduce((accum, val)=>{
        accum[val] = val;
        return accum;
    },{} as Record<string, number>);
    
    sets.push(info);
    members.push(iconsTable);

    for (const icon of icons) {
        const luaIndex = i+1;
        const container = index[icon] ?? (index[icon] = []);
        if (!container.includes(luaIndex)) container.push(luaIndex)
    }
    
}
ProgressBarr.increment()

{
    const token = await limiter.schedule(() => client.getCSRFToken());
    ProgressBarr.increment()
    const setsText = Stringify.lua(sets, 4);
    const data = await limiter.schedule(() => client.updateOrCreatePage(
        token,
        "Module:Profile-Icons/V1/sets",
        `return ${setsText}`
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
    const membersText = Stringify.lua(members, 4);
    const data = await limiter.schedule(() => client.updateOrCreatePage(
        token,
        "Module:Profile-Icons/V1/sets/members",
        `return ${membersText}`
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
    const indexText = Stringify.lua(index, 4);
    const data = await limiter.schedule(() => client.updateOrCreatePage(
        token,
        "Module:Profile-Icons/V1/sets/index",
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
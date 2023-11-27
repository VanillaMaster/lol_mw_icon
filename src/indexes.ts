import "dotenv/config";
import cliProgress from "cli-progress";
import * as Stringify from "./stringify.js"
import { Client } from "./Client.js";

// const ProgressBarr = new cliProgress.SingleBar({
//     clearOnComplete: true,
//     stopOnComplete: true
// }, cliProgress.Presets.shades_classic);

// ProgressBarr.start(7, 0);

const resp = await fetch("https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icons.json");
// ProgressBarr.increment()
const data: RiotIconEntry[] = await resp.json();
// ProgressBarr.increment()

const list: Record<string, number> = {};
const nameIndex: Record<string, number[]> = {};

for (const elem of data) {
    if ("imagePath" in elem) {
        list[elem.id] = elem.id;
        const container = nameIndex[elem.title] ?? (nameIndex[elem.title] = []);
        container.push(elem.id);
    }
}


const client = new Client(`https://${process.env.realm!}.fandom.com/api.php`);
{
    const data = await client.logIn(process.env.user!, process.env.password!);
    if ("error" in data) {
        throw new Error(JSON.stringify(data.error));
    }
    if (data.login.result != "Success") throw new Error(JSON.stringify(data.login))
    // ProgressBarr.increment()
}

{
    // const token = await limiter.schedule(() => client.getCSRFToken());
    // ProgressBarr.increment()
    const indexText = Stringify.lua(list, 4);
    const data = await client.updateOrCreatePage("Module:Profile-Icons/V1/index", `return ${indexText}`)
    if ("error" in data) {
        throw new Error(JSON.stringify(data.error));
    }
    if (data.edit.result != "Success") {
        throw new Error(JSON.stringify(data));
    }
}
{
    const nameIndexText = Stringify.lua(nameIndex, 4);

    const data = await client.updateOrCreatePage(
        "Module:Profile-Icons/V1/index/title",
        `return ${nameIndexText}`
    );
    if ("error" in data) {
        throw new Error(JSON.stringify(data.error));
    }
    if (data.edit.result != "Success") {
        throw new Error(JSON.stringify(data));
    }
}

console.log("done");

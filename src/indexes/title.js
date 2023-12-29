import "dotenv/config"
import { Client } from "../client/v1.js";

/**
 * @param { any } err
 * @returns { never } 
 */
function __throw(err){ throw err; }

/**
 * @returns { Promise<RawRiotIconEntry[]> }
*/
async function getIconsData() {
    const resp = await fetch("https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icons.json");
    const data = await resp.json();
    return data;
}

const iconsData = (await getIconsData()).filter(({imagePath}) => imagePath !== undefined);

/**@type { Record<string, number[]>} */
const titleIndex = {};

for (const entry of iconsData) {
    (titleIndex[entry.title] ??= []).push(entry.id);
}

const client = new Client(`https://${process.env.realm}.fandom.com/api.php`);

{
    const data = await client.logIn(
        process.env.user ?? __throw(new ReferenceError("'user' env variable is not defined")),
        process.env.password ?? __throw(new ReferenceError("'password' env variable is not defined"))
    );
    if ("error" in data) throw new Error(JSON.stringify(data.error));
    if (data.login.result != "Success") throw new Error(data.login.reason)
}

{
    const data = await client.updateOrCreatePage("Module:Profile-Icons/V1/index.title.json", JSON.stringify(titleIndex));
    if ("error" in data) {
        throw new Error(JSON.stringify(data.error));
    }
    if (data.edit.result != "Success") {
        throw new Error(JSON.stringify(data));
    }
}

console.log("done");
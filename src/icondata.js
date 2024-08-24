/**@import { ValidateFunction } from "ajv" */
import { DatabaseSync } from "node:sqlite"
import { rm, readFile } from "fs/promises"
import { cwd } from "process";
import { join } from "path";
import { Ajv } from "ajv"
import ICON_DATA_SCHEMA from "#schema/summoner-icons.json" with { type: "json" }
import SET_DATA_SCHEMA from "#schema/summoner-icon-sets.json" with { type: "json" }

const ajv = new Ajv();
/**@type { ValidateFunction<RawRiotIconEntry[]> } */
const validateIconData = ajv.compile(ICON_DATA_SCHEMA);
/**@type { ValidateFunction<RawRiotIconSetsEntry[]> } */
const validateSetData = ajv.compile(SET_DATA_SCHEMA);

const ICON_DATA_URL = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icons.json";
const SET_DATA_URL = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global/default/v1/summoner-icon-sets.json";

const [
    rawIconData,
    rawSetData
] = await Promise.all([
    fetch(ICON_DATA_URL).then(res => res.json()),
    fetch(SET_DATA_URL).then(res => res.json())
]);

if (!validateIconData(rawIconData)) throw new Error();
if (!validateSetData(rawSetData)) throw new Error();

const [
    schema,
    iconQuery,
    descriptionQuery,
    rarityQuery,
    disabledRegionQuery,
    setQuery,
    iconSetQuery
] = await Promise.all([
    readFile(join(cwd(), "schema.sql"), "utf8"),
    readFile(join(cwd(), "query/icon.sql"), "utf8"),
    readFile(join(cwd(), "query/description.sql"), "utf8"),
    readFile(join(cwd(), "query/rarity.sql"), "utf8"),
    readFile(join(cwd(), "query/disabledRegion.sql"), "utf8"),
    readFile(join(cwd(), "query/set.sql"), "utf8"),
    readFile(join(cwd(), "query/iconSet.sql"), "utf8")
]);

const DB = await async function (relative) {
    const location = join(cwd(), relative);
    await rm(location, { force: true });
    return new DatabaseSync(location);
}("icons.sqlite");

DB.exec(schema);

const insertIcon = DB.prepare(iconQuery);
const insertDescription = DB.prepare(descriptionQuery);
const insertRarity = DB.prepare(rarityQuery);
const insertDisabledRegion = DB.prepare(disabledRegionQuery);
const insertSet = DB.prepare(setQuery);
const insertIconSet = DB.prepare(iconSetQuery);

DB.exec("BEGIN");

for (const icon of rawIconData) {
    insertIcon.run(
        icon.id,
        icon.title,
        icon.yearReleased,
        Number(icon.isLegacy),
        icon.esportsTeam ?? null,
        icon.esportsRegion ?? null,
        icon.esportsEvent ?? null
    );
    for (const description of icon.descriptions) {
        insertDescription.run(
            icon.id,
            description.region,
            description.description
        );
    }
    for (const rarity of icon.rarities) {
        insertRarity.run(
            icon.id,
            rarity.region,
            rarity.rarity
        );
    }
    for (const disabledRegion of icon.disabledRegions) {
        insertDisabledRegion.run(
            icon.id,
            disabledRegion
        );
    }
}

for (const set of rawSetData) {
    const { id } = /**@type { { id: number } } */ (insertSet.get(
        Number(set.hidden),
        set.displayName,
        set.description
    ));
    for (const icon of new Set(set.icons)) {
        insertIconSet.run(
            icon,
            id
        );
    }
}
DB.exec("COMMIT");
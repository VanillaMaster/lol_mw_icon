BEGIN TRANSACTION;

CREATE TABLE "icons" (
    "id" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "yearReleased" INTEGER NOT NULL,
    "isLegacy" INTEGER NOT NULL,
    "esportsTeam" TEXT,
    "esportsRegion" TEXT,
    "esportsEvent" TEXT,
    PRIMARY KEY ("id")
);

CREATE TABLE "descriptions" (
    "icon" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    PRIMARY KEY ("icon", "region"),
    FOREIGN KEY ("icon") REFERENCES "icons" ("id")
);

CREATE INDEX "descriptionsIndex" on "descriptions" ("icon");

CREATE TABLE "rarities" (
    "icon" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    "rarity" INTEGER NOT NULL,
    PRIMARY KEY ("icon", "region"),
    FOREIGN KEY ("icon") REFERENCES "icons" ("id")
);

CREATE INDEX "raritiesIndex" on "rarities" ("icon");

CREATE TABLE "disabledRegions" (
    "icon" INTEGER NOT NULL,
    "region" TEXT NOT NULL,
    PRIMARY KEY ("icon", "region"),
    FOREIGN KEY ("icon") REFERENCES "icons" ("id")
);

CREATE INDEX "disabledRegionsIndex" on "rarities" ("icon");

CREATE TABLE "sets" (
    "id" INTEGER NOT NULL,
    "hidden" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    PRIMARY KEY ("id" AUTOINCREMENT)
);

CREATE TABLE "iconsSets" (
    "icon" INTEGER NOT NULL,
    "set" INTEGER NOT NULL,
    PRIMARY KEY ("icon", "set"),
    FOREIGN KEY ("icon") REFERENCES "icons" ("id"),
    FOREIGN KEY ("set") REFERENCES "sets" ("id")
);

COMMIT;
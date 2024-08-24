/*
INSERT INTO "sets" (
    "id",
    "hidden",
    "displayName",
    "description"
) VALUES (?, ?, ?, ?);
*/
INSERT INTO "sets" (
    "hidden",
    "displayName",
    "description"
) VALUES (?, ?, ?) RETURNING "id";
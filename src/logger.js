import { createWriteStream } from "node:fs";

const logStram = createWriteStream("./debug.log");
export const logger = new console.Console(logStram, logStram);

#!/usr/bin/env node
import { runCli } from "./cli.js";

const result = await runCli(process.argv.slice(2));
for (const line of result.output) console.log(line);
if (result.json) console.log(JSON.stringify(result.json, null, 2));
process.exit(result.code);

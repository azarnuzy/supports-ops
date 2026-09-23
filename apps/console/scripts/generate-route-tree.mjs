import { Generator, getConfig } from "@tanstack/router-generator";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const config = getConfig({ autoCodeSplitting: true, target: "react" }, root);

await new Generator({ config, root }).run();

import { readFile, writeFile } from "node:fs/promises";

const indexHtml = await readFile("dist/index.html", "utf8");
const fallbackHtml = indexHtml.replace("<head>", '<head>\n    <base href="/30s_Leaderboard/" />');

await writeFile("dist/404.html", fallbackHtml);

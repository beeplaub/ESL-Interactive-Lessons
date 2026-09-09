// Run `node scripts/whiteboard-preview/start.mjs`; use ?student in a second tab.
// This harness never loads .env files or contacts the live database.
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "node:http";
import { execFileSync } from "node:child_process";
const require = createRequire(import.meta.url), root = process.cwd();
const output = mkdtempSync(join(tmpdir(), "brenup-board-"));
writeFileSync(join(output, "loader.cjs"), `const ts=require(${JSON.stringify(require.resolve("typescript"))});module.exports=function(source){return ts.transpileModule(source,{fileName:this.resourcePath,compilerOptions:{jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext,allowJs:true}}).outputText};`);
writeFileSync(join(output, "empty.cjs"), "module.exports=function(){return ''};");
const webpack = require("next/dist/compiled/webpack/webpack"); webpack.init();
await new Promise((done, fail) => webpack.webpack({ mode: "development", devtool: false, entry: resolve("scripts/whiteboard-preview/entry.jsx"), output: { path: output, filename: "bundle.js" }, resolve: { extensions: [".tsx", ".ts", ".jsx", ".js"], modules: [resolve("node_modules")], alias: { "@/lib/supabase/client": resolve("scripts/whiteboard-preview/client.js"), "next/navigation": resolve("scripts/whiteboard-preview/navigation.js"), "@": root } }, module: { rules: [{ test: /\.(tsx?|jsx)$/, use: join(output, "loader.cjs"), exclude: /node_modules/ }, { test: /\.css$/, use: join(output, "empty.cjs") }] }, performance: { hints: false } }, (error, stats) => error || stats.hasErrors() ? fail(error || Error(stats.toString({ all: false, errors: true }))) : done()));
writeFileSync(join(output, "input.css"), "@tailwind base;@tailwind components;@tailwind utilities;");
execFileSync(process.execPath, [resolve("node_modules/tailwindcss/lib/cli.js"), "-i", join(output, "input.css"), "-o", join(output, "tailwind.css"), "--content", "./components/Live*.tsx"], { stdio: "ignore" });
const assets = { "/bundle.js": [join(output, "bundle.js"), "text/javascript; charset=utf-8"], "/style.css": [resolve("components/whiteboard/whiteboard.css"), "text/css"], "/tailwind.css": [join(output, "tailwind.css"), "text/css"], "/brand/whiteboard-hand.ttf": [resolve("public/brand/whiteboard-hand.ttf"), "font/ttf"] };
createServer((request, response) => {
  const asset = assets[new URL(request.url, "http://localhost").pathname];
  if (asset) { response.setHeader("Content-Type", asset[1]); createReadStream(asset[0]).pipe(response); return; }
  response.setHeader("Content-Type", "text/html; charset=utf-8");
  response.end('<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BrenUp whiteboard verification</title><link rel="stylesheet" href="/tailwind.css"><link rel="stylesheet" href="/style.css"><style>body{margin:0;background:#f6f4fc;font-family:Arial,sans-serif}#root>.wb-workspace{margin:0;--br-brand:#7342ed;--br-surface:#fff;--br-border:#e7e0f4;--br-text-muted:#85779d;--br-surface-muted:#f4effc;--br-success:#059d6a}button{font:inherit}p{margin:0}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
}).listen(4317, "127.0.0.1", () => console.log("Synthetic whiteboard preview ready: http://127.0.0.1:4317"));

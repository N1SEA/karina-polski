// Завантажує браузерні скрипти (data.js, srs.js) у пісочницю vm для тестів.
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

export function loadBrowser() {
  const ctx = {};
  const src = ["data.js", "srs.js"].map((f) => fs.readFileSync(path.join(root, f), "utf8")).join("\n;");
  vm.runInNewContext(src + ";this.DATA=DATA;this.CATS=CATS;this.SRS=SRS;", ctx);
  return ctx;
}

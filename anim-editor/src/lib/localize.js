// 把生成脚本里的相对 import 换成绝对 file://，这样测试产物可以放在临时目录，不污染特效库。
import { pathToFileURL } from "node:url";
import { join } from "node:path";

export function localizeImports(source, root) {
  return source.replace(/from "(\.\.?\/[^"]+)"/g, (m, p) => {
    const abs = p === "../../core/index.js"
      ? join(root, "src", "core", "index.js")
      : p.startsWith("../")
        ? join(root, "src", "fx", p.slice(3))
        : join(root, "src", "fx", "moves", p.slice(2));
    return `from ${JSON.stringify(pathToFileURL(abs).href)}`;
  });
}

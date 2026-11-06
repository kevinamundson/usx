const esbuild = require("esbuild");

const watch = process.argv.includes("--watch");

const shared = {
  bundle: true,
  platform: "node",
  target: "node18",
  sourcemap: true,
  logLevel: "info",
};

async function main() {
  const extension = {
    ...shared,
    entryPoints: ["src/extension.ts"],
    outfile: "dist/extension.js",
    format: "cjs",
    external: ["vscode"],
  };
  if (watch) {
    const ctx = await esbuild.context(extension);
    await ctx.watch();
    return;
  }
  await esbuild.build(extension);
  await esbuild.build({
    ...shared,
    entryPoints: ["test/usx.test.ts"],
    outfile: "dist/usx.test.js",
    format: "cjs",
    external: ["node:test", "node:assert/strict"],
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

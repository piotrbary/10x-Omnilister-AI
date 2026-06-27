/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-circular",
      severity: "warn",
      comment: "circular deps make refactoring and testing harder",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      severity: "warn",
      comment: "orphaned modules are likely dead code",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$",
          "\\.test\\.(js|mjs|cjs|jsx|ts|tsx)$",
          "\\.spec\\.(js|mjs|cjs|jsx|ts|tsx)$",
          "(^|/)index\\.(js|cjs|mjs|jsx|ts|tsx)$",
        ],
      },
      to: {},
    },
    {
      name: "no-deprecated-core",
      comment: "deprecated Node.js core modules",
      severity: "warn",
      from: {},
      to: { dependencyTypes: ["core"], path: "^(punycode|domain|constants|sys|_linklist|_stream_wrap)$" },
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "not-to-test",
      comment: "src should not import test files",
      severity: "error",
      from: { path: "^src", pathNot: "\\.test\\." },
      to: { path: "\\.test\\." },
    },
    {
      name: "pages-api-only-lib",
      comment: "API routes should only import from src/lib and src/types — not from components or pages",
      severity: "warn",
      from: { path: "^src/pages/api" },
      to: { path: "^src/(components|pages)" },
    },
    {
      name: "components-not-to-pages",
      comment: "components should not import pages",
      severity: "warn",
      from: { path: "^src/components" },
      to: { path: "^src/pages" },
    },
  ],
  options: {
    doNotFollow: {
      path: "node_modules",
      dependencyTypes: ["npm", "npm-dev", "npm-optional", "npm-peer", "npm-bundled", "npm-no-pkg"],
    },
    exclude: {
      path: [
        "node_modules",
        "\\.d\\.ts$",
        "dist/",
        "\\.cache",
        "\\.stryker-tmp",
        "context/",
        "\\.claude/",
      ],
    },
    includeOnly: "^src",
    tsConfig: { fileName: "tsconfig.json" },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      extensions: [".js", ".cjs", ".mjs", ".ts", ".tsx", ".astro"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: "^(node_modules|src/components|src/pages|src/lib|src/types)(/[^/]+)?/",
        theme: {
          graph: { rankdir: "LR", splines: "ortho" },
          modules: [
            { criteria: { source: "^src/lib" }, attributes: { fillcolor: "#dbeafe" } },
            { criteria: { source: "^src/components/editor" }, attributes: { fillcolor: "#fef3c7" } },
            { criteria: { source: "^src/pages/api" }, attributes: { fillcolor: "#dcfce7" } },
            { criteria: { source: "^src/types" }, attributes: { fillcolor: "#f3e8ff" } },
          ],
          dependencies: [
            { criteria: { resolved: "^src/lib/config" }, attributes: { color: "#dc2626", penwidth: "2.0" } },
            { criteria: { circular: true }, attributes: { color: "#ff0000", style: "bold" } },
          ],
        },
      },
    },
  },
};

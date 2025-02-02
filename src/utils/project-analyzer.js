import fs from "fs-extra";
import path from "path";
import { glob } from "glob";

export async function analyzeProject(projectPath) {
  const analysis = {
    dependencies: {},
    fileStructure: [],
    frameworks: [],
    configurations: {},
    sourceFiles: {},
  };

  try {
    const packageJson = await fs.readJson(
      path.join(projectPath, "package.json")
    );
    analysis.dependencies = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    // Detect frameworks
    if (analysis.dependencies.react) analysis.frameworks.push("react");
    if (analysis.dependencies.vue) analysis.frameworks.push("vue");
    if (analysis.dependencies.express) analysis.frameworks.push("express");

    // Analyze configurations
    const configFiles = ["tsconfig.json", "vite.config.js", ".eslintrc"];
    for (const file of configFiles) {
      if (await fs.pathExists(path.join(projectPath, file))) {
        analysis.configurations[file] = await fs.readFile(
          path.join(projectPath, file),
          "utf8"
        );
      }
    }

    // Analyze source files
    const files = await glob("**/*.{js,jsx,ts,tsx}", {
      cwd: projectPath,
    });

    for (const file of files) {
      analysis.sourceFiles[file] = await fs.readFile(
        path.join(projectPath, file),
        "utf8"
      );
    }

    return analysis;
  } catch (error) {
    throw new Error(`Project analysis failed: ${error.message}`);
  }
}

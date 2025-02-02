import { execSync } from "child_process";
import fs from "fs-extra";
import path from "path";
import chalk from "chalk";

export async function installDependencies(projectPath) {
  try {
    console.log(chalk.blue("\nInstalling dependencies..."));
    execSync("npm install", {
      cwd: projectPath,
      stdio: "inherit",
    });
    return true;
  } catch (error) {
    throw new Error(`Failed to install dependencies: ${error.message}`);
  }
}

export async function addDependency(projectPath, dependency, isDev = false) {
  try {
    const flag = isDev ? "--save-dev" : "--save";
    execSync(`npm install ${dependency} ${flag}`, {
      cwd: projectPath,
      stdio: "inherit",
    });
    return true;
  } catch (error) {
    throw new Error(`Failed to add dependency ${dependency}: ${error.message}`);
  }
}

export async function updateDependencies(projectPath) {
  try {
    console.log(chalk.blue("\nUpdating dependencies..."));
    execSync("npm update", {
      cwd: projectPath,
      stdio: "inherit",
    });
    return true;
  } catch (error) {
    throw new Error(`Failed to update dependencies: ${error.message}`);
  }
}

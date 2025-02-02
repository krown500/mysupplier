import { Command } from "commander";
import { OpenAI } from "openai";
import inquirer from "inquirer";
import chalk from "chalk";
import ora from "ora";
import fs from "fs-extra";
import { glob } from "glob";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { CONFIG } from "./config.js";
import { validateApiKey } from "./utils/validation.js";
import { generateProject } from "./utils/project-generator.js";
import { analyzeProject } from "./utils/project-analyzer.js";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

const program = new Command();

program
  .name("genie")
  .description("AI-powered project generator and manager")
  .version("1.0.0");

program
  .command("new")
  .description("Create a new project using natural language")
  .argument("<name>", "Project name")
  .argument("[description]", "Project description")
  .action(async (name, description) => {
    try {
      // إضافة التحقق من اسم المشروع
      if (await fs.pathExists(name)) {
        throw new Error(`المشروع ${name} موجود بالفعل`);
      }
      // Validate API key before proceeding
      await validateApiKey();

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      // Get project details if not provided
      const answers = await inquirer.prompt([
        {
          type: "list",
          name: "template",
          message: "Select a project template:",
          choices: ["react", "node", "vue", "next"],
        },
        {
          type: "input",
          name: "description",
          message: "Describe your project:",
          when: !description,
          validate: (input) => input.length > 0,
        },
      ]);

      const projectDescription = description || answers.description;
      const spinner = ora("Generating project...").start();

      try {
        const projectPath = await generateProject(
          name,
          answers.template,
          projectDescription
        );
        spinner.succeed(
          chalk.green(`Project created successfully at ${projectPath}`)
        );

        console.log(chalk.blue("\nNext steps:"));
        console.log(`1. cd ${name}`);
        console.log("2. npm install");
        console.log("3. npm run dev");
      } catch (error) {
        spinner.fail(chalk.red(`Failed to create project: ${error.message}`));
        process.exit(1);
      }
    } catch (error) {
      console.error(chalk.red("\nخطأ:", error.message));
      process.exit(1);
    }
  });

program
  .command("modify")
  .description("Modify existing project based on natural language description")
  .argument("<description>", "Modification description")
  .action(async (description) => {
    try {
      // Validate API key before proceeding
      await validateApiKey();

      const openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });

      const spinner = ora("Analyzing project...").start();

      const analysis = await analyzeProject(process.cwd());

      const completion = await openai.chat.completions.create({
        model: CONFIG.openai.model,
        messages: [
          {
            role: "system",
            content:
              "You are an expert developer assistant that modifies existing projects. Analyze the current structure and suggest specific changes.",
          },
          {
            role: "user",
            content: `Project analysis:\n${JSON.stringify(
              analysis,
              null,
              2
            )}\n\nRequested modification: ${description}`,
          },
        ],
        temperature: 0.7,
      });

      spinner.succeed("Analysis complete");

      console.log(chalk.green("\nSuggested modifications:"));
      console.log(completion.choices[0].message.content);
    } catch (error) {
      console.error(chalk.red("\nError:", error.message));
      process.exit(1);
    }
  });

program.parse();

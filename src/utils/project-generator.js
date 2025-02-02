import fs from "fs-extra";
import path from "path";
import { templates } from "../templates/index.js";
import { execSync } from "child_process";
import chalk from "chalk";

export async function generateProject(projectName, template, description) {
  const projectPath = path.join(process.cwd(), projectName);

  try {
    // Create project directory
    await fs.ensureDir(projectPath);

    // Create package.json
    const packageJson = {
      name: projectName,
      version: "1.0.0",
      private: true,
      type: "module",
      scripts: {
        dev: template === "node" ? "nodemon index.js" : "vite",
        build:
          template === "node" ? 'echo "No build step needed"' : "vite build",
        start: template === "node" ? "node index.js" : "vite preview",
      },
      dependencies: templates[template].dependencies,
      devDependencies: templates[template].devDependencies,
    };

    await fs.writeJSON(path.join(projectPath, "package.json"), packageJson, {
      spaces: 2,
    });

    // Create initial project files
    switch (template) {
      case "react":
        await generateReactTemplate(projectPath);
        break;
      case "node":
        await generateNodeTemplate(projectPath);
        break;
      case "vue":
        await generateVueTemplate(projectPath);
        break;
      case "next":
        await generateNextTemplate(projectPath);
        break;
      default:
        throw new Error(`Unknown template: ${template}`);
    }

    // Create README.md with project description
    const readme = `# ${projectName}\n\n${description}\n\n## Getting Started\n\n1. Install dependencies:\n\`\`\`bash\nnpm install\n\`\`\`\n\n2. Start development server:\n\`\`\`bash\nnpm run dev\n\`\`\``;
    await fs.writeFile(path.join(projectPath, "README.md"), readme);

    return projectPath;
  } catch (error) {
    throw new Error(`Failed to generate project: ${error.message}`);
  }
}

async function generateReactTemplate(projectPath) {
  const files = {
    "index.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>React App</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>`,
    "src/main.jsx": `import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)`,
    "src/App.jsx": `import React from 'react'

function App() {
  return (
    <div className="app">
      <h1>Welcome to your new React app!</h1>
    </div>
  )
}

export default App`,
    "src/index.css": `body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}`,
    "vite.config.js": `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()]
})`,
  };

  for (const [filePath, content] of Object.entries(files)) {
    await fs.outputFile(path.join(projectPath, filePath), content);
  }
}

async function generateNodeTemplate(projectPath) {
  const files = {
    "index.js": `import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.json({ message: 'Welcome to your new Node.js API!' });
});

app.listen(port, () => {
  console.log(\`Server running at http://localhost:\${port}\`);
});`,
    ".env.example": `PORT=3000`,
  };

  for (const [filePath, content] of Object.entries(files)) {
    await fs.outputFile(path.join(projectPath, filePath), content);
  }
}

async function generateVueTemplate(projectPath) {
  const files = {
    "index.html": `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vue App</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>`,
    "src/main.js": `import { createApp } from 'vue'
import App from './App.vue'
import router from './router'

const app = createApp(App)
app.use(router)
app.mount('#app')`,
    "src/App.vue": `<template>
  <div class="app">
    <router-view></router-view>
  </div>
</template>`,
    "src/router/index.js": `import { createRouter, createWebHistory } from 'vue-router'
import Home from '../views/Home.vue'

const routes = [
  {
    path: '/',
    name: 'Home',
    component: Home
  }
]

export default createRouter({
  history: createWebHistory(),
  routes
})`,
    "src/views/Home.vue": `<template>
  <div class="home">
    <h1>Welcome to your new Vue app!</h1>
  </div>
</template>`,
  };

  for (const [filePath, content] of Object.entries(files)) {
    await fs.outputFile(path.join(projectPath, filePath), content);
  }
}

async function generateNextTemplate(projectPath) {
  const files = {
    "pages/index.js": `export default function Home() {
  return (
    <div>
      <h1>Welcome to your Next.js app!</h1>
    </div>
  )
}`,
    "pages/_app.js": `export default function App({ Component, pageProps }) {
  return <Component {...pageProps} />
}`,
    "next.config.js": `/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig`,
  };

  for (const [filePath, content] of Object.entries(files)) {
    await fs.outputFile(path.join(projectPath, filePath), content);
  }
}

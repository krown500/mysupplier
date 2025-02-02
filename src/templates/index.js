// Template management and project scaffolding
export const templates = {
  react: {
    dependencies: {
      react: "^18.2.0",
      "react-dom": "^18.2.0",
      vite: "^5.0.0",
    },
    devDependencies: {
      "@types/react": "^18.2.37",
      "@types/react-dom": "^18.2.15",
      "@vitejs/plugin-react": "^4.2.0",
    },
  },
  node: {
    dependencies: {
      express: "^4.18.2",
      dotenv: "^16.3.1",
    },
    devDependencies: {
      nodemon: "^3.0.1",
    },
  },
  vue: {
    dependencies: {
      vue: "^3.3.0",
      "vue-router": "^4.2.0",
    },
    devDependencies: {
      "@vitejs/plugin-vue": "^4.2.0",
    },
  },
  next: {
    dependencies: {
      next: "^13.0.0",
      react: "^18.2.0",
      "react-dom": "^18.2.0",
    },
  },
};

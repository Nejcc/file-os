import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    // Output directory for the built files
    outDir: 'dist',
    // Generate source maps for debugging
    sourcemap: true,
    // Build as a Node.js application
    lib: {
      entry: 'src/build/kernel/kernel.ts',
      formats: ['cjs'],
      fileName: 'kernel'
    },
    rollupOptions: {
      external: ['commander', 'chalk', 'fs/promises', 'path', 'readline', 'inquirer', 'crypto', 'child_process', 'util', 'js-yaml', '@types/js-yaml', '@types/inquirer', '@types/node'],
      output: {
        globals: {
          commander: 'commander',
          chalk: 'chalk',
          'fs/promises': 'fs/promises',
          path: 'path',
          readline: 'readline',
          inquirer: 'inquirer',
          crypto: 'crypto',
          'child_process': 'child_process',
          util: 'util',
          'js-yaml': 'js-yaml'
        }
      }
    }
  },
  server: {
    // Enable hot reloading
    hmr: true,
  },
}); 
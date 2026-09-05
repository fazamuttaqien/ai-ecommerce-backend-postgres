import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  outDir: 'dist',
  clean: true,
  fixedExtension: false,
  deps: {
    neverBundle: true,
  },
  sourcemap: false,
  minify: false,
});

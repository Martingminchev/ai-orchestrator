import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    cli: 'src/cli/run-main.ts',
  },
  outDir: 'dist',
  format: 'esm',
  target: 'node22',
  clean: true,
  treeshake: true,
});

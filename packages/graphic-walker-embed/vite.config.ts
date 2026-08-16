import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
    plugins: [react()],
    build: {
        lib: {
            entry: {
                index: path.resolve(__dirname, 'src/index.ts'),
                contract: path.resolve(__dirname, 'src/contract.ts'),
            },
            formats: ['es'],
            fileName: (_format, entryName) => `${entryName}.js`,
        },
        rollupOptions: {
            external: [
                'react',
                'react-dom',
                'react-dom/client',
                'react/jsx-runtime',
                '@kanaries/graphic-walker',
                '@kanaries/duckdb-computation',
            ],
        },
        sourcemap: true,
        minify: false,
    },
});

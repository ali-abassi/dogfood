// `npm run lint` fetches ESLint on demand, so the project keeps zero dependencies.
// The only rule is dogfood's code contract: every function stays at cyclomatic complexity 5 or less.
export default [
  { ignores: ['data/**', 'demo/**', 'node_modules/**'] },
  {
    files: ['**/*.mjs', '**/*.js'],
    languageOptions: { ecmaVersion: 2024, sourceType: 'module' },
    rules: { complexity: ['error', 5] },
  },
];

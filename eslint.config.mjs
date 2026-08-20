import nextConfig from 'eslint-config-next/core-web-vitals';

export default [
  ...nextConfig,
  {
    ignores: [
      '.next/**',
      '.keystone/**',
      'node_modules/**',
      'public/**',
      '.runtime/**',
      'tsconfig.tsbuildinfo',
    ],
  },
  {
    // These are retained NKS/Keystone UI dependencies. Keep ownership with the
    // upstream surface instead of rewriting framework internals in the vertical.
    files: ['features/dashboard/**/*.{js,jsx,ts,tsx}', 'components/ui/**/*.{js,jsx,ts,tsx}'],
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/rules-of-hooks': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/static-components': 'off',
      'react/no-children-prop': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
];

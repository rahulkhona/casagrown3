module.exports = (api) => {
  api.cache(true)
  return {
    presets: [['babel-preset-expo', { jsxRuntime: 'automatic' }]],
    plugins: [
      [
        require.resolve('babel-plugin-module-resolver'),
        {
          root: ['../..'],
          alias: {
            // define aliases to shorten the import paths
            '@casagrown/app': '../../packages/app',
            '@casagrown/ui': '../../packages/ui',
            'app': '../../packages/app',
          },
          extensions: ['.js', '.jsx', '.tsx', '.ios.js', '.android.js'],
        },
      ],
      // if you want reanimated support
      // 'react-native-reanimated/plugin',
      ...(process.env.EAS_BUILD_PLATFORM === 'android'
        ? []
        : [
            [
              '@tamagui/babel-plugin',
              {
                components: ['@casagrown/ui', 'tamagui'],
                config: '../../packages/config/src/tamagui.config.ts',
                logTimings: true,
                disableExtraction: process.env.NODE_ENV === 'development',
              },
            ],
          ]),
      ['transform-inline-environment-variables', {
        include: ['TAMAGUI_USE_NATIVE_PORTAL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'],
      }],
    ],
  }
}

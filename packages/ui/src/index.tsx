export * from 'tamagui'
export * from '@tamagui/toast'
export * from './MyComponent'
export { config, type Conf } from '@casagrown/config'
export * from './CustomToast'
export * from './SwitchThemeButton'
export * from './SwitchRouterButton'
export { Button } from './components/Button'
export { Card } from './components/Card'
export { Input } from './components/Input'
export { Heading, Paragraph } from './components/Typography'
export * from './components/ProgressBar'
export * from './components/AlertBanner'
export * from './components/CheckboxCard'
export * from './components/Pill'
export * from './components/Dropzone'
export * from './components/Header'
export * from './components/OrderCard'

// type augmentation for tamagui custom config
import type { Conf } from '@casagrown/config'
declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}

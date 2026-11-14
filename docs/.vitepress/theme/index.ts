import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import './smaltdb.css'
import { withSmaltworks } from './stage'

export default { extends: DefaultTheme, Layout: withSmaltworks(DefaultTheme) } satisfies Theme

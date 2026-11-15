import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import { withBase } from 'vitepress'
import './smaltdb.css'
import { withSmaltworks } from './stage'
import { enablePlaygrounds, scriptRunner } from './playground'

// The playgrounds run examples against the site's own copy of dist/, served at kit/ (scripts/docs-kit.mjs copies it).
const kit = (specifier: string) =>
  specifier === 'smaltkit' || specifier.startsWith('smaltkit/') ? withBase(`/kit/${specifier.slice(9) || 'index'}.js`) : undefined

export default {
  extends: DefaultTheme,
  Layout: withSmaltworks(DefaultTheme),
  enhanceApp() {
    if (typeof document !== 'undefined') enablePlaygrounds({ runners: { ts: scriptRunner({ resolve: kit }) } })
  },
} satisfies Theme

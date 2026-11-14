import { defineConfig } from 'vitepress'
import path from 'node:path'
import { existsSync, readdirSync } from 'node:fs'
import { smaltLight, smaltDark } from './theme/shiki'
import { smaltworksMenu, smaltworksFooter } from './theme/smaltworks'
import { agentDocs, packageVersion } from './theme/agents'

const REPO = 'https://github.com/stenhoor/smaltkit'
// Served at stenhoor.github.io/smaltkit/; DOCS_BASE overrides it.
const base = process.env.DOCS_BASE ?? '/smaltkit/'
const description = 'Shared UI code for the smalt apps: the engine loader, charts, tables, the grid, the editor and the rest, in plain ES modules with no dependencies.'

// A module's sidebar entry; a module whose functions have pages of their own (docs/reference/<module>/) lists them
// under it.
const ref = (text: string, module: string) => {
  const dir = path.join(__dirname, '..', 'reference', module)
  if (!existsSync(dir)) return { text, link: `/reference/${module}` }
  const items = readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => f.slice(0, -3))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ text: name, link: `/reference/${module}/${name}` }))
  return { text, link: `/reference/${module}`, collapsed: true, items }
}

export default defineConfig({
  title: 'smaltkit',
  description,
  base,
  cleanUrls: true,
  lastUpdated: false,
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: `${base}favicon-32.svg` }],
    ['link', { rel: 'preconnect', href: 'https://fonts.googleapis.com' }],
    ['link', { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;700&family=Geist+Mono:wght@400;500&family=Martian+Mono:wght@400;600&display=swap' }],
    ['meta', { property: 'og:title', content: 'smaltkit' }],
    ['meta', { property: 'og:description', content: description }],
  ],
  markdown: {
    theme: { light: smaltLight, dark: smaltDark },
    config(md) {
      // Links that leave docs/ (sources, tests) point at the file on GitHub.
      const fallback = md.renderer.rules.link_open ?? ((t, i, o, _e, s) => s.renderToken(t, i, o))
      md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
        const href = tokens[idx].attrGet('href')
        if (href && !/^[a-z]+:|^#|^\//i.test(href) && env?.relativePath) {
          const target = path.posix.normalize(path.posix.join(path.posix.dirname(env.relativePath), href))
          if (target.startsWith('../')) {
            tokens[idx].attrSet('href', `${REPO}/blob/HEAD/${target.slice(3)}`)
            tokens[idx].attrSet('target', '_blank')
            tokens[idx].attrSet('rel', 'noreferrer')
          }
        }
        return fallback(tokens, idx, options, env, self)
      }
    },
  },
  themeConfig: {
    siteTitle: false,
    logo: { light: '/lockup.svg', dark: '/lockup-on-dark.svg', alt: 'smaltkit' },
    nav: [
      { text: 'Quick start', link: '/quick-start' },
      { text: 'Reference', link: '/reference/' },
      smaltworksMenu(),
    ],
    sidebar: [
      { text: 'Quick start', items: [{ text: 'Quick start', link: '/quick-start' }] },
      {
        text: 'Reference',
        items: [
          { text: 'Modules', link: '/reference/' },
          { text: 'Engine and data', collapsed: false, items: [ref('engine', 'engine'), ref('manifest', 'manifest'), ref('urls', 'urls'), ref('git', 'git')] },
          { text: 'Languages', collapsed: false, items: [ref('sql', 'sql'), ref('cypher', 'cypher'), ref('typescript', 'typescript'), ref('typecheck', 'typecheck'), ref('typechecker', 'typechecker')] },
          { text: 'Text', collapsed: false, items: [ref('format', 'format'), ref('markdown', 'markdown'), ref('pretty', 'pretty')] },
          { text: 'Drawing', collapsed: false, items: [ref('svg', 'svg'), ref('charts', 'charts'), ref('maps', 'maps'), ref('table', 'table'), ref('graph', 'graph'), ref('timeline', 'timeline')] },
          { text: 'Interface', collapsed: false, items: [ref('grid', 'grid'), ref('editor', 'editor'), ref('controls', 'controls'), ref('dom', 'dom'), ref('ui.css', 'styles')] },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: REPO }],
    search: { provider: 'local' },
    outline: { level: [2, 4] },
    footer: smaltworksFooter(base),
  },
  buildEnd: (config) => {
    agentDocs(config, {
      product: 'smaltkit',
      version: packageVersion('package.json'),
      url: 'https://stenhoor.github.io/smaltkit/',
      intro: 'for-agents.md',
      guide: ['quick-start', 'reference/'],
    })
  },
})

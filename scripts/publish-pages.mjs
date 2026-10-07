import { spawnSync } from 'node:child_process'
import { mkdtemp, cp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEnv } from 'vite'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const base = '/workout-lab.github.io/'
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.signal || result.status}`)
  return result.stdout?.trim() || ''
}
const git = (...args) => run('git', args)
if (git('status', '--porcelain')) throw new Error('Commit your source changes before publishing.')
const origin = git('remote', 'get-url', 'origin')
if (!/^(https:\/\/github\.com\/|git@github\.com:)kostasfot\/workout-lab\.github\.io(?:\.git)?$/.test(origin)) {
  throw new Error('This publisher targets kostasfot/workout-lab.github.io only.')
}
const source = git('rev-parse', 'HEAD')
const remoteMain = git('ls-remote', 'origin', 'refs/heads/main').split(/\s+/)[0]
if (source !== remoteMain) throw new Error('Push this source commit to main before publishing.')
const env = { ...process.env, ...loadEnv('production', root, 'VITE_'), VITE_BASE_PATH: base }
if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_PUBLISHABLE_KEY?.startsWith('sb_publishable_')) {
  throw new Error('Provide the Supabase URL and publishable key in environment settings or .env.local.')
}
run('npm', ['run', 'build'], { env, stdio: 'inherit' })

const remotePages = git('ls-remote', 'origin', 'refs/heads/gh-pages')
let parent
if (remotePages) {
  git('fetch', 'origin', 'refs/heads/gh-pages')
  parent = git('rev-parse', 'FETCH_HEAD')
}
const temporary = await mkdtemp(join(tmpdir(), 'workout-lab-pages-'))
try {
  const site = join(temporary, 'site')
  await cp(join(root, 'dist'), site, { recursive: true })
  await writeFile(join(site, '.nojekyll'), '')
  await writeFile(join(site, 'build-info.json'), JSON.stringify({ sourceCommit: source, basePath: base }, null, 2) + '\n')
  const indexEnv = { ...env, GIT_INDEX_FILE: join(temporary, 'publication-index') }
  const indexed = (...args) => run('git', [`--work-tree=${site}`, ...args], { env: indexEnv })
  indexed('read-tree', '--empty')
  indexed('add', '--all')
  const tree = indexed('write-tree')
  const commit = git('commit-tree', tree, ...(parent ? ['-p', parent] : []), '-m', `Publish Workout Lab (${source.slice(0, 7)})`)
  // A separate index preserves the source checkout; the non-force push refuses
  // to replace a newer publication made concurrently by another developer.
  git('push', 'origin', `${commit}:refs/heads/gh-pages`)
  console.log(`Published source ${source.slice(0, 7)} to gh-pages (${commit.slice(0, 7)}).`)
  console.log('Site: https://kostasfot.github.io/workout-lab.github.io/')
} finally {
  await rm(temporary, { recursive: true, force: true })
}

#!/usr/bin/env node
/**
 * Runs the database test suite against the real migrations on PGlite.
 *
 *   npm run test:db              # every tests/db/*.test.mjs file
 *   npm run test:db -- groups    # only files whose name contains "groups"
 *
 * Each test file gets a fresh database (all migrations applied) shared by
 * the tests inside it, in order. A file exports `tests`: [{ name, fn(h) }],
 * where h is the harness from tests/db/harness.mjs.
 */
import { readdir } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join } from 'node:path'
import { createDb } from '../tests/db/harness.mjs'

const dir = fileURLToPath(new URL('../tests/db/', import.meta.url))
const filter = process.argv[2]
const files = (await readdir(dir))
  .filter((f) => f.endsWith('.test.mjs'))
  .filter((f) => !filter || f.includes(filter))
  .sort()

const color = (code) => (s) => (process.stdout.isTTY ? `\x1b[${code}m${s}\x1b[0m` : s)
const green = color(32)
const red = color(31)
const dim = color(2)

let passed = 0
let failed = 0
const failures = []
const started = Date.now()

for (const file of files) {
  const mod = await import(pathToFileURL(join(dir, file)).href)
  const tests = mod.tests ?? []
  console.log(`\n${file} ${dim(`(${tests.length} tests)`)}`)

  let h
  try {
    h = await createDb()
  } catch (error) {
    failed += tests.length || 1
    failures.push({ file, name: 'apply migrations', error })
    console.log(red(`  ✗ could not apply migrations: ${error.message}`))
    continue
  }

  for (const t of tests) {
    const t0 = Date.now()
    try {
      await t.fn(h)
      passed++
      console.log(`  ${green('✓')} ${t.name} ${dim(`${Date.now() - t0}ms`)}`)
    } catch (error) {
      failed++
      failures.push({ file, name: t.name, error })
      console.log(`  ${red('✗')} ${t.name}`)
      console.log(red(`      ${String(error.message).split('\n').join('\n      ')}`))
    } finally {
      // Never leak a role or JWT subject into the next test.
      await h.reset().catch(() => {})
    }
  }
  await h.db.close().catch(() => {})
}

const seconds = ((Date.now() - started) / 1000).toFixed(1)
console.log(`\n${passed} passed, ${failed} failed ${dim(`(${seconds}s)`)}`)
if (failures.length) {
  console.log(red('\nFailures:'))
  for (const f of failures) console.log(red(`  ${f.file} › ${f.name}`))
  process.exit(1)
}

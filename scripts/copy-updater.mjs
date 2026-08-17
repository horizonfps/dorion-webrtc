import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const suffix = process.platform === 'win32' ? '.exe' : ''
const source = resolve(root, `updater/target/release/updater${suffix}`)
const destination = resolve(root, `src-tauri/updater${suffix}`)

if (!existsSync(source)) throw new Error(`Updater binary not found: ${source}`)

mkdirSync(dirname(destination), { recursive: true })
copyFileSync(source, destination)
process.stdout.write(`Copied updater to ${destination}\n`)

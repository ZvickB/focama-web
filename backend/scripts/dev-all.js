import { spawn } from 'node:child_process'

function runProcess(name, command, args) {
  const child = spawn(command, args, {
    stdio: 'inherit',
    shell: true,
  })

  child.on('exit', (code) => {
    if (code && code !== 0) {
      console.error(`${name} exited with code ${code}`)
    }
  })

  return child
}

const serverProcess = runProcess('server', 'npm', ['run', 'server'])
const devProcess = runProcess('dev', 'npm', ['run', 'dev'])

function shutdown() {
  serverProcess.kill()
  devProcess.kill()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

/* global Pear */
import Runtime from 'pear-electron'
import Bridge from 'pear-bridge'

const runtime = new Runtime()
const bridge = new Bridge()
await bridge.ready()

const pipe = runtime.start({ bridge })
Pear.teardown(async () => {
  if (pipe && typeof pipe.end === 'function') {
    pipe.end()
  } else if (pipe && typeof pipe.destroy === 'function') {
    pipe.destroy()
  }
})

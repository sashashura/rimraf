const t = require('tap')

t.test('basic arg parsing stuff', t => {
  const LOGS = []
  const ERRS = []
  const { log: consoleLog, error: consoleError } = console
  t.teardown(() => {
    console.log = consoleLog
    console.error = consoleError
  })
  console.log = (...msg) => LOGS.push(msg)
  console.error = (...msg) => ERRS.push(msg)

  const CALLS = []
  const rimraf = async (path, opt) =>
    CALLS.push(['rimraf', path, opt])
  const bin = t.mock('../lib/bin.js', {
    '../lib/index.js': Object.assign(rimraf, {
      native: async (path, opt) =>
        CALLS.push(['native', path, opt]),
      manual: async (path, opt) =>
        CALLS.push(['manual', path, opt]),
      posix: async (path, opt) =>
        CALLS.push(['posix', path, opt]),
      windows: async (path, opt) =>
        CALLS.push(['windows', path, opt]),
    }),
  })

  t.afterEach(() => {
    LOGS.length = 0
    ERRS.length = 0
    CALLS.length = 0
  })

  t.test('helpful output', t => {
    const cases = [
      ['-h'],
      ['--help'],
      ['a', 'b', '--help', 'c'],
    ]
    for (const c of cases) {
      t.test(c.join(' '), async t => {
        t.equal(await bin(...c), 0)
        t.same(LOGS, [[bin.help]])
        t.same(ERRS, [])
        t.same(CALLS, [])
      })
    }
    t.end()
  })

  t.test('no paths', async t => {
    t.equal(await bin(), 1)
    t.same(LOGS, [])
    t.same(ERRS, [
      ['rimraf: must provide a path to remove'],
      ['run `rimraf --help` for usage information'],
    ])
  })

  t.test('dashdash', async t => {
    t.equal(await bin('--', '-h'), 0)
    t.same(LOGS, [])
    t.same(ERRS, [])
    t.same(CALLS, [['rimraf', ['-h'], {}]])
  })

  t.test('no preserve root', async t => {
    t.equal(await bin('--no-preserve-root', 'foo'), 0)
    t.same(LOGS, [])
    t.same(ERRS, [])
    t.same(CALLS, [['rimraf', ['foo'], { preserveRoot: false }]])
  })
  t.test('yes preserve root', async t => {
    t.equal(await bin('--preserve-root', 'foo'), 0)
    t.same(LOGS, [])
    t.same(ERRS, [])
    t.same(CALLS, [['rimraf', ['foo'], { preserveRoot: true }]])
  })
  t.test('yes preserve root, remove root', async t => {
    t.equal(await bin('/'), 1)
    t.same(LOGS, [])
    t.same(ERRS, [
      [`rimraf: it is dangerous to operate recursively on '/'`],
      ['use --no-preserve-root to override this failsafe'],
    ])
    t.same(CALLS, [])
  })
  t.test('no preserve root, remove root', async t => {
    t.equal(await bin('/', '--no-preserve-root'), 0)
    t.same(LOGS, [])
    t.same(ERRS, [])
    t.same(CALLS, [['rimraf', ['/'], { preserveRoot: false }]])
  })

  t.test('--tmp=<path>', async t => {
    t.equal(await bin('--tmp=some-path', 'foo'), 0)
    t.same(LOGS, [])
    t.same(ERRS, [])
    t.same(CALLS, [['rimraf', ['foo'], { tmp: 'some-path' }]])
  })

  t.test('--max-retries=n', async t => {
    t.equal(await bin('--max-retries=100', 'foo'), 0)
    t.same(LOGS, [])
    t.same(ERRS, [])
    t.same(CALLS, [['rimraf', ['foo'], { maxRetries: 100 }]])
  })

  t.test('--retry-delay=n', async t => {
    t.equal(await bin('--retry-delay=100', 'foo'), 0)
    t.same(LOGS, [])
    t.same(ERRS, [])
    t.same(CALLS, [['rimraf', ['foo'], { retryDelay: 100 }]])
  })

  t.test('--uknown-option', async t => {
    t.equal(await bin('--unknown-option=100', 'foo'), 1)
    t.same(LOGS, [])
    t.same(ERRS, [
      ['unknown option: --unknown-option=100'],
      ['run `rimraf --help` for usage information'],
    ])
    t.same(CALLS, [])
  })

  t.test('--impl=asdf', async t => {
    t.equal(await bin('--impl=asdf', 'foo'), 1)
    t.same(LOGS, [])
    t.same(ERRS, [
      ['unknown implementation: asdf'],
      ['run `rimraf --help` for usage information'],
    ])
    t.same(CALLS, [])
  })

  const impls = ['rimraf', 'native', 'manual', 'posix', 'windows']
  for (const impl of impls) {
    t.test(`--impl=${impl}`, async t => {
      t.equal(await bin('foo', `--impl=${impl}`), 0)
      t.same(LOGS, [])
      t.same(ERRS, [])
      t.same(CALLS, [
        [impl, ['foo'], {}],
      ])
    })
  }

  t.end()
})

t.test('actually delete something with it', async t => {
  const path = t.testdir({
    a: {
      b: {
        c: '1',
      },
    },
  })

  const bin = require.resolve('../lib/bin.js')
  const { spawnSync } = require('child_process')
  const res = spawnSync(process.execPath, [bin, path])
  const { statSync } = require('fs')
  t.throws(() => statSync(path))
  t.equal(res.status, 0)
})

t.test('print failure when impl throws', async t => {
  const path = t.testdir({
    a: {
      b: {
        c: '1',
      },
    },
  })

  const bin = require.resolve('../lib/bin.js')
  const { spawnSync } = require('child_process')
  const res = spawnSync(process.execPath, [bin, path], {
    env: {
      ...process.env,
      __RIMRAF_TESTING_BIN_FAIL__: '1',
    },
  })
  const { statSync } = require('fs')
  t.equal(statSync(path).isDirectory(), true)
  t.equal(res.status, 1)
  t.match(res.stderr.toString(), /^Error: simulated rimraf failure/)
})

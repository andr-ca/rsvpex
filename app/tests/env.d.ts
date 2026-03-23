declare module 'cloudflare:workers' {
  // ProvidedEnv controls the type of `import("cloudflare:workers").env`
  interface ProvidedEnv extends Env {
    // Test-only binding for applying D1 migrations
    TEST_MIGRATIONS: D1Migration[]
  }
}

/**
 * Nuxt layer entry point for `@nuxt4-layers/iam-integration`.
 *
 * The layer adds nothing to a host at runtime: it exists so that a host that
 * `extends` it gets the adapters (`@nuxt4-layers/iam-integration/adapters`)
 * compiled with its server code, as every member's TypeScript source is. The
 * host still wires each adapter to the members' ports itself
 * (docs/adapters.md).
 */
export default defineNuxtConfig({
  compatibilityDate: '2026-06-30',
})

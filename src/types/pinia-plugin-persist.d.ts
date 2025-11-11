declare module 'pinia-plugin-persist' {
  import type { PiniaPluginContext } from 'pinia'
  
  export interface PersistStrategy {
    key?: string
    storage?: Storage
    paths?: string[]
  }

  export interface PersistOptions {
    enabled: true
    strategies?: PersistStrategy[]
  }

  const plugin: (context: PiniaPluginContext) => void
  export default plugin
}

declare module '@pinia/core' {
  export interface DefineStoreOptionsBase<S, Store> {
    persist?: import('pinia-plugin-persist').PersistOptions
  }
}

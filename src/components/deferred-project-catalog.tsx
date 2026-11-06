import { deferredComponent } from './deferred-component'

export const DeferredProjectCatalogPanel = deferredComponent(async () => ({ default: (await import('./project-catalog-panel')).ProjectCatalogPanel }))

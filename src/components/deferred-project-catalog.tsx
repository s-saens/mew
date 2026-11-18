import { deferredComponent } from './deferred-component'
import { PanelLoading } from './startup-screen'

export const DeferredProjectCatalogPanel = deferredComponent(
  async () => ({ default: (await import('./project-catalog-panel')).ProjectCatalogPanel }),
  <PanelLoading transparent />,
)

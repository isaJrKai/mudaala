'use client'

import { useEffect, useState } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppHeader } from './app-header'
import { BottomNav } from './bottom-nav'
import { AuthDialog } from './auth-dialog'
import { HomeDashboard } from './home-view'
import { ListingsBrowse } from './listings-browse'
import { ListingDetail } from './listing-detail'
import { ShopView } from './shop-view'
import { BasketView } from './basket-view'
import { PublishForm, EditListingForm } from './publish-form'
import { MyListings } from './my-listings'
import { SavedSearches } from './saved-searches'
import { NotificationsView } from './notifications-view'
import { AccountView } from './account-view'
import { SettingsView } from './settings-view'
import { useAppStore, hashToView, viewToHash } from '@/lib/store'

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        staleTime: 15_000,
        refetchOnWindowFocus: false,
      },
    },
  })
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(makeQueryClient)
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

function CurrentView() {
  const { view } = useAppStore()
  switch (view.name) {
    case 'home':
      return <HomeDashboard />
    case 'listing':
      return view.id ? <ListingDetail id={view.id} /> : <ListingsBrowse />
    case 'shop':
      return view.id ? <ShopView id={view.id} /> : <ListingsBrowse />
    case 'basket':
      return <BasketView />
    case 'publish':
      return <PublishForm />
    case 'edit':
      return view.id ? <EditListingForm id={view.id} /> : <MyListings />
    case 'my-listings':
      return <MyListings />
    case 'saved':
      return <SavedSearches />
    case 'notifications':
      return <NotificationsView />
    case 'account':
      return <AccountView />
    case 'settings':
      return <SettingsView />
    case 'browse':
    default:
      return <ListingsBrowse />
  }
}

// Hash sync keeps browser back/forward working with the client-side views,
// and initializes the view from the URL on load (deep links, reloads).
function HashSync() {
  const { view, navigate } = useAppStore()

  useEffect(() => {
    const initial = hashToView(window.location.hash)
    const current = useAppStore.getState().view
    if (initial.name !== current.name || initial.id !== current.id) {
      useAppStore.setState({ view: initial })
    }

    const onHashChange = () => {
      const next = hashToView(window.location.hash)
      const state = useAppStore.getState().view
      if (next.name !== state.name || next.id !== state.id) {
        // Deferred by one task so navigate()'s own hash write settles before
        // we compare state again. setTimeout, NOT setImmediate - setImmediate
        // is Node-only and threw a ReferenceError on every external hash
        // change (opening a shared shop link while the app is already open,
        // browser back/forward), leaving the page stuck on the old view.
        setTimeout(() => navigate(next), 0)
      }
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [navigate])

  // Keep the document hash in sync when navigation happens in-app.
  useEffect(() => {
    const target = viewToHash(view)
    if (window.location.hash !== target) {
      window.history.replaceState(null, '', target)
    }
  }, [view])

  return null
}

export { CurrentView, HashSync }

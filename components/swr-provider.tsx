"use client"

import { SWRConfig } from "swr"

export function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        refreshInterval: 10000, // Refresh every 10 seconds to catch new data quickly
        revalidateOnFocus: true,
        revalidateOnReconnect: true,
        dedupingInterval: 2000, // Dedupe requests within 2 seconds
        keepPreviousData: false, // Don't keep old data when refreshing
        revalidateIfStale: true, // Always revalidate stale data
      }}
    >
      {children}
    </SWRConfig>
  )
}

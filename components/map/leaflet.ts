'use client'

import type * as Leaflet from 'leaflet'

let loading: Promise<typeof Leaflet> | null = null

/** Loads Leaflet (and the heatmap plugin) in the browser only. */
export function loadLeaflet(withHeat = false) {
  loading ??= import('leaflet').then((m) => m.default ?? m)
  return loading.then(async (L) => {
    if (withHeat && !(L as unknown as { heatLayer?: unknown }).heatLayer) {
      ;(window as unknown as { L: typeof Leaflet }).L = L
      await import('leaflet.heat')
    }
    return L
  })
}

export const OSM_TILES = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
export const OSM_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
export const ADDIS: [number, number] = [9.012, 38.761]

export const STATUS_COLORS: Record<string, string> = { New: '#1d5fa7', 'In progress': '#d49a17', Escalated: '#b32d3d', Resolved: '#267448' }

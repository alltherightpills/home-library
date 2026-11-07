// Manage › Places: the saves and the place search. The rules are in managePlaces.js.

import { lookupRow, lookupUrl } from './placeMap.js'
import { supabase } from './supabase.js'

// The database functions come from supabase/migrations/20261107_02_rename_place.sql.
const missingFunction = (error) => error?.code === 'PGRST202'
const NEEDS_MIGRATION = 'Places needs the database change from 2026-11-07 (rename_place) run first.'

// Every saved map coordinate, with its id so a chosen pin can replace it.
export async function loadPlaceRows() {
  const { data, error } = await supabase
    .from('places')
    .select('id, city, region, country, latitude, longitude, found_as, source')
  if (error) throw new Error(`Reading the saved places: ${error.message}`)
  return data
}

// Clears saved coordinates no book uses any more. Quietly does nothing before
// the migration is run; nothing depends on it.
export async function tidyPlaces() {
  const { error } = await supabase.rpc('tidy_places')
  if (error && !missingFunction(error)) throw new Error(`Tidying the places: ${error.message}`)
}

// Every book from `from` gets `to`'s text, in one database step. → books changed.
export async function renamePlace(from, to) {
  const { data, error } = await supabase.rpc('rename_place', {
    old_city: from.city,
    old_region: from.region,
    old_country: from.country,
    new_city: to.city,
    new_region: to.region,
    new_country: to.country,
  })
  if (missingFunction(error)) throw new Error(NEEDS_MIGRATION)
  if (error) throw new Error(`Renaming: ${error.message}`)
  return data
}

// Search again: up to 5 matches for the typed wording, as
// [{ lat, lon, display_name, … }] from OpenStreetMap's place search.
export async function searchPlace(wording) {
  const response = await fetch(lookupUrl(wording, 5), { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`The place search answered ${response.status}.`)
  return response.json()
}

// Saves the match the owner picked as this place's pin ('owner', which the
// map's own lookups never overwrite). `row` is its saved row, if any. → the row.
export async function savePin(place, hit, libraryId, row) {
  const pin = { ...lookupRow(place, [hit], libraryId), source: 'owner' }
  const { data, error } = row
    ? await supabase.from('places').update(pin).eq('id', row.id).select().single()
    : await supabase.from('places').insert(pin).select().single()
  if (error) throw new Error(`Saving the pin: ${error.message}`)
  return data
}

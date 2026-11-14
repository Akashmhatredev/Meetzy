/**
 * Which shortlisted activities to search for.
 *  - all_selected: every shortlisted activity (most-voted first)
 *  - most_popular: only the activities tied for the most votes
 * Capped (default 5) to bound Places API calls per calculation.
 */
export function pickActivities(shortlist, mode = 'all_selected', max = 5) {
  const usable = (shortlist ?? [])
    .filter((a) => a && a.activityId && typeof a.placesQuery === 'string' && a.placesQuery.trim())
    .map((a, index) => ({ ...a, votes: Number(a.votes) || 0, index }))
    .sort((a, b) => b.votes - a.votes || a.index - b.index)

  let picked = usable
  if (mode === 'most_popular' && usable.length) {
    const top = usable[0].votes
    picked = usable.filter((a) => a.votes === top)
  }
  return picked.slice(0, Math.max(1, max)).map(({ index, ...rest }) => rest)
}

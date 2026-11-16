/** One-line help shown while transcript editing is on. */
export function EditHint() {
  return (
    <div className="edit-hint" role="note">
      <b>Editing transcript</b>
      <span>Tap a word to change it. Space splits a word · empty deletes it · Tab next · Esc done.</span>
    </div>
  )
}

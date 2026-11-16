/** Help line (and full-text entry point) shown while transcript editing is on. */
export function EditHint({ onFullText }: { onFullText?: () => void }) {
  return (
    <div className="edit-hint" role="note">
      <b>Editing transcript</b>
      <span title="Click a word to swap it. Space splits it · empty deletes it · Shift+Enter breaks the paragraph after it · Tab moves to the next word · Esc leaves edit mode.">
        Click a word to change it · Shift+Enter = ¶ · Esc done
      </span>
      {onFullText && (
        <button className="fbtn wide" onClick={onFullText}>
          Edit full text
        </button>
      )}
    </div>
  )
}

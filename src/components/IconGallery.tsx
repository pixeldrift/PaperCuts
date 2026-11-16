import { Icon, iconNames } from '../icons'

/** Visit /#icons to review every redrawn icon next to its name. */
export function IconGallery() {
  return (
    <div className="gallery">
      <h1>PaperCuts icons</h1>
      <div className="gallery-grid">
        {iconNames.map((n) => (
          <figure key={n}>
            <span className="tool">
              <Icon name={n} size={28} />
            </span>
            <figcaption>{n}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}

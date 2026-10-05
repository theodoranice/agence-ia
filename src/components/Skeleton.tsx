/** Lignes fantômes affichées pendant le chargement, à la forme d'une liste. */
export default function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="items" aria-busy="true" aria-label="Chargement">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </div>
  );
}

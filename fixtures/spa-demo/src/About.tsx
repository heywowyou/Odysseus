/**
 * Second page of the fixture, reachable via an internal link from the
 * homepage. Exists so crawler tests can exercise real multi-page BFS and
 * depth tracking; no seeded scanner faults here, that's the homepage's job.
 */
export default function About() {
  return (
    <div className="page">
      <header className="page__header">
        <h1>A propos du domaine</h1>
      </header>

      <main>
        <p>
          Domaine des Trois Chenes cultive la vigne en agriculture raisonnee
          depuis 1978.
        </p>
        <a href="/">Retour a l'accueil</a>
      </main>
    </div>
  );
}

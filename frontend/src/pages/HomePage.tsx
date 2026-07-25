import "../styles/home.css";

export function HomePage() {
  return (
    <section className="home" aria-label="Home">
      <div className="home-brand">
        <h1 className="home-moniq">moniQ</h1>
        <p className="home-byline">
          by <strong>Ritenza</strong>
        </p>
        <p className="home-tag">
          Speak your spend. moniQ turns everyday money talk into a living
          knowledge graph.
        </p>
      </div>
    </section>
  );
}

<script lang="ts">
  import '../app.css';
</script>

<main>
  <header>
    <h1>Better Test Automation</h1>
    <p>Test Intelligence Dashboard</p>
  </header>

  <section class="stats">
    <div class="stat passed">
      <span class="value">0</span>
      <span class="label">Passed</span>
    </div>
    <div class="stat failed">
      <span class="value">0</span>
      <span class="label">Failed</span>
    </div>
    <div class="stat flaky">
      <span class="value">0</span>
      <span class="label">Flaky</span>
    </div>
    <div class="stat healed">
      <span class="value">0</span>
      <span class="label">Healed</span>
    </div>
  </section>

  <section class="panels">
    <div class="panel">
      <h2>Recent Runs</h2>
      <p class="empty">No test runs yet. Run <code>bettertest run</code> to get started.</p>
    </div>

    <div class="panel">
      <h2>Flakiness Intelligence</h2>
      <p class="empty">Flakiness analysis will appear here after multiple test runs.</p>
    </div>

    <div class="panel">
      <h2>Self-Healing Log</h2>
      <p class="empty">Healed selectors will appear here when tests self-repair.</p>
    </div>
  </section>
</main>

<style>
  main {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  header {
    margin-bottom: 2rem;
  }

  header h1 {
    font-size: 1.8rem;
    font-weight: 700;
  }

  header p {
    color: var(--text-muted);
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .stat {
    background: var(--bg-secondary);
    padding: 1.5rem;
    border-radius: var(--radius);
    text-align: center;
    border: 1px solid var(--border);
  }

  .stat .value {
    display: block;
    font-size: 2.5rem;
    font-weight: 700;
    font-family: var(--font-mono);
  }

  .stat .label {
    display: block;
    color: var(--text-muted);
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat.passed .value {
    color: var(--green);
  }
  .stat.failed .value {
    color: var(--red);
  }
  .stat.flaky .value {
    color: var(--yellow);
  }
  .stat.healed .value {
    color: var(--blue);
  }

  .panels {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1rem;
  }

  .panel {
    background: var(--bg-secondary);
    padding: 1.5rem;
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }

  .panel h2 {
    font-size: 1rem;
    margin-bottom: 1rem;
    font-weight: 600;
  }

  .empty {
    color: var(--text-muted);
    font-size: 0.9rem;
  }

  code {
    background: var(--bg-tertiary);
    padding: 0.15em 0.4em;
    border-radius: 4px;
    font-family: var(--font-mono);
    font-size: 0.85em;
  }
</style>

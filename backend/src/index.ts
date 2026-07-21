import { createApp } from "./app";
import { env } from "./config/env";
import { startStreamHub } from "./services/marketStream/streamHub";

const app = createApp();

app.listen(env.port, () => {
  /* eslint-disable no-console */
  console.log(`\n  ▲ AI Market backend running`);
  console.log(`  • URL:     http://localhost:${env.port}`);
  console.log(`  • Health:  http://localhost:${env.port}/api/health`);
  console.log(`  • Env:     ${env.nodeEnv}  | provider: ${env.marketDataProvider}\n`);

  // Boot the Kite WebSocket → SSE market-data relay. No-op (REST fallback only)
  // until live Kite data is enabled and authenticated; safe to start eagerly.
  void startStreamHub().catch((e) => console.error(`[stream] failed to start: ${e?.message ?? e}`));
});

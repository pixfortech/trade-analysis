import { createApp } from "./app";
import { env } from "./config/env";

const app = createApp();

app.listen(env.port, () => {
  /* eslint-disable no-console */
  console.log(`\n  ▲ AI Market backend running`);
  console.log(`  • URL:     http://localhost:${env.port}`);
  console.log(`  • Health:  http://localhost:${env.port}/api/health`);
  console.log(`  • Env:     ${env.nodeEnv}  | provider: ${env.marketDataProvider}\n`);
});

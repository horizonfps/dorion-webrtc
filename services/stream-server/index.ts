import { pathToFileURL } from "node:url";
import { loadConfig } from "./config.js";
import { createStreamServer } from "./server.js";

export { loadConfig } from "./config.js";
export { parseTokenRequest } from "./protocol.js";
export { createStreamServer } from "./server.js";

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const config = loadConfig();
  const server = createStreamServer(config);

  server.listen(config.port, config.host, () => {
    console.log(
      `Dorion stream token server listening on ${config.host}:${config.port}`,
    );
  });
}

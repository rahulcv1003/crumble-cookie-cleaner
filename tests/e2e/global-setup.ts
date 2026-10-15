import { startTestServer } from "./support/server";

export default async function globalSetup(): Promise<() => Promise<void>> {
  const server = await startTestServer();
  return async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
}

import { defineConfig, devices } from "@playwright/test";

/* Só a landing por enquanto. O servidor é o `vite preview` sobre o build — e não
   o dev server — porque é o CSS de produção que se quer testar: é lá que a
   ordem das media queries importa, e foi ordem de folha que já custou bug nesta
   página (ver o comentário "FICA NO FIM DA FOLHA" em landing.css). */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:4173" },
  webServer: {
    command: "npm run build && npx vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
});

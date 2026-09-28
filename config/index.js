// Load optional local configuration without requiring a dotenv dependency.
try {
  process.loadEnvFile?.();
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
// Development default only: MUST change ADMIN_PASSWORD for real use.
export const config = {
  password: process.env.ADMIN_PASSWORD || "parol",
  port: Number(process.env.PORT) || 3000,
};

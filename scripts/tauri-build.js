const { execSync } = require("child_process");

const env = { ...process.env, NEXT_DISABLE_TURBOPACK: "1" };

execSync("next build", {
  stdio: "inherit",
  env,
});

// Usage: npm run hash-password -- 'the shared password'
// Prints the value to store with `wrangler secret put SITE_PASSWORD_HASH`.
import { hashPassword } from "../src/auth.ts";

const pw = process.argv[2];
if (!pw) {
  console.error("Usage: npm run hash-password -- 'the shared password'");
  process.exit(1);
}
console.log(await hashPassword(pw));

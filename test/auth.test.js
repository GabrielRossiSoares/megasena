const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const html = fs.readFileSync(path.join(__dirname, "..", "public", "index.html"), "utf8");

test("dashboard oferece recuperação e redefinição segura de senha", () => {
  assert.match(html, /id="resetPasswordModal"/);
  assert.match(html, /sb\.auth\.resetPasswordForEmail\(email, \{ redirectTo \}\)/);
  assert.match(html, /event === "PASSWORD_RECOVERY"/);
  assert.match(html, /sb\.auth\.updateUser\(\{ password \}\)/);
  assert.match(html, /autocomplete="new-password"/);
});

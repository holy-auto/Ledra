// Self-test for the crJSON harness. Run from the repo root after `./setup.sh && cargo build --release`:
//   node tools/c2pa-crjson-harness/selftest.mjs
// Builds a throwaway signing CA and TSA with openssl, signs two JPEGs with c2pa-node (one with a
// time-stamp from a local TSA), then checks that each harness input changes the crJSON result.
import { execFileSync, spawn } from "node:child_process";
import { createPrivateKey, sign as ecSign } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import sharp from "sharp";
import { Builder, CallbackSigner } from "@contentauth/c2pa-node";

const here = dirname(fileURLToPath(import.meta.url));
const harness = join(here, "target/release/c2pa-crjson-harness");
const d = mkdtempSync(join(tmpdir(), "crjson-selftest-"));
const f = (n) => join(d, n);
const ossl = (...a) => execFileSync("openssl", a, { stdio: ["ignore", "ignore", "inherit"] });

writeFileSync(
  f("ext.cnf"),
  `[ca]
basicConstraints=critical,CA:TRUE
keyUsage=critical,keyCertSign,cRLSign
subjectKeyIdentifier=hash
[leaf]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=emailProtection
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid:always
[tsa]
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,nonRepudiation
extendedKeyUsage=critical,timeStamping
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid:always
`,
);
function issue(name, ext, days, ca) {
  ossl("genpkey", "-algorithm", "EC", "-pkeyopt", "ec_paramgen_curve:P-256", "-out", f(`${name}.key`));
  ossl("req", "-new", "-key", f(`${name}.key`), "-subj", `/O=Ledra selftest/CN=${name}`, "-out", f(`${name}.csr`));
  const sign = ca ? ["-CA", f(`${ca}.pem`), "-CAkey", f(`${ca}.key`)] : ["-key", f(`${name}.key`)];
  ossl(
    "x509",
    "-req",
    "-in",
    f(`${name}.csr`),
    ...sign,
    "-days",
    `${days}`,
    "-extfile",
    f("ext.cnf"),
    "-extensions",
    ext,
    "-out",
    f(`${name}.pem`),
  );
}
issue("root", "ca", 3650);
issue("signer", "leaf", 30, "root");
issue("tsaroot", "ca", 3650);
issue("tsa", "tsa", 3650, "tsaroot");
writeFileSync(f("empty.pem"), "");
writeFileSync(f("both.pem"), readFileSync(f("root.pem"), "utf8") + readFileSync(f("tsaroot.pem"), "utf8"));
writeFileSync(f("tsaserial"), "01\n");
writeFileSync(
  f("tsa.cnf"),
  `[tsa]
default_tsa=t
[t]
serial=${f("tsaserial")}
signer_cert=${f("tsa.pem")}
signer_key=${f("tsa.key")}
signer_digest=sha256
default_policy=1.2.3.4.1
digests=sha256,sha384,sha512
ess_cert_id_alg=sha256
`,
);

// Local RFC 3161 TSA in a child process, so a failure here cannot leave it serving.
const tsaServer = spawn(
  process.execPath,
  [
    "-e",
    `const http=require("http"),fs=require("fs"),{execFileSync}=require("child_process"),d=process.argv[1];
     http.createServer((q,r)=>{const b=[];q.on("data",c=>b.push(c));q.on("end",()=>{
       fs.writeFileSync(d+"/q.tsq",Buffer.concat(b));
       execFileSync("openssl",["ts","-reply","-config",d+"/tsa.cnf","-queryfile",d+"/q.tsq","-out",d+"/r.tsr"],{stdio:"ignore"});
       r.writeHead(200,{"Content-Type":"application/timestamp-reply"});r.end(fs.readFileSync(d+"/r.tsr"));});
     }).listen(0,"127.0.0.1",function(){console.log(this.address().port)});`,
    d,
  ],
  { stdio: ["ignore", "pipe", "inherit"] },
);
const port = await new Promise((res) => tsaServer.stdout.once("data", (b) => res(String(b).trim())));

try {
  const jpeg = await sharp({ create: { width: 16, height: 16, channels: 3, background: "#888" } })
    .jpeg()
    .toBuffer();
  async function sign(tsaUrl, parent) {
    const b = Builder.withJson({
      claim_generator_info: [{ name: "Ledra harness selftest", version: "1.0", specVersion: "2.4" }],
      assertions: [
        {
          label: "c2pa.actions",
          created: true,
          data: {
            allActionsIncluded: true,
            actions: parent
              ? [{ action: "c2pa.opened", parameters: { ingredientIds: ["parent"] } }]
              : [
                  {
                    action: "c2pa.created",
                    digitalSourceType: "http://cv.iptc.org/newscodes/digitalsourcetype/digitalCapture",
                  },
                ],
          },
        },
      ],
    });
    if (parent) {
      await b.addIngredient(JSON.stringify({ title: "parent", relationship: "parentOf", label: "parent" }), {
        buffer: parent,
        mimeType: "image/jpeg",
      });
    }
    // Only the async signing path can call a TSA in c2pa-node 0.9.7.
    const key = createPrivateKey(readFileSync(f("signer.key")));
    const cert = readFileSync(f("signer.pem"));
    const signer = CallbackSigner.newSigner(
      { alg: "es256", certs: [cert], reserveSize: 20000, directCoseHandling: false, ...(tsaUrl && { tsaUrl }) },
      async (data) => ecSign("sha256", data, { key, dsaEncoding: "ieee-p1363" }),
    );
    const out = { buffer: null };
    await b.signAsync(signer, { buffer: jpeg, mimeType: "image/jpeg" }, out);
    return out.buffer;
  }
  writeFileSync(f("plain.jpg"), await sign(undefined));
  writeFileSync(f("stamped.jpg"), await sign(`http://127.0.0.1:${port}`));
  writeFileSync(f("derived.jpg"), await sign(undefined, readFileSync(f("plain.jpg"))));
  writeFileSync(f("derived2.jpg"), await sign(undefined, readFileSync(f("derived.jpg"))));
} finally {
  tsaServer.kill();
}

const now = new Date().toISOString();
const later = new Date(Date.now() + 2 * 365 * 86400e3).toISOString(); // after the 30-day signer expires
function run(asset, trust, tsaTrust, time) {
  const out = JSON.parse(execFileSync(harness, [f(asset), f(trust), f(tsaTrust), time], { encoding: "utf8" }));
  const r = out.manifests[0].validationResults;
  const codes = (k) => (r[k] ?? []).map((s) => s.code);
  return { out, ok: [...codes("success"), ...codes("informational")], bad: codes("failure") };
}

const trusted = run("plain.jpg", "root.pem", "empty.pem", now);
assert.ok(trusted.out["@context"], "crJSON document");
assert.ok(trusted.ok.includes("signingCredential.trusted"), "signer chains to the C2PA trust list");
assert.deepEqual(trusted.bad, []);

assert.ok(
  run("plain.jpg", "empty.pem", "empty.pem", now).bad.includes("signingCredential.untrusted"),
  "empty trust list",
);

const expired = run("plain.jpg", "root.pem", "empty.pem", later);
assert.ok(expired.bad.includes("signingCredential.expired"), "validation time after the signer's notAfter");
assert.ok(JSON.stringify(expired.out).includes(later.slice(0, 19)), "validation time is reported");

const stamped = run("stamped.jpg", "root.pem", "tsaroot.pem", later);
assert.ok(stamped.ok.includes("timeStamp.trusted"), "TSA chains to the TSA trust list");
assert.ok(
  !stamped.bad.includes("signingCredential.expired"),
  "signer validity is judged at the time-stamp, not the validation time",
);

const tsaRootOnlyInC2paList = run("stamped.jpg", "both.pem", "empty.pem", now);
assert.ok(!tsaRootOnlyInC2paList.ok.includes("timeStamp.trusted"), "C2PA trust list does not vouch for TSAs");

// Ingredient manifests whose results match what their ingredient assertion recorded at signing (same trust,
// signer still valid) get no delta; crjson.rs fills their validationTime from a separate fallback.
const soon = new Date(Date.now() + 86400e3).toISOString();
const derived = run("derived2.jpg", "empty.pem", "empty.pem", soon).out;
assert.equal(derived.manifests.length, 3, "asset carries two levels of ingredient manifests");
for (const m of derived.manifests) {
  assert.equal(Date.parse(m.validationResults.validationTime), Date.parse(soon), `validationTime of ${m.label}`);
}

console.log("crJSON harness selftest: 6 cases passed");

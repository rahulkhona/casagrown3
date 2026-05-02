const b64 = btoa('{"role":"service_role"}'); // -> eyJyb2xlIjoic2VydmljZV9yb2xlIn0=
const unpadded = b64.replace(/=/g, ''); // -> eyJyb2xlIjoic2VydmljZV9yb2xlIn0
try {
  console.log("With padding:", atob(b64));
  console.log("Without padding:", atob(unpadded));
} catch (e) {
  console.log("Error:", e);
}

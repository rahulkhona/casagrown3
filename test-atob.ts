const token = Deno.env.get("KEY");
const parts = token!.split('.');
try {
  let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const payload = JSON.parse(atob(base64));
  console.log("Success:", payload);
} catch (e) {
  console.log("Error:", e);
}

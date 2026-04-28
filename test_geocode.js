const fetch = require('node-fetch');
async function run() {
  const address = "974 Wallace Drive, San Jose, CA, 95120";
  const url = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&q=${encodeURIComponent(address)}&limit=1&countrycodes=us`;
  const res = await fetch(url, { headers: { 'User-Agent': 'CasaGrown-Test' } });
  const data = await res.json();
  console.log("Geocode:", data);
}
run().catch(console.error);

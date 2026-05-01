const res = await fetch("https://fzdmszvfeewpwswlnfyk.supabase.co/rest/v1/rpc/get_pending_payouts_admin", {
  method: "POST",
  headers: {
    "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZG1zenZmZWV3cHdzd2xuZnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc4ODEzNywiZXhwIjoyMDg5MzY0MTM3fQ.VhuNp3gix8XSJ1PvPD0DZ3NEMXq8MU_sK-j86X6Ry44",
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6ZG1zenZmZWV3cHdzd2xuZnlrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzc4ODEzNywiZXhwIjoyMDg5MzY0MTM3fQ.VhuNp3gix8XSJ1PvPD0DZ3NEMXq8MU_sK-j86X6Ry44",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({})
});

const text = await res.text();
console.log("Status:", res.status);
console.log("Response:", text);

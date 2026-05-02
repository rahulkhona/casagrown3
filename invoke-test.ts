const res = await fetch('http://127.0.0.1:54321/functions/v1/process-selected-payouts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'
  },
  body: JSON.stringify({ redemption_ids: ['e83dd71d-55e1-455b-a7eb-402927233ba0'] })
});
console.log(res.status, await res.text());

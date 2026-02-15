import { jsonOk, serveWithCors } from "../_shared/serve-with-cors.ts";

serveWithCors(async (req, { supabase, corsHeaders }) => {
  // 1. Fetch Countries
  console.log("Fetching countries...");
  const response = await fetch(
    "https://restcountries.com/v3.1/all?fields=cca3,name,currencies,idd",
  );
  const countriesData = await response.json();
  console.log("API Response Type:", typeof countriesData);
  console.log("Is Array?", Array.isArray(countriesData));
  if (!Array.isArray(countriesData)) {
    console.log(
      "Response sample:",
      JSON.stringify(countriesData).slice(0, 200),
    );
    throw new Error("API response is not an array");
  }

  const countries = countriesData.map((c: any) => ({
    iso_3: c.cca3,
    name: c.name.common,
    currency_symbol: c.currencies
      ? Object.values(c.currencies)[0]?.symbol
      : null,
    phone_code: c.idd?.root ? `${c.idd.root}${c.idd.suffixes?.[0] || ""}` : "",
    updated_at: new Date(),
  }));

  // 2. Upsert Countries
  const { error } = await supabase
    .from("countries")
    .upsert(countries, { onConflict: "iso_3" });

  if (error) throw error;

  return jsonOk({
    success: true,
    count: countries.length,
    message: "Countries synced successfully",
  }, corsHeaders);
});

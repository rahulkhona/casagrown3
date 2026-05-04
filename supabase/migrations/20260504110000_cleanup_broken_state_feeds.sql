-- Remove stale quarantine records from broken FL/TX/PA ArcGIS feeds.
-- These endpoints returned Invalid URL errors and were never official state
-- agriculture department feeds. Bot-fetched records from these sources
-- are unreliable and should be purged.
-- FL and TX have no replacement public GIS API (manual admin entry needed).
-- PA is replaced with official PA Dept of Agriculture services.

DELETE FROM quarantine_zones
WHERE data_source IN ('FL_ARCGIS', 'TX_ARCGIS', 'PA_ARCGIS')
  AND created_by_admin = false;
